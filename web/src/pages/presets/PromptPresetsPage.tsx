import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, ChevronLeft, Plus, Share } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  allPresets,
  canAddPreset,
  deletePreset,
  exportMarkdown,
  isPresetModified,
  loadPresetState,
  savePresetState,
  setActivePreset,
  type PresetState,
} from '@/services/PromptPresetService'

// Safari starts the download after click() returns, so the URL must outlive it.
const DOWNLOAD_URL_LIFETIME_MS = 1000

function Badge({ children, tone }: { children: React.ReactNode; tone: 'muted' | 'orange' }) {
  return (
    <span
      className={
        tone === 'orange'
          ? 'text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-600'
          : 'text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground'
      }
    >
      {children}
    </span>
  )
}

/** The preset list, a port of iOS PromptPresetsView. Choosing a row makes it the active preset. */
export default function PromptPresetsPage() {
  const navigate = useNavigate()
  const [state, setState] = useState<PresetState>(loadPresetState)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  // Settings is usually scrolled down to this row when the list opens.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  function apply(next: PresetState) {
    savePresetState(next)
    setState(next)
  }

  function exportPresets() {
    const url = URL.createObjectURL(new Blob([exportMarkdown(state)], { type: 'text/markdown' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'prompt_presets.md'
    document.body.appendChild(link) // older Firefox ignores a detached anchor
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <header className="sticky top-0 bg-[var(--ios-grouped-bg)] py-3 z-10 space-y-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/settings')}
            aria-label="設定に戻る"
            className="flex items-center gap-0.5 text-sm text-[var(--ios-blue)]"
          >
            <ChevronLeft size={18} />
            設定
          </button>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" aria-label="プリセットを書き出す" onClick={exportPresets}>
              <Share size={18} className="text-[var(--ios-blue)]" />
            </Button>
            {canAddPreset(state) && (
              <Button
                type="button" variant="ghost" size="sm" aria-label="プリセットを追加"
                onClick={() => navigate('/settings/presets/new')}
              >
                <Plus size={20} className="text-[var(--ios-blue)]" />
              </Button>
            )}
          </div>
        </div>
        <h1 className="text-xl font-bold">例文生成の条件</h1>
      </header>

      <ul className="mt-2 bg-white rounded-2xl divide-y divide-border overflow-hidden">
        {allPresets(state).map((preset) => {
          const active = preset.id === state.activeId
          return (
            <li key={preset.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  aria-label={preset.name}
                  aria-pressed={active}
                  onClick={() => apply(setActivePreset(state, preset.id))}
                  className="flex-1 min-w-0 text-left"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm">{preset.name}</span>
                    {preset.isBuiltIn && <Badge tone="muted">組み込み</Badge>}
                    {isPresetModified(state, preset.id) && <Badge tone="orange">変更済み</Badge>}
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-line">
                    {preset.conditions}
                  </span>
                </button>
                {active && <Check size={18} className="text-[var(--ios-blue)] shrink-0 mt-0.5" aria-hidden />}
                <div className="flex items-center shrink-0">
                  <Button
                    type="button" variant="ghost" size="sm" className="text-[var(--ios-blue)]"
                    aria-label={`「${preset.name}」を編集`}
                    onClick={() => navigate(`/settings/presets/${preset.id}`)}
                  >
                    編集
                  </Button>
                  {!preset.isBuiltIn && (
                    <Button
                      type="button" variant="ghost" size="sm" className="text-[var(--ios-red)]"
                      aria-label={`「${preset.name}」を削除`}
                      onClick={() => setConfirmingId(preset.id)}
                    >
                      削除
                    </Button>
                  )}
                </div>
              </div>
              {confirmingId === preset.id && (
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  <p className="text-xs text-muted-foreground basis-full">このプリセットを削除しますか？元に戻せません。</p>
                  <Button
                    type="button" size="sm" variant="destructive"
                    onClick={() => { apply(deletePreset(state, preset.id)); setConfirmingId(null) }}
                  >
                    削除する
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>
                    キャンセル
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
