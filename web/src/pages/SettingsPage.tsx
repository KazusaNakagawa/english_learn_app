import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronRight, FlaskConical, TriangleAlert } from 'lucide-react'
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

// Matches iOS OpenAI model options
const OPENAI_MODELS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o mini（高速・低コスト）' },
  { id: 'gpt-4o',      label: 'GPT-4o' },
  { id: 'gpt-4.1-mini',label: 'GPT-4.1 mini' },
]

const PRESET_LABELS: Record<string, string> = {
  general: '一般',
  business: 'ビジネス',
  academic: '学術',
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-xs text-muted-foreground uppercase tracking-wide px-1 mb-1">{label}</p>
  )
}

function GroupCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white rounded-2xl divide-y divide-border overflow-hidden', className)}>
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-3">{children}</div>
}

function NavRow({ label, value, onClick }: { label: string; value?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
    >
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-1 text-muted-foreground">
        {value && <span className="text-sm">{value}</span>}
        <ChevronRight size={16} />
      </div>
    </button>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()

  const [openAIKey, setOpenAIKey] = useState('')
  const [voicevoxStyle, setVoicevoxStyle] = useState('22')
  const [voicevoxKey, setVoicevoxKey] = useState('')
  const [openAIModel, setOpenAIModel] = useState('gpt-4o-mini')
  const [preset] = useState('general')

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <header className="sticky top-0 bg-[var(--ios-grouped-bg)] py-3 z-10">
        <h1 className="text-xl font-bold">設定</h1>
      </header>

      <div className="mt-4 space-y-6">

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
            </Row>
          </GroupCard>
        </div>

        {/* VOICEVOX設定 */}
        <div>
          <SectionLabel label="VOICEVOX設定" />
          <GroupCard>
            {/* スタイル */}
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

            {/* APIキー */}
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

            {/* クレジット */}
            <Row>
              <p className="text-xs text-muted-foreground">© VOICEVOX:ずんだもん</p>
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
            <NavRow label="プリセット管理" value={PRESET_LABELS[preset]} />
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

      </div>
    </div>
  )
}
