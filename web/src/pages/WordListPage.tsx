import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Archive, Volume2, Loader2 } from 'lucide-react'
import { playTTS, stopTTS, type VoiceType } from '@/services/AudioService'
import { loadSettings } from '@/services/SettingsService'
import { useWords } from '@/hooks/useWords'
import { SwipeToDelete } from '@/components/SwipeToDelete'
import { UNDO_TOAST_MS } from '@/lib/ui'
import { archiveWord, returnToList, trashWord } from '@/services/WordRepository'
import type { Word } from '@/types/word'

const appVersion = import.meta.env.VITE_APP_VERSION ?? '—'
const appEnv = import.meta.env.VITE_APP_ENV ?? '—'

const LETTERS = ['ALL', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')]

/** The two ways a word leaves the list. */
const REMOVALS = {
  trash: {
    act: (id: string) => trashWord(id),
    done: (word: string) => `「${word}」をゴミ箱に移動しました`,
    failed: 'ゴミ箱に移動できませんでした',
  },
  archive: {
    act: (id: string) => archiveWord(id),
    done: (word: string) => `「${word}」をアーカイブしました`,
    failed: 'アーカイブできませんでした',
  },
} as const

type Removal = keyof typeof REMOVALS

export default function WordListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [activeLetter, setActiveLetter] = useState('ALL')
  const [playingId, setPlayingId] = useState<string | null>(null) // `${id}-en` | `${id}-ja`

  const wordsState = useWords()
  // Trashing or archiving hides the word here instead of reloading, so the list does not flash.
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set())
  // Undo covers the most recent removal only; earlier ones stay restorable from the trash and archive pages.
  const [toast, setToast] = useState<{ text: string; undo: { word: Word; removal: Removal } | null } | null>(null)
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const words = (wordsState.status === 'ready' ? wordsState.data : []).filter((w) => !removedIds.has(w.id))

  const filtered = words.filter((w) => {
    const matchesSearch =
      search === '' ||
      w.word.toLowerCase().includes(search.toLowerCase()) ||
      w.meaning.includes(search) ||
      w.phonetic.includes(search)
    const matchesLetter =
      activeLetter === 'ALL' || w.word.toUpperCase().startsWith(activeLetter)
    return matchesSearch && matchesLetter
  })

  // Stop audio on unmount
  useEffect(() => {
    return () => { stopTTS() }
  }, [])

  async function play(id: string, text: string, lang: 'en' | 'ja', e: React.MouseEvent) {
    e.stopPropagation()
    const key = `${id}-${lang}`
    if (playingId) return
    setPlayingId(key)
    const s = loadSettings()
    try {
      await playTTS(text, {
        voice: (lang === 'en' ? s.enVoice : s.jaVoice) as VoiceType,
        speakerId: s.voicevoxStyle,
        apiKey: s.voicevoxApiKey || (import.meta.env.VITE_VOICEVOX_API_KEY_POC ?? ''),
        lang,
      })
    } catch (err) {
      console.error('[WordListPage] playback failed:', err)
    } finally {
      setPlayingId(null)
    }
  }

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), UNDO_TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  async function remove(word: Word, removal: Removal) {
    // Its card is about to go, taking the only control that could stop it.
    if (playingId?.startsWith(`${word.id}-`)) {
      stopTTS()
      setPlayingId(null)
    }
    const { act, done, failed } = REMOVALS[removal]
    try {
      await act(word.id)
      setRemovedIds((prev) => new Set(prev).add(word.id))
      setToast({ text: done(word.word), undo: { word, removal } })
    } catch (err) {
      console.error(`[WordListPage] ${removal} failed:`, err)
      // An undo still pending for an earlier word stays usable.
      setToast((prev) => ({ text: failed, undo: prev?.undo ?? null }))
      throw err
    }
  }

  async function undo() {
    const pending = toast?.undo
    if (!pending) return
    try {
      // The word was on the list before, so undo clears both dates, whichever was set.
      await returnToList(pending.word.id)
      setRemovedIds((prev) => {
        const next = new Set(prev)
        next.delete(pending.word.id)
        return next
      })
      setToast(null)
    } catch (err) {
      console.error('[WordListPage] undo failed:', err)
      setToast({ text: '元に戻せませんでした', undo: pending }) // keeps the button so it can be retried
    }
  }

  return (
    <div className="min-h-screen bg-[var(--ios-grouped-bg)]">
      {/* Header */}
      <header className="bg-[var(--ios-grouped-bg)] sticky top-0 z-10 pt-4 pb-2 px-4 max-w-2xl mx-auto">
        <div className="flex items-baseline justify-between mb-2">
          <h1 className="text-2xl font-bold tracking-tight">単語一覧</h1>
          <span className="text-[10px] text-muted-foreground">
            v{appVersion} · {appEnv}
          </span>
        </div>

        {/* Search */}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="単語・日本語訳・発音記号を検索…"
          className="bg-white h-9 text-sm rounded-xl"
        />

        {/* Letter filter */}
        <div className="mt-2 -mx-4 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1.5 px-4 pb-1">
            {LETTERS.map((l) => (
              <button
                key={l}
                onClick={() => setActiveLetter(l)}
                className={cn(
                  'shrink-0 h-7 min-w-[28px] px-2 rounded-full text-xs font-medium transition-colors',
                  activeLetter === l
                    ? 'bg-[var(--ios-blue)] text-white'
                    : 'bg-white text-muted-foreground hover:bg-muted',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <p className="text-xs text-muted-foreground mt-2">
          {filtered.length} 単語 · {filtered.reduce((s, w) => s + w.sentences.length, 0)} 例文
        </p>
      </header>

      {/* Fixed above the tab bar, so undo stays visible after trashing a word far down the list */}
      {toast && (
        <div className="fixed inset-x-0 bottom-20 z-20 px-4 pointer-events-none">
          <div
            role="status"
            className="max-w-2xl mx-auto bg-neutral-800 text-white rounded-2xl pl-4 pr-2 py-1.5 flex items-center justify-between gap-2 shadow-lg pointer-events-auto"
          >
            <p className="text-sm truncate py-1">
              {toast.text}
            </p>
            {toast.undo && (
              <Button size="sm" variant="ghost" className="shrink-0 text-[var(--ios-blue)] hover:bg-white/10" onClick={undo}>
                元に戻す
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Word list */}
      <main
        className={cn('max-w-2xl mx-auto px-4 space-y-2', toast ? 'pb-20' : 'pb-4')}
        onPointerDownCapture={(e) => {
          // Touching anywhere but the open row closes it, as on iOS.
          if (openSwipeId && !(e.target as Element).closest('[data-swipe-open="true"]')) setOpenSwipeId(null)
        }}
      >
        {wordsState.status === 'loading' ? null : wordsState.status === 'error' ? (
          <p className="text-sm text-muted-foreground text-center py-12">単語データを読み込めませんでした</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">該当する単語がありません</p>
        ) : (
          filtered.map((word) => (
            <SwipeToDelete
              key={word.id}
              open={openSwipeId === word.id}
              onOpenChange={(open) => setOpenSwipeId(open ? word.id : null)}
              onDelete={() => remove(word, 'trash')}
              deleteLabel={`「${word.word}」をゴミ箱へ移動`}
              secondaryAction={{
                label: 'アーカイブ',
                ariaLabel: `「${word.word}」をアーカイブ`,
                icon: <Archive size={18} />,
                className: 'text-[var(--ios-teal)] bg-[var(--ios-teal)]/12',
                onAction: () => remove(word, 'archive'),
              }}
            >
            <div
              role="button"
              tabIndex={0}
              aria-label={`${word.word} — 例文一覧へ`}
              onClick={() => navigate(`/words/${word.id}/sentences`)}
              onKeyDown={(e) => {
                // Keys pressed on the buttons inside the card belong to those buttons.
                if (e.target !== e.currentTarget) return
                if (e.key === 'Delete' || e.key === 'Backspace') {
                  e.preventDefault()
                  void remove(word, 'trash').catch(() => {})
                  return
                }
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate(`/words/${word.id}/sentences`)
                }
              }}
              className="bg-white px-4 py-3 flex items-center gap-3 cursor-pointer active:opacity-70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ios-blue)]"
            >
              {/* Left: text info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base leading-tight">{word.word}</span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 bg-[var(--ios-orange)]/15 text-[var(--ios-orange)] border-0"
                  >
                    {word.sentences.length}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{word.phonetic}</p>
                <p className="text-sm text-[var(--ios-blue)] mt-0.5 truncate">{word.meaning}</p>
              </div>

              {/* Right: speaker buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                {(['en', 'ja'] as const).map((lang) => {
                  const key = `${word.id}-${lang}`
                  const isPlaying = playingId === key
                  return (
                    <Button
                      key={lang}
                      size="sm"
                      variant="ghost"
                      disabled={!!playingId}
                      onClick={(e) => play(word.id, lang === 'en' ? word.word : word.meaning, lang, e)}
                      className={cn(
                        'h-8 px-2 rounded-lg',
                        lang === 'en'
                          ? 'text-[var(--ios-blue)] hover:bg-[var(--ios-blue)]/10'
                          : 'text-[var(--ios-orange)] hover:bg-[var(--ios-orange)]/10',
                      )}
                      title={lang === 'en' ? '英語を再生' : '日本語を再生'}
                    >
                      {isPlaying
                        ? <Loader2 size={15} className="animate-spin" />
                        : <Volume2 size={15} />}
                      <span className="text-[11px] font-medium ml-0.5">
                        {lang.toUpperCase()}
                      </span>
                    </Button>
                  )
                })}
              </div>
            </div>
            </SwipeToDelete>
          ))
        )}
      </main>
    </div>
  )
}
