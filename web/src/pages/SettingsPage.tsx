import { useState } from 'react'
import { useNavigate } from 'react-router'
import {
  ChevronRight,
  FlaskConical,
  Volume2,
  Upload,
  Download,
  Trash2,
  FileText,
  Shield,
  CheckCircle2,
  TriangleAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Matches iOS VoicevoxStyle enum (SettingsManager.swift)
const VOICEVOX_STYLES = [
  { id: '3',  label: 'ノーマル' },
  { id: '1',  label: 'あまあま' },
  { id: '7',  label: 'ツンツン' },
  { id: '5',  label: 'セクシー' },
  { id: '22', label: 'ささやき' },
  { id: '38', label: 'ヒソヒソ' },
]

const OPENAI_MODELS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o mini（高速・低コスト）' },
  { id: 'gpt-4o',      label: 'GPT-4o' },
  { id: 'gpt-4.1-mini',label: 'GPT-4.1 mini' },
]

const EN_VOICES = ['デフォルト', '女性', '男性', 'ずんだもん'] as const
const JA_VOICES = ['ずんだもん', 'デフォルト'] as const
const PLAY_PATTERNS = ['バイリンガル (EN+JA)', '英語のみ (EN+EN)'] as const

type EnVoice = typeof EN_VOICES[number]
type JaVoice = typeof JA_VOICES[number]
type PlayPattern = typeof PLAY_PATTERNS[number]

// --- Sub components ---

function SectionLabel({ label }: { label: string }) {
  return <p className="text-xs text-muted-foreground uppercase tracking-wide px-1 mb-1">{label}</p>
}

function GroupCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl divide-y divide-border overflow-hidden">
      {children}
    </div>
  )
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-4 py-3', className)}>{children}</div>
}

function NavRow({ label, value, onClick, icon: Icon, iconColor }: {
  label: string
  value?: string
  onClick?: () => void
  icon?: React.ElementType
  iconColor?: string
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
    >
      {Icon && <Icon size={18} className={cn('shrink-0', iconColor ?? 'text-[var(--ios-blue)]')} />}
      <span className="flex-1 text-sm">{label}</span>
      <div className="flex items-center gap-1 text-muted-foreground">
        {value && <span className="text-sm">{value}</span>}
        <ChevronRight size={16} />
      </div>
    </button>
  )
}

