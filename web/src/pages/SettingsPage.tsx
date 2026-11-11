import { useState, useEffect, useCallback, useRef } from 'react'
import { playTTS, stopTTS, type VoiceType } from '@/services/AudioService'
import { useNavigate } from 'react-router'
import { getCacheUsage, clearCache } from '@/services/AudioCacheService'
import { getWordsForExport, mergeWords, replaceWords } from '@/services/WordRepository'
import { exportFileName, parseWordFile, serializeWords, WordFileError } from '@/services/WordTransfer'
import type { Word } from '@/types/word'
import { loadSettings, saveSettings, type AppSettings } from '@/services/SettingsService'
import {
  ChevronRight, FlaskConical, Volume2,
  Upload, Download, Trash2, FileText, Shield,
  CheckCircle2, TriangleAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { checkEndpoint, defaultEndpoint, endpointError, endpointOrigin, isLocalEndpoint, resolveVoicevox } from '@/lib/voicevox'

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

function InlineAlert({
  type, message, className,
}: {
  type: 'error' | 'warning' | 'success'
  message: string
  className?: string
}) {
  const variants = {
    error:   { color: 'text-[var(--ios-red)]',    Icon: TriangleAlert },
    warning: { color: 'text-[var(--ios-orange)]', Icon: TriangleAlert },
    success: { color: 'text-[var(--ios-green)]',  Icon: CheckCircle2  },
  }
  const { color, Icon } = variants[type]
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Icon size={13} className={cn('shrink-0', color)} />
      <p className={cn('text-xs', color)}>{message}</p>
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

// Single loadSettings() call to derive all initial state values
function initFromSettings() {
  const s = loadSettings()
  const v = Number(s.intervalSec)
  return {
    enVoice:   (EN_VOICE_MAP[s.enVoice]   ?? '女性')                as EnVoice,
    jaVoice:   (JA_VOICE_MAP[s.jaVoice]   ?? 'ずんだもん')          as JaVoice,
    pattern:   (PATTERN_MAP[s.playPattern] ?? 'バイリンガル (EN+JA)') as Pattern,
    interval:  Number.isFinite(v) ? Math.min(5, Math.max(0.5, v)) : 1.5,
    vvStyle:   s.voicevoxStyle,
    vvKey:     s.voicevoxApiKey,
    vvEndpoint: s.voicevoxEndpoint,
    vvKeyOrigin: s.voicevoxApiKeyOrigin,
    openAIKey: s.openAIKey,
    aiModel:   s.openAIModel,
  }
}

// Safari starts the download after click() returns, so the URL must outlive it.
const DOWNLOAD_URL_LIFETIME_MS = 1000

function hiddenNote(hidden: number): string {
  return hidden > 0 ? `${hidden}件はアーカイブかゴミ箱のため一覧に表示されません` : ''
}

function WordTransferRows() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Word[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  async function exportWords() {
    setNotice(null)
    try {
      const words = await getWordsForExport()
      if (words.length === 0) {
        setNotice({ type: 'error', message: 'エクスポートする単語がありません' })
        return
      }
      const blob = new Blob([serializeWords(words)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = exportFileName()
      document.body.appendChild(link) // older Firefox ignores a detached anchor
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS)
    } catch (err) {
      console.error('[SettingsPage] export failed:', err)
      setNotice({ type: 'error', message: 'エクスポートに失敗しました' })
    }
  }

  async function chooseFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // so choosing the same file again still fires change
    if (!file || saving) return
    setNotice(null)
    setPending(null)
    try {
      setPending(parseWordFile(await file.text()))
    } catch (err) {
      if (!(err instanceof WordFileError)) console.error('[SettingsPage] file read failed:', err)
      setNotice({ type: 'error', message: err instanceof WordFileError ? err.message : 'ファイルを読み込めませんでした' })
    }
  }

  async function applyImport(mode: 'merge' | 'replace') {
    if (!pending) return
    setSaving(true)
    try {
      if (mode === 'merge') {
        const { added, skipped, duplicates, hidden } = await mergeWords(pending)
        const notes = [
          skipped > 0 ? `${skipped}件は登録済みのためスキップ` : '',
          duplicates > 0 ? `${duplicates}件はファイル内の重複` : '',
          hiddenNote(hidden),
        ].filter(Boolean)
        const detail = notes.length > 0 ? `（${notes.join('、')}）` : ''
        setNotice({ type: 'success', message: `${added}件を追加しました${detail}` })
      } else {
        const { stored, hidden } = await replaceWords(pending)
        const detail = hidden > 0 ? `（${hiddenNote(hidden)}）` : ''
        setNotice({ type: 'success', message: `${stored}件でデータを置き換えました${detail}` })
      }
      setPending(null)
    } catch (err) {
      console.error('[SettingsPage] import failed:', err)
      setNotice({ type: 'error', message: '単語の保存に失敗しました' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <ListRow icon={Upload} label="単語リストをエクスポート" onClick={exportWords} />
      <ListRow icon={Download} label="単語リストをインポート" onClick={() => { if (!saving) fileInput.current?.click() }} />
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        aria-label="単語ファイルを選択"
        className="hidden"
        onChange={chooseFile}
      />
      {pending && (
        <Row>
          <p className="text-sm">{pending.length}件の単語をインポートします</p>
          <p className="text-xs text-muted-foreground mt-1">
            「置き換え」を選ぶと、ゴミ箱以外の今の単語はすべて消えます
          </p>
          <div className="flex gap-2 mt-2">
            <Button size="sm" disabled={saving} onClick={() => applyImport('merge')}>追加</Button>
            <Button size="sm" variant="destructive" disabled={saving} onClick={() => applyImport('replace')}>置き換え</Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setPending(null)}>キャンセル</Button>
          </div>
        </Row>
      )}
      {notice && (
        <Row>
          <InlineAlert type={notice.type} message={notice.message} />
        </Row>
      )}
    </>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()

  const [init] = useState(initFromSettings)
  const [enVoice,   setEnVoiceRaw]   = useState<EnVoice>(init.enVoice)
  const [jaVoice,   setJaVoiceRaw]   = useState<JaVoice>(init.jaVoice)
  const [pattern,   setPatternRaw]   = useState<Pattern>(init.pattern)
  const [interval,  setIntervalSRaw] = useState(init.interval)
  const [vvStyle,   setVvStyleRaw]   = useState(init.vvStyle)
  const [vvKey,     setVvKeyRaw]     = useState(init.vvKey)
  const [vvEndpoint, setVvEndpointRaw] = useState(init.vvEndpoint)
  const [vvKeyOrigin, setVvKeyOriginRaw] = useState(init.vvKeyOrigin)
  const endpointCheckRun = useRef<AbortController | null>(null)
  const [endpointCheck, setEndpointCheck] = useState<{ ok: boolean; message: string } | 'checking' | null>(null)
  const [openAIKey, setOpenAIKeyRaw] = useState(init.openAIKey)
  const [aiModel,   setAiModelRaw]   = useState(init.aiModel)
  const [playing,     setPlaying]    = useState(false)
  const [coldStart,   setColdStart]  = useState(false)
  const [playError,   setPlayError]  = useState<string | null>(null)
  const [cacheError,  setCacheError] = useState<string | null>(null)
  const [cacheBytes,  setCacheBytes] = useState(0)

  // Wrappers that also persist to localStorage
  const setEnVoice   = (v: EnVoice) => { setEnVoiceRaw(v);   saveSettings({ enVoice: EN_VOICE_RMAP[v] as AppSettings['enVoice'] }) }
  const setJaVoice   = (v: JaVoice) => { setJaVoiceRaw(v);   saveSettings({ jaVoice: JA_VOICE_RMAP[v] as AppSettings['jaVoice'] }) }
  const setPattern   = (v: Pattern) => { setPatternRaw(v);   saveSettings({ playPattern: PATTERN_RMAP[v] as AppSettings['playPattern'] }) }
  const setIntervalS = (v: number)  => { setIntervalSRaw(v); saveSettings({ intervalSec: v }) }
  const setVvStyle   = (v: string)  => { setVvStyleRaw(v);   saveSettings({ voicevoxStyle: v }) }
  // A result for the old endpoint or key must not show under the new one.
  const resetEndpointCheck = () => {
    endpointCheckRun.current?.abort()
    endpointCheckRun.current = null
    setEndpointCheck(null)
  }
  // A key is tied to the endpoint it is typed for, so it never goes to an endpoint typed later.
  const setVvKey = (v: string) => {
    const origin = endpointOrigin(resolveVoicevox({ voicevoxEndpoint: vvEndpoint, voicevoxApiKey: '', voicevoxApiKeyOrigin: '' }).endpoint)
    setVvKeyRaw(v)
    setVvKeyOriginRaw(origin)
    resetEndpointCheck()
    saveSettings({ voicevoxApiKey: v, voicevoxApiKeyOrigin: origin })
  }
  // Saved as typed; an invalid URL is ignored at playback, which falls back to the default.
  const setVvEndpoint = (v: string) => { setVvEndpointRaw(v); resetEndpointCheck(); saveSettings({ voicevoxEndpoint: v.trim() }) }
  const setOpenAIKey = (v: string)  => { setOpenAIKeyRaw(v); saveSettings({ openAIKey: v }) }
  const setAiModel   = (v: string)  => { setAiModelRaw(v);   saveSettings({ openAIModel: v }) }

  const refreshCacheUsage = useCallback(() => {
    return getCacheUsage()
      .then(setCacheBytes)
      .catch((err) => setCacheError(err instanceof Error ? err.message : 'キャッシュ情報の取得に失敗しました'))
  }, [])

  useEffect(() => { refreshCacheUsage() }, [refreshCacheUsage])

  // Stop audio on unmount
  useEffect(() => {
    return () => { stopTTS() }
  }, [])

  const voicevox = resolveVoicevox({ voicevoxEndpoint: vvEndpoint, voicevoxApiKey: vvKey, voicevoxApiKeyOrigin: vvKeyOrigin })
  const buildEndpoint = defaultEndpoint()
  const vvEndpointError = endpointError(vvEndpoint)
  const usingBuildKey = voicevox.keySource === 'build'
  const keyHeldBack = !!vvKey && voicevox.keySource !== 'settings' && !!voicevox.endpoint
  const needsKey = !!voicevox.endpoint && !voicevox.apiKey && !isLocalEndpoint(voicevox.endpoint)

  async function testEndpoint() {
    resetEndpointCheck()
    const run = new AbortController()
    endpointCheckRun.current = run
    setEndpointCheck('checking')
    const result = await checkEndpoint(voicevox.endpoint, voicevox.apiKey, run.signal)
    if (result && endpointCheckRun.current === run) {
      endpointCheckRun.current = null
      setEndpointCheck(result)
    }
  }

  useEffect(() => () => endpointCheckRun.current?.abort(), [])

  async function playSample(text: string, lang: 'en' | 'ja') {
    if (playing) return
    setPlaying(true)
    setPlayError(null)
    try {
      const voice = (lang === 'en' ? EN_VOICE_RMAP[enVoice] : JA_VOICE_RMAP[jaVoice]) as VoiceType
      await playTTS(text, {
        voice,
        speakerId: vvStyle,
        ...voicevox,
        lang,
        onColdStart: () => setColdStart(true),
        onColdStartEnd: () => setColdStart(false),
      })
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : '再生に失敗しました')
    } finally {
      setColdStart(false)
      setPlaying(false)
      await refreshCacheUsage()
    }
  }

  const coldStartHint = coldStart && (
    <p className="text-xs text-muted-foreground mt-1.5">ずんだもんを起動中です（初回は30秒ほどかかります）...</p>
  )

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
              {coldStartHint}
              {playError && <InlineAlert type="error" message={playError} className="mt-1.5" />}
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
              {coldStartHint}
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
              <Input
                type="url" inputMode="url" autoComplete="off" spellCheck={false}
                aria-label="VOICEVOXの接続先"
                placeholder={buildEndpoint || '接続先 URL（例: http://127.0.0.1:50021）'}
                value={vvEndpoint} onChange={(e) => setVvEndpoint(e.target.value)}
                className="border-0 shadow-none px-0 focus-visible:ring-0 text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {buildEndpoint
                  ? '空欄のときは、ビルド時の接続先を使います'
                  : '空欄のときは、ブラウザの音声で読みます。ローカルの Docker なら http://127.0.0.1:50021'}
              </p>
              {vvEndpointError && (
                <InlineAlert type="error" message={`${vvEndpointError}。いまは${buildEndpoint ? 'ビルド時の接続先' : 'ブラウザの音声'}を使います`} className="mt-1.5" />
              )}
              <div className="flex items-center gap-2 mt-2">
                <Button
                  type="button" size="sm" variant="outline"
                  disabled={!voicevox.endpoint || endpointCheck === 'checking'}
                  onClick={testEndpoint}
                >
                  {endpointCheck === 'checking' ? '接続中…' : '接続テスト'}
                </Button>
                {vvEndpoint && (
                  <Button type="button" size="sm" variant="ghost" className="text-[var(--ios-blue)]" onClick={() => setVvEndpoint('')}>
                    既定に戻す
                  </Button>
                )}
              </div>
              {endpointCheck && endpointCheck !== 'checking' && (
                <InlineAlert type={endpointCheck.ok ? 'success' : 'error'} message={endpointCheck.message} className="mt-1.5" />
              )}
            </Row>
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
                type="password" placeholder="APIキー" aria-label="VOICEVOXのAPIキー" value={vvKey}
                onChange={(e) => setVvKey(e.target.value)}
                className="border-0 shadow-none px-0 focus-visible:ring-0 text-sm"
              />
              {/* The build-time key goes only to the build-time endpoint; a local engine needs none. */}
              {usingBuildKey && (
                <InlineAlert type="warning" message="AppConfigのキーを使用中（設定で上書き可）" className="mt-1.5" />
              )}
              {keyHeldBack && (
                <InlineAlert
                  type="warning"
                  message={`このキーは別の接続先（${vvKeyOrigin || buildEndpoint}）用のため、いまの接続先には送りません。使うなら入力し直してください`}
                  className="mt-1.5"
                />
              )}
              {needsKey && !keyHeldBack && (
                <InlineAlert type="warning" message="この接続先にはAPIキーが必要です。キーがないあいだはブラウザの音声で読みます" className="mt-1.5" />
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
                <InlineAlert type="success" message="APIキーが設定されています" className="mt-1.5" />
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
            <WordTransferRows />
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
              onClick={async () => {
                setCacheError(null)
                try {
                  await clearCache()
                  await refreshCacheUsage()
                } catch (err) {
                  setCacheError(err instanceof Error ? err.message : 'キャッシュのクリアに失敗しました')
                }
              }}
            />
            {cacheError && (
              <Row>
                <InlineAlert type="error" message={cacheError} />
              </Row>
            )}
          </GroupCard>
        </div>

        {/* 法的情報 */}
        <div>
          <SectionLabel label="法的情報" />
          <GroupCard>
            <ListRow icon={Shield}   label="プライバシーポリシー" chevron onClick={() => navigate('/settings/privacy')} />
            <ListRow icon={FileText} label="利用規約"             chevron onClick={() => navigate('/settings/terms')} />
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
