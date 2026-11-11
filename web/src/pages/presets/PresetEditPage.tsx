import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ChevronLeft, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  addPreset,
  BUILT_IN_PRESETS,
  findPreset,
  loadPresetState,
  resetPreset,
  savePresetState,
  updatePreset,
} from '@/services/PromptPresetService'

const LIST = '/settings/presets'

/**
 * Creates (/settings/presets/new) or edits (/settings/presets/:id) a preset,
 * a port of the iOS PresetEditView. A built-in keeps its name and can be reset.
 */
export default function PresetEditPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [state, setState] = useState(loadPresetState)
  const existing = id ? findPreset(state, id) : undefined
  const isBuiltIn = existing?.isBuiltIn === true
  const [name, setName] = useState(existing?.name ?? '')
  const [conditions, setConditions] = useState(existing?.conditions ?? '')
  const [confirmingReset, setConfirmingReset] = useState(false)

  const back = (
    <button
      type="button"
      onClick={() => navigate(LIST)}
      aria-label="例文生成の条件に戻る"
      className="flex items-center gap-0.5 text-sm text-[var(--ios-blue)]"
    >
      <ChevronLeft size={18} />
      戻る
    </button>
  )

  if (id && !existing) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {back}
        <p className="text-sm text-muted-foreground text-center py-12">プリセットが見つかりません</p>
      </div>
    )
  }

  const original = BUILT_IN_PRESETS.find((p) => p.id === existing?.id)
  const atDefault = !original || conditions === original.conditions
  const saveDisabled = conditions.trim() === '' || (!isBuiltIn && name.trim() === '')

  function save() {
    const next = existing
      ? updatePreset(state, { ...existing, name: isBuiltIn ? existing.name : name, conditions })
      : addPreset(state, { name, conditions })
    savePresetState(next)
    navigate(LIST)
  }

  function reset() {
    if (!existing || !original) return
    const next = resetPreset(state, existing.id)
    savePresetState(next)
    setState(next)
    setConditions(original.conditions)
    setConfirmingReset(false)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <header className="sticky top-0 bg-[var(--ios-grouped-bg)] py-3 z-10 space-y-2">
        <div className="flex items-center justify-between">
          {back}
          <Button type="button" variant="ghost" size="sm" className="text-[var(--ios-blue)]" disabled={saveDisabled} onClick={save}>
            保存
          </Button>
        </div>
        <h1 className="text-xl font-bold">{existing ? 'プリセットを編集' : '新しいプリセット'}</h1>
      </header>

      <div className="space-y-5 mt-2">
        <section>
          <p className="text-xs text-muted-foreground px-1 mb-1">プリセット名</p>
          <div className="bg-white rounded-2xl px-4 py-2">
            {isBuiltIn ? (
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm">名前</span>
                <span className="text-sm text-muted-foreground">{name}</span>
              </div>
            ) : (
              <Input
                aria-label="名前" placeholder="名前" autoComplete="off" value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-0 shadow-none px-0 focus-visible:ring-0 text-sm"
              />
            )}
          </div>
        </section>

        <section>
          <label htmlFor="preset-conditions" className="block text-xs text-muted-foreground px-1 mb-1">条件</label>
          <div className="bg-white rounded-2xl px-4 py-2">
            <textarea
              id="preset-conditions"
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              rows={10}
              className="w-full text-sm bg-transparent outline-none resize-y min-h-[200px]"
            />
          </div>
        </section>

        {isBuiltIn && (
          <section className="bg-white rounded-2xl px-4 py-2">
            {confirmingReset ? (
              <div className="flex items-center gap-2 py-1">
                <p className="text-xs text-muted-foreground flex-1">このプリセットの条件をデフォルトの内容に戻しますか？</p>
                <Button type="button" size="sm" variant="destructive" onClick={reset}>リセット</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmingReset(false)}>キャンセル</Button>
              </div>
            ) : (
              <Button
                type="button" variant="ghost" className="w-full justify-start px-0 text-[var(--ios-red)]"
                disabled={atDefault} onClick={() => setConfirmingReset(true)}
              >
                <RotateCcw size={16} className="mr-1" />デフォルトに戻す
              </Button>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