function ActionRow({ label, onClick, icon: Icon, iconColor, destructive }: {
  label: string
  onClick?: () => void
  icon?: React.ElementType
  iconColor?: string
  destructive?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
    >
      {Icon && <Icon size={18} className={cn('shrink-0', iconColor ?? 'text-[var(--ios-blue)]')} />}
      <span className={cn('flex-1 text-sm', destructive ? 'text-[var(--ios-red)]' : 'text-[var(--ios-blue)]')}>
        {label}
      </span>
    </button>
  )
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
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
            value === opt
              ? 'bg-white text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

// --- Main ---

export default function SettingsPage() {
  const navigate = useNavigate()

  const [enVoice, setEnVoice] = useState<EnVoice>('デフォルト')
  const [jaVoice, setJaVoice] = useState<JaVoice>('ずんだもん')
  const [playPattern, setPlayPattern] = useState<PlayPattern>('バイリンガル (EN+JA)')
  const [interval, setInterval] = useState(1.5)

  const [voicevoxStyle, setVoicevoxStyle] = useState('22')
  const [voicevoxKey, setVoicevoxKey] = useState('')

  const [openAIKey, setOpenAIKey] = useState('')
  const [openAIModel, setOpenAIModel] = useState('gpt-4o-mini')

  const [ttsStatus, setTtsStatus] = useState<'idle' | 'playing'>('idle')

  function playEnSample() {
    window.speechSynthesis.cancel()
    setTtsStatus('playing')
    const utt = new SpeechSynthesisUtterance('This is a sample of the English voice.')
    utt.lang = 'en-US'
    utt.onend = () => setTtsStatus('idle')
    utt.onerror = () => setTtsStatus('idle')
    window.speechSynthesis.speak(utt)
  }

  function playJaSample() {
    window.speechSynthesis.cancel()
    setTtsStatus('playing')
    const utt = new SpeechSynthesisUtterance('これは日本語の音声サンプルです。')
    utt.lang = 'ja-JP'
    utt.onend = () => setTtsStatus('idle')
    utt.onerror = () => setTtsStatus('idle')
    window.speechSynthesis.speak(utt)
  }

  const patternDesc =
    playPattern === 'バイリンガル (EN+JA)'
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
            <Row>
              <SegmentedControl options={EN_VOICES} value={enVoice} onChange={setEnVoice} />
            </Row>
            <Row>
              <Button
                className="w-full bg-[var(--ios-blue)] hover:bg-[var(--ios-blue)]/90 text-white"
                onClick={playEnSample}
                disabled={ttsStatus === 'playing'}
              >
                <Volume2 size={16} className="mr-1.5" />
                英語サンプルを再生
              </Button>
            </Row>
          </GroupCard>
        </div>

        {/* 日本語の音声設定 */}
        <div>
          <SectionLabel label="日本語の音声設定" />
          <GroupCard>
            <Row>
              <SegmentedControl options={JA_VOICES} value={jaVoice} onChange={setJaVoice} />
            </Row>
            <Row>
              <Button
                className="w-full bg-[var(--ios-blue)] hover:bg-[var(--ios-blue)]/90 text-white"
                onClick={playJaSample}
                disabled={ttsStatus === 'playing'}
              >
                <Volume2 size={16} className="mr-1.5" />
                日本語サンプルを再生
              </Button>
            </Row>
          </GroupCard>
        </div>

        {/* 連続再生設定 */}
        <div>
          <SectionLabel label="連続再生設定" />
          <GroupCard>
            <Row>
              <SegmentedControl options={PLAY_PATTERNS} value={playPattern} onChange={setPlayPattern} />
            </Row>
            <Row>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm">例文間の間隔</span>
                <span className="text-sm text-muted-foreground">{interval.toFixed(1)}秒</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={5.0}
                step={0.5}
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value))}
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
                  value={voicevoxStyle}
                  onChange={(e) => setVoicevoxStyle(e.target.value)}
                >
                  {VOICEVOX_STYLES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            </Row>
            <Row>
              <Input
                type="password"
                placeholder="APIキー"
                value={voicevoxKey}
                onChange={(e) => setVoicevoxKey(e.target.value)}
                className="border-0 shadow-none px-0 focus-visible:ring-0 text-sm"
              />
              {!voicevoxKey && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <TriangleAlert size={13} className="text-[var(--ios-orange)] shrink-0" />
                  <p className="text-xs text-[var(--ios-orange)]">
                    AppConfigのキーを使用中（設定で上書き可）
                  </p>
                </div>
              )}
            </Row>
            <Row>
              <p className="text-xs text-muted-foreground">© VOICEVOX:ずんだもん</p>
            </Row>
          </GroupCard>
        </div>

        {/* OpenAI API設定 */}
        <div>
          <SectionLabel label="OpenAI API設定" />
          <GroupCard>
            <Row>
              <Input
                type="password"
                placeholder="APIキー"
                value={openAIKey}
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
                value={openAIModel}
                onChange={(e) => setOpenAIModel(e.target.value)}
              >
                {OPENAI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </Row>
          </GroupCard>
        </div>

        {/* 例文生成の条件 */}
        <div>
          <SectionLabel label="例文生成の条件" />
          <GroupCard>
            <NavRow label="プリセット管理" value="一般" />
          </GroupCard>
        </div>

        {/* データ管理 */}
        <div>
          <SectionLabel label="データ管理" />
          <GroupCard>
            <ActionRow label="単語リストをエクスポート" icon={Upload} />
            <ActionRow label="単語リストをインポート" icon={Download} />
            <Row>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">音声キャッシュ</span>
                <span className="text-sm text-muted-foreground">0バイト</span>
              </div>
            </Row>
            <ActionRow label="キャッシュをクリア" icon={Trash2} iconColor="text-[var(--ios-red)]" destructive />
          </GroupCard>
        </div>

        {/* 法的情報 */}
        <div>
          <SectionLabel label="法的情報" />
          <GroupCard>
            <NavRow label="プライバシーポリシー" icon={Shield} />
            <NavRow label="利用規約" icon={FileText} />
          </GroupCard>
        </div>

        {/* Developer Tools */}
        <div>
          <SectionLabel label="Developer Tools" />
          <GroupCard>
            <button
              onClick={() => navigate('/poc')}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
            >
              <FlaskConical size={18} className="text-[var(--ios-blue)] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Phase 0 Validation</p>
                <p className="text-xs text-muted-foreground">Web Speech API · IndexedDB · VOICEVOX CORS</p>
              </div>
              <ChevronRight size={16} className="text-muted-foreground shrink-0" />
            </button>
          </GroupCard>
        </div>

        {/* 説明 */}
        <div>
          <SectionLabel label="説明" />
          <GroupCard>
            <Row className="space-y-3">
              <div>
                <p className="text-sm font-medium mb-0.5">英語・日本語それぞれの音声を個別に設定できます。</p>
                <p className="text-xs text-muted-foreground">
                  英語音声: デフォルト/女性/男性/ずんだもん から選択<br />
                  日本語音声: ずんだもん/デフォルト から選択
                </p>
              </div>
              <div>
                <p className="text-sm font-medium mb-0.5">OpenAI APIキーを設定すると、単語追加時に自動で例文を生成できます。</p>
                <p className="text-xs text-muted-foreground">APIキーはOpenAIのウェブサイトで取得できます。</p>
              </div>
              <div>
                <p className="text-sm font-medium mb-0.5">AIモデルは精度やコストに応じて選択できます。</p>
                <p className="text-xs text-muted-foreground">
                  GPT-4o miniは高速で低コスト、GPT-4oは高性能です。
                </p>
              </div>
              <div>
                <p className="text-sm font-medium mb-0.5">例文の条件は「プリセット管理」から選択・編集できます。</p>
                <p className="text-xs text-muted-foreground">組み込みプリセットはデフォルトに戻すことができます。</p>
              </div>
            </Row>
          </GroupCard>
        </div>

      </div>
    </div>
  )
}
