import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Volume2, Loader2 } from 'lucide-react'
import { playTTS, type VoiceType } from '@/services/AudioService'
import { loadSettings } from '@/services/SettingsService'

const appVersion = import.meta.env.VITE_APP_VERSION ?? '—'
const appEnv = import.meta.env.VITE_APP_ENV ?? '—'

const SAMPLE_WORDS = [
  { id: '1', word: 'rarity',      meaning: '珍しさ・希少性',          phonetic: 'ˈreər.ɪ.ti',        sentences: 30 },
  { id: '2', word: 'experience',  meaning: '経験、体験',              phonetic: 'ɪkˈspɪər.i.əns',    sentences: 40 },
  { id: '3', word: 'perspective', meaning: '視点・観点',              phonetic: 'pəˈspek.tɪv',        sentences: 12 },
  { id: '4', word: 'accomplish',  meaning: '達成する・成し遂げる',    phonetic: 'əˈkʌm.plɪʃ',         sentences: 12 },
  { id: '5', word: 'remarkable',  meaning: '注目すべき・素晴らしい',  phonetic: 'rɪˈmɑːk.ə.bəl',      sentences: 10 },
  { id: '6', word: 'challenge',   meaning: '挑戦・困難',              phonetic: 'ˈtʃæl.ɪndʒ',         sentences: 12 },
  { id: '7', word: 'opportunity', meaning: '機会・チャンス',          phonetic: 'ˌɒp.əˈtjuː.nɪ.ti',  sentences: 12 },
]

const LETTERS = ['ALL', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')]

export default function WordListPage() {
  const [search, setSearch] = useState('')
  const [activeLetter, setActiveLetter] = useState('ALL')
  const [playingId, setPlayingId] = useState<string | null>(null) // `${id}-en` | `${id}-ja`

  const filtered = SAMPLE_WORDS.filter((w) => {
    const matchesSearch =
      search === '' ||
      w.word.toLowerCase().includes(search.toLowerCase()) ||
      w.meaning.includes(search) ||
      w.phonetic.includes(search)
    const matchesLetter =
      activeLetter === 'ALL' || w.word.toUpperCase().startsWith(activeLetter)
    return matchesSearch && matchesLetter
  })

  async function play(id: string, text: string, lang: 'en' | 'ja') {
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
          {filtered.length} 単語 · {filtered.reduce((s, w) => s + w.sentences, 0)} 例文
        </p>
      </header>

      {/* Word list */}
      <main className="max-w-2xl mx-auto px-4 pb-4 space-y-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">該当する単語がありません</p>
        ) : (
          filtered.map((word) => (
            <div
              key={word.id}
              className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 cursor-pointer active:opacity-70 transition-opacity"
            >
              {/* Left: text info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base leading-tight">{word.word}</span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 bg-[var(--ios-orange)]/15 text-[var(--ios-orange)] border-0"
                  >
                    {word.sentences}
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
                      onClick={() => play(word.id, lang === 'en' ? word.word : word.meaning, lang)}
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
          ))
        )}
      </main>
    </div>
  )
}
