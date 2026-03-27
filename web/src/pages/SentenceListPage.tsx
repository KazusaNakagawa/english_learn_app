import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { ChevronLeft, Volume2, Loader2, Play, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { playTTS, stopTTS, type VoiceType } from '@/services/AudioService'
import { loadSettings } from '@/services/SettingsService'
import { SAMPLE_WORDS, type Sentence } from '@/data/sampleWords'

// ---- Helpers ----

function groupByCategory(sentences: Sentence[]): [string, Sentence[]][] {
  const map = new Map<string, Sentence[]>()
  for (const s of sentences) {
    const key = s.category || 'その他'
    const arr = map.get(key) ?? []
    arr.push(s)
    map.set(key, arr)
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
}

// ---- Page ----

export default function SentenceListPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const word = SAMPLE_WORDS.find((w) => w.id === id)

  const [playingId, setPlayingId] = useState<string | null>(null) // sentence id or `word-en` / `word-ja`
  const sentenceRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const cancelRef = useRef(false)

  // Scroll active sentence into view
  useEffect(() => {
    if (!playingId || playingId.startsWith('word-')) return
    sentenceRefs.current[playingId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [playingId])

  if (!word) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">単語が見つかりません</p>
        <button onClick={() => navigate('/')} className="mt-2 text-sm text-[var(--ios-blue)]">
          一覧に戻る
        </button>
      </div>
    )
  }

  const grouped = groupByCategory(word.sentences)
  const flatSentences = grouped.flatMap(([, sents]) => sents)
  const s = loadSettings()
  const resolvedVvKey = s.voicevoxApiKey || (import.meta.env.VITE_VOICEVOX_API_KEY_POC ?? '')

  function doStop() {
    cancelRef.current = true
    stopTTS()
    setPlayingId(null)
  }

  async function playWord(lang: 'en' | 'ja') {
    const key = `word-${lang}`
    if (playingId === key) { doStop(); return }
    if (playingId) return
    cancelRef.current = false
    setPlayingId(key)
    try {
      await playTTS(lang === 'en' ? word!.word : word!.meaning, {
        voice: (lang === 'en' ? s.enVoice : s.jaVoice) as VoiceType,
        speakerId: s.voicevoxStyle,
        apiKey: resolvedVvKey,
        lang,
      })
    } catch (err) {
      if (!cancelRef.current) console.error('[SentenceListPage] word playback failed:', err)
    } finally {
      setPlayingId((prev) => (prev === key ? null : prev))
    }
  }

  function sleep(sec: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, sec * 1000))
  }

  async function startPlaybackFrom(startIndex: number) {
    if (playingId) { doStop(); return }
    cancelRef.current = false
    for (let i = startIndex; i < flatSentences.length; i++) {
      if (cancelRef.current) break
      const sentence = flatSentences[i]
      setPlayingId(sentence.id)
      try {
        await playTTS(sentence.english, {
          voice: s.enVoice as VoiceType,
          speakerId: s.voicevoxStyle,
          apiKey: resolvedVvKey,
          lang: 'en',
        })
        if (s.playPattern === 'bilingual' && !cancelRef.current) {
          await sleep(s.intervalSec)
          if (!cancelRef.current) {
            await playTTS(sentence.japanese, {
              voice: s.jaVoice as VoiceType,
              speakerId: s.voicevoxStyle,
              apiKey: resolvedVvKey,
              lang: 'ja',
            })
          }
        }
      } catch (err) {
        if (!cancelRef.current) console.error('[SentenceListPage] sentence playback failed:', err)
        break
      }
    }
    if (!cancelRef.current) setPlayingId(null)
  }

  const isAnyPlaying = !!playingId

  return (
    <div className="min-h-screen bg-[var(--ios-grouped-bg)]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[var(--ios-grouped-bg)] px-4 pt-4 pb-2 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-0.5 text-[var(--ios-blue)] text-sm font-medium"
          >
            <ChevronLeft size={18} />
            単語一覧
          </button>
        </div>
        <h1 className="text-xl font-bold text-center">例文一覧</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-8 space-y-4">
        {/* Word info card */}
        <div className="bg-white rounded-2xl px-4 py-5 text-center space-y-1">
          <p className="text-3xl font-bold tracking-tight">{word.word}</p>
          <p className="text-sm text-muted-foreground font-mono">{word.phonetic}</p>
          <p className="text-base text-[var(--ios-blue)]">{word.meaning}</p>
          <div className="flex justify-center gap-3 pt-2">
            {(['en', 'ja'] as const).map((lang) => {
              const key = `word-${lang}`
              const isPlaying = playingId === key
              return (
                <Button
                  key={lang}
                  size="sm"
                  disabled={isAnyPlaying && !isPlaying}
                  onClick={() => playWord(lang)}
                  aria-label={
                    isPlaying
                      ? `「${lang === 'en' ? word.word : word.meaning}」の再生を停止`
                      : lang === 'en' ? '英語を聞く' : '日本語を聞く'
                  }
                  className={cn(
                    'rounded-full px-4 text-white',
                    lang === 'en'
                      ? 'bg-[var(--ios-blue)] hover:bg-[var(--ios-blue)]/90'
                      : 'bg-[var(--ios-orange)] hover:bg-[var(--ios-orange)]/90',
                  )}
                >
                  {isPlaying
                    ? <Loader2 size={14} className="animate-spin mr-1" />
                    : <Volume2 size={14} className="mr-1" />}
                  {lang === 'en' ? '英語を聞く' : '日本語を聞く'}
                </Button>
              )
            })}
            {/* Play all sentences button */}
            <Button
              size="sm"
              disabled={isAnyPlaying && !playingId}
              onClick={() => {
                if (isAnyPlaying) { doStop(); return }
                startPlaybackFrom(0)
              }}
              aria-label={isAnyPlaying ? '再生を停止' : '全例文を再生'}
              className="rounded-full px-4 bg-[var(--ios-teal)] hover:bg-[var(--ios-teal)]/90 text-white"
            >
              {isAnyPlaying && !playingId?.startsWith('word-')
                ? <><Square size={14} className="mr-1" fill="currentColor" />停止</>
                : <><Play size={14} className="mr-1" fill="currentColor" />全て再生</>}
            </Button>
          </div>
        </div>

        {/* Sentences grouped by category */}
        {grouped.map(([category, sentences]) => (
          <div key={category}>
            <p className="text-xs text-muted-foreground uppercase tracking-wide px-1 mb-1">
              {category}
            </p>
            <div className="bg-white rounded-2xl divide-y divide-border overflow-hidden">
              {sentences.map((sentence) => {
                const isPlaying = playingId === sentence.id
                const sentenceIndex = flatSentences.indexOf(sentence)
                return (
                  <div
                    key={sentence.id}
                    ref={(el) => { sentenceRefs.current[sentence.id] = el }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${sentence.english} — 発音練習へ`}
                    onClick={() => navigate(`/words/${id}/pronunciation/${sentence.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        navigate(`/words/${id}/pronunciation/${sentence.id}`)
                      }
                    }}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ios-blue)] focus-visible:ring-inset',
                      isPlaying && 'bg-[var(--ios-blue)]/8',
                    )}
                  >
                    {/* Text */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className={cn('text-sm leading-snug', isPlaying && 'font-medium text-[var(--ios-blue)]')}>
                        {sentence.english}
                      </p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        {sentence.japanese}
                      </p>
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 bg-[var(--ios-teal)]/15 text-[var(--ios-teal)] border-0"
                      >
                        {sentence.category}
                      </Badge>
                    </div>

                    {/* Play/Stop button */}
                    <button
                      aria-label={
                        isPlaying
                          ? `「${sentence.english}」の再生を停止`
                          : `「${sentence.english}」を再生`
                      }
                      disabled={isAnyPlaying && !isPlaying}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isPlaying) {
                          doStop()
                        } else {
                          startPlaybackFrom(sentenceIndex)
                        }
                      }}
                      className={cn(
                        'shrink-0 mt-0.5 w-8 h-8 flex items-center justify-center rounded-full transition-colors',
                        isPlaying
                          ? 'bg-[var(--ios-blue)] text-white'
                          : 'text-muted-foreground hover:bg-muted disabled:opacity-40',
                      )}
                    >
                      {isPlaying
                        ? <Square size={13} fill="currentColor" />
                        : <Play size={13} fill="currentColor" />}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        <p className="text-center text-xs text-muted-foreground pt-2">
          {word.sentences.length} 例文
        </p>
      </main>
    </div>
  )
}
