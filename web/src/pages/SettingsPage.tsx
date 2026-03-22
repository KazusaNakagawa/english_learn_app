import { useState, useEffect, useCallback } from 'react'
import { playTTS, type VoiceType } from '@/services/AudioService'
import { useNavigate } from 'react-router'
import { getCacheUsage, clearCache } from '@/services/AudioCacheService'
import { loadSettings, saveSettings, type AppSettings } from '@/services/SettingsService'
import {
  ChevronRight, FlaskConical, Volume2,
  Upload, Download, Trash2, FileText, Shield,
  CheckCircle2, TriangleAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const VOICEVOX_STYLES = [
  { id: '3',  label: 'ノーマル' },
  { id: '1',  label: 'あまあま' },
  { id: '7',  label: 'ツンツン' },
  { id: '5',  label: 'セクシー' },
  { id: '22', label: 'ささやき' },
  { id: '38', label: 'ヒソヒソ' },
]

const OPENAI_MODELS = [
  { id: 'gpt-4o-mini',  label: 'GPT-4o mini（高速・低コスト）' },
  { id: 'gpt-4o',       label: 'GPT-4o' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
]

const EN_VOICES  = ['デフォルト', '女性', '男性', 'ずんだもん'] as const
const JA_VOICES  = ['ずんだもん', 'デフォルト'] as const
const PATTERNS   = ['バイリンガル (EN+JA)', '英語のみ (EN+EN)'] as const

type EnVoice  = typeof EN_VOICES[number]
type JaVoice  = typeof JA_VOICES[number]
type Pattern  = typeof PATTERNS[number]

// ---- UI primitives ----

function SectionLabel({ label }: { label: string }) {
  return <p className="text-xs text-muted-foreground uppercase tracking-wide px-1 mb-1">{label}</p>
}

function GroupCard({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-2xl divide-y divide-border overflow-hidden">{children}</div>
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-4 py-3', className)}>{children}</div>
}

function ListRow({
  icon: Icon, iconColor, label, sublabel, value, chevron, onClick, destructive,
}: {
  icon?: React.ElementType
  iconColor?: string
  label: string
  sublabel?: string
  value?: string
  chevron?: boolean
  onClick?: () => void
  destructive?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
    >
      {Icon && <Icon size={18} className={cn('shrink-0', iconColor ?? 'text-[var(--ios-blue)]')} />}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm', destructive ? 'text-[var(--ios-red)]' : !Icon ? '' : 'text-[var(--ios-blue)]')}>
          {label}
        </p>
        {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
      </div>
      {value && <span className="text-sm text-muted-foreground">{value}</span>}
      {chevron && <ChevronRight size={16} className="text-muted-foreground shrink-0" />}
    </button>
  )
}

function SegmentedControl<T extends string>({
  options, value, onChange,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex bg-muted rounded-lg p-0.5 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            'flex-1 text-xs font-medium py-1.5 px-2 rounded-md transition-all',
            value === opt ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

// ---- Helpers ----

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0バイト'
  if (bytes < 1024) return `${bytes}バイト`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}


// ---- Page ----

const EN_VOICE_MAP: Record<string, EnVoice> = {
  female: '女性', male: '男性', zundamon: 'ずんだもん', default: 'デフォルト',
}
const EN_VOICE_RMAP: Record<EnVoice, string> = {
  '女性': 'female', '男性': 'male', 'ずんだもん': 'zundamon', 'デフォルト': 'default',
}
const JA_VOICE_MAP: Record<string, JaVoice> = { zundamon: 'ずんだもん', default: 'デフォルト' }
const JA_VOICE_RMAP: Record<JaVoice, string> = { 'ずんだもん': 'zundamon', 'デフォルト': 'default' }
const PATTERN_MAP: Record<string, Pattern> = { bilingual: 'バイリンガル (EN+JA)', 'en-only': '英語のみ (EN+EN)' }
const PATTERN_RMAP: Record<Pattern, string> = { 'バイリンガル (EN+JA)': 'bilingual', '英語のみ (EN+EN)': 'en-only' }

export default function SettingsPage() {
  const navigate = useNavigate()

  const [enVoice,   setEnVoiceRaw]   = useState<EnVoice>(() => { const s = loadSettings(); return EN_VOICE_MAP[s.enVoice] ?? '女性' })
  const [jaVoice,   setJaVoiceRaw]   = useState<JaVoice>(() => { const s = loadSettings(); return JA_VOICE_MAP[s.jaVoice] ?? 'ずんだもん' })
  const [pattern,   setPatternRaw]   = useState<Pattern>(() => { const s = loadSettings(); return PATTERN_MAP[s.playPattern] ?? 'バイリンガル (EN+JA)' })
  const [interval,  setIntervalSRaw] = useState(() => loadSettings().intervalSec)
  const [vvStyle,   setVvStyleRaw]   = useState(() => loadSettings().voicevoxStyle)
  const [vvKey,     setVvKeyRaw]     = useState(() => loadSettings().voicevoxApiKey)
  const [openAIKey, setOpenAIKeyRaw] = useState(() => loadSettings().openAIKey)
  const [aiModel,   setAiModelRaw]   = useState(() => loadSettings().openAIModel)
  const [playing,     setPlaying]    = useState(false)
  const [playError,   setPlayError]  = useState<string | null>(null)
  const [cacheError,  setCacheError] = useState<string | null>(null)
  const [cacheBytes,  setCacheBytes] = useState(0)

  // Wrappers that also persist to localStorage
  const setEnVoice = (v: EnVoice) => { setEnVoiceRaw(v); saveSettings({ enVoice: EN_VOICE_RMAP[v] as AppSettings['enVoice'] }) }
  const setJaVoice = (v: JaVoice) => { setJaVoiceRaw(v); saveSettings({ jaVoice: JA_VOICE_RMAP[v] as AppSettings['jaVoice'] }) }
  const setPattern = (v: Pattern) => { setPatternRaw(v); saveSettings({ playPattern: PATTERN_RMAP[v] as AppSettings['playPattern'] }) }
  const setIntervalS = (v: number) => { setIntervalSRaw(v); saveSettings({ intervalSec: v }) }
  const setVvStyle = (v: string)  => { setVvStyleRaw(v); saveSettings({ voicevoxStyle: v }) }
  const setVvKey   = (v: string)  => { setVvKeyRaw(v);   saveSettings({ voicevoxApiKey: v }) }
  const setOpenAIKey = (v: string) => { setOpenAIKeyRaw(v); saveSettings({ openAIKey: v }) }
  const setAiModel   = (v: string) => { setAiModelRaw(v);   saveSettings({ openAIModel: v }) }

  const refreshCacheUsage = useCallback(() => {
    getCacheUsage().then(setCacheBytes).catch(() => {})
  }, [])

  useEffect(() => { refreshCacheUsage() }, [refreshCacheUsage])

  const resolvedVvKey = vvKey || (import.meta.env.VITE_VOICEVOX_API_KEY_POC ?? '')

  async function playSample(text: string, lang: 'en' | 'ja') {
    if (playing) return
    setPlaying(true)
    setPlayError(null)
    try {
      const voice = (lang === 'en' ? EN_VOICE_RMAP[enVoice] : JA_VOICE_RMAP[jaVoice]) as VoiceType
      await playTTS(text, { voice, speakerId: vvStyle, apiKey: resolvedVvKey, lang })
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : '再生に失敗しました')
    } finally {
      setPlaying(false)
      refreshCacheUsage()
    }
  }

  const patternDesc = pattern === 'バイリンガル (EN+JA)'
    ? 'バイリンガル: 英語 → 日本語 → 英語 の順で再生します'
    : '英語のみ: 英語のみ 2 回繰り返します'

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <header className="sticky top-0 bg-[var(--ios-grouped-bg)] py-3 z-10">
        <h1 className="text-xl font-bold">設定</h1>
      </header>

      <div className="mt-4 space-y-6">

        {/* 英語の音声設定 */}
        <div>
          <SectionLabel label="英語の音声設定" />
          <GroupCard>
            <Row><SegmentedControl options={EN_VOICES} value={enVoice} onChange={setEnVoice} /></Row>
            <Row>
              <Button
                className="w-full bg-[var(--ios-blue)] hover:bg-[var(--ios-blue)]/90 text-white"
                disabled={playing}
                onClick={() => playSample('This is a sample of the English voice.', 'en')}
              >
                <Volume2 size={16} className="mr-1.5" />英語サンプルを再生
              </Button>
              {playError && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <TriangleAlert size={13} className="text-[var(--ios-red)] shrink-0" />
                  <p className="text-xs text-[var(--ios-red)]">{playError}</p>
                </div>
              )}
            </Row>
          </GroupCard>
        </div>

        {/* 日本語の音声設定 */}
        <div>
          <SectionLabel label="日本語の音声設定" />
          <GroupCard>
            <Row><SegmentedControl options={JA_VOICES} value={jaVoice} onChange={setJaVoice} /></Row>
            <Row>
              <Button
                className="w-full bg-[var(--ios-blue)] hover:bg-[var(--ios-blue)]/90 text-white"
                disabled={playing}
                onClick={() => playSample('これは日本語の音声サンプルです。', 'ja')}
              >
                <Volume2 size={16} className="mr-1.5" />日本語サンプルを再生
              </Button>
            </Row>
          </GroupCard>
        </div>

        {/* 連続再生設定 */}
        <div>
          <SectionLabel label="連続再生設定" />
          <GroupCard>
            <Row><SegmentedControl options={PATTERNS} value={pattern} onChange={setPattern} /></Row>
            <Row>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm">例文間の間隔</span>
                <span className="text-sm text-muted-foreground">{interval.toFixed(1)}秒</span>
              </div>
              <input
                type="range" min={0.5} max={5.0} step={0.5} value={interval}
                onChange={(e) => setIntervalS(Number(e.target.value))}
                className="w-full accent-[var(--ios-blue)]"
              />
            </Row>
            <Row>
              <p className="text-xs text-muted-foreground">連続再生時の音声パターンを選択できます</p>
              <p className="text-xs text-muted-foreground mt-1">{patternDesc}</p>
            </Row>
          </GroupCard>
        </div>

        {/* VOICEVOX設定 */}
        <div>
          <SectionLabel label="VOICEVOX設定" />
          <GroupCard>
            <Row>
              <div className="flex items-center justify-between">
                <span className="text-sm">スタイル</span>
                <select
                  className="text-sm text-muted-foreground bg-transparent border-0 outline-none cursor-pointer"
                  value={vvStyle} onChange={(e) => setVvStyle(e.target.value)}
                >
                  {VOICEVOX_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            </Row>
            <Row>
              <Input
                type="password" placeholder="APIキー" value={vvKey}
                onChange={(e) => setVvKey(e.target.value)}
                className="border-0 shadow-none px-0 focus-visible:ring-0 text-sm"
              />
              {!vvKey && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <TriangleAlert size={13} className="text-[var(--ios-orange)] shrink-0" />
                  <p className="text-xs text-[var(--ios-orange)]">AppConfigのキーを使用中（設定で上書き可）</p>
                </div>
              )}
            </Row>
            <Row><p className="text-xs text-muted-foreground">© VOICEVOX:ずんだもん</p></Row>
          </GroupCard>
        </div>

        {/* OpenAI API設定 */}
        <div>
          <SectionLabel label="OpenAI API設定" />
          <GroupCard>
            <Row>
              <Input
                type="password" placeholder="APIキー" value={openAIKey}
                onChange={(e) => setOpenAIKey(e.target.value)}
                className="border-0 shadow-none px-0 focus-visible:ring-0 text-sm"
              />
              {openAIKey && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <CheckCircle2 size={13} className="text-[var(--ios-green)] shrink-0" />
                  <p className="text-xs text-[var(--ios-green)]">APIキーが設定されています</p>
                </div>
              )}
            </Row>
          </GroupCard>
        </div>

        {/* AIモデル設定 */}
        <div>
          <SectionLabel label="AIモデル設定" />
          <GroupCard>
            <Row>
              <p className="text-xs text-muted-foreground mb-1">使用モデル</p>
              <select
                className="w-full text-sm text-[var(--ios-blue)] bg-transparent border-0 outline-none cursor-pointer"
                value={aiModel} onChange={(e) => setAiModel(e.target.value)}
              >
                {OPENAI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Row>
          </GroupCard>
        </div>

        {/* 例文生成の条件 */}
        <div>
          <SectionLabel label="例文生成の条件" />
          <GroupCard>
            <ListRow label="プリセット管理" value="一般" chevron />
          </GroupCard>
        </div>

        {/* データ管理 */}
        <div>
          <SectionLabel label="データ管理" />
          <GroupCard>
            <ListRow icon={Upload}  label="単語リストをエクスポート" />
            <ListRow icon={Download} label="単語リストをインポート" />
            <Row>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">音声キャッシュ</span>
                <span className="text-sm text-muted-foreground">{formatBytes(cacheBytes)}</span>
              </div>
            </Row>
            <ListRow
              icon={Trash2}
              iconColor="text-[var(--ios-red)]"
              label="キャッシュをクリア"
              destructive
              onClick={() => {
                setCacheError(null)
                clearCache()
                  .then(() => refreshCacheUsage())
                  .catch((err) => setCacheError(err instanceof Error ? err.message : 'キャッシュのクリアに失敗しました'))
              }}
            />
            {cacheError && (
              <Row>
                <div className="flex items-center gap-1.5">
                  <TriangleAlert size={13} className="text-[var(--ios-red)] shrink-0" />
                  <p className="text-xs text-[var(--ios-red)]">{cacheError}</p>
                </div>
              </Row>
            )}
          </GroupCard>
        </div>

        {/* 法的情報 */}
        <div>
          <SectionLabel label="法的情報" />
          <GroupCard>
            <ListRow icon={Shield}   label="プライバシーポリシー" chevron />
            <ListRow icon={FileText} label="利用規約"             chevron />
          </GroupCard>
        </div>

        {/* Developer Tools */}
        <div>
          <SectionLabel label="Developer Tools" />
          <GroupCard>
            <ListRow
              icon={FlaskConical}
              label="Phase 0 Validation"
              sublabel="Web Speech API · IndexedDB · VOICEVOX CORS"
              chevron
              onClick={() => navigate('/poc')}
            />
          </GroupCard>
        </div>

        {/* 説明 */}
        <div>
          <SectionLabel label="説明" />
          <GroupCard>
            <Row className="space-y-3">
              {[
                {
                  title: '英語・日本語それぞれの音声を個別に設定できます。',
                  body: '英語音声: デフォルト/女性/男性/ずんだもん から選択\n日本語音声: ずんだもん/デフォルト から選択',
                },
                {
                  title: 'OpenAI APIキーを設定すると、単語追加時に自動で例文を生成できます。',
                  body: 'APIキーはOpenAIのウェブサイトで取得できます。',
                },
                {
                  title: 'AIモデルは精度やコストに応じて選択できます。',
                  body: 'GPT-4o miniは高速で低コスト、GPT-4oは高性能です。',
                },
                {
                  title: '例文の条件は「プリセット管理」から選択・編集できます。',
                  body: '組み込みプリセットはデフォルトに戻すことができます。',
                },
              ].map(({ title, body }) => (
                <div key={title}>
                  <p className="text-sm font-medium mb-0.5">{title}</p>
                  <p className="text-xs text-muted-foreground whitespace-pre-line">{body}</p>
                </div>
              ))}
            </Row>
          </GroupCard>
        </div>

      </div>
    </div>
  )
}
