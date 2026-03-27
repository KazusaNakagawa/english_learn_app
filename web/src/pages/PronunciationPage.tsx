import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router'
import { ChevronLeft, Volume2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { playTTS, stopTTS, type VoiceType } from '@/services/AudioService'
import { loadSettings } from '@/services/SettingsService'
import { SAMPLE_WORDS } from '@/data/sampleWords'

export default function PronunciationPage() {
  const { id, sentenceId } = useParams<{ id: string; sentenceId: string }>()
  const navigate = useNavigate()

  const word = SAMPLE_WORDS.find((w) => w.id === id)
  const sentence = word?.sentences.find((s) => s.id === sentenceId)

  const [playingLang, setPlayingLang] = useState<'en' | 'ja' | null>(null)

  // Stop audio on unmount
  useEffect(() => {
    return () => { stopTTS() }
  }, [])

  if (!word || !sentence) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">例文が見つかりません</p>
        <button
          onClick={() => navigate(`/words/${id}/sentences`)}
          className="mt-2 text-sm text-[var(--ios-blue)]"
        >
          例文一覧に戻る
        </button>
      </div>
    )
  }

  async function play(lang: 'en' | 'ja') {
    if (playingLang) return
    setPlayingLang(lang)
    const s = loadSettings()
    const resolvedVvKey = s.voicevoxApiKey || (import.meta.env.VITE_VOICEVOX_API_KEY_POC ?? '')
    try {
      await playTTS(lang === 'en' ? sentence!.english : sentence!.japanese, {
        voice: (lang === 'en' ? s.enVoice : s.jaVoice) as VoiceType,
        speakerId: s.voicevoxStyle,
        apiKey: resolvedVvKey,
        lang,
      })
    } catch (err) {
      console.error('[PronunciationPage] playback failed:', err)
    } finally {
      setPlayingLang(null)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--ios-grouped-bg)]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[var(--ios-grouped-bg)] px-4 pt-4 pb-2 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => navigate(`/words/${id}/sentences`)}
            className="flex items-center gap-0.5 text-[var(--ios-blue)] text-sm font-medium"
          >
            <ChevronLeft size={18} />
            例文一覧
          </button>
        </div>
        <h1 className="text-xl font-bold text-center">発音練習</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-8 space-y-4">
        {/* Sentence card */}
        <div className="bg-white rounded-2xl px-6 py-8 text-center space-y-4">
          <p className="text-lg font-semibold leading-relaxed">{sentence.english}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{sentence.japanese}</p>

          {/* TTS buttons */}
          <div className="flex justify-center gap-3 pt-2">
            {(['en', 'ja'] as const).map((lang) => {
              const isPlaying = playingLang === lang
              return (
                <Button
                  key={lang}
                  size="sm"
                  disabled={!!playingLang}
                  onClick={() => play(lang)}
                  aria-label={lang === 'en' ? '英語を聞く' : '日本語を聞く'}
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
          </div>
        </div>

        {/* Word context */}
        <div className="bg-white rounded-2xl px-4 py-3 text-sm text-muted-foreground text-center">
          <span className="font-semibold text-foreground">{word.word}</span>
          {' — '}
          {word.meaning}
        </div>
      </main>
    </div>
  )
}
