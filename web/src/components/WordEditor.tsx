import { useEffect, useRef, useState } from 'react'
import { Loader2, Plus, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useIdsBySpelling } from '@/hooks/useWords'
import { emptySentenceRow, isBlankRow, validateWordForm, type SentenceRow, type WordForm, type WordInput } from '@/lib/wordForm'
import { generateContent, GenerationError, type GeneratedContent } from '@/services/OpenAIService'
import { loadSettings } from '@/services/SettingsService'

const fieldClass = 'border-0 shadow-none px-0 focus-visible:ring-0 text-sm'

/**
 * Fills what the user left empty and adds the sentences. Rows the user typed or
 * edited, and stored sentences, are kept; blank rows and untouched rows from an
 * earlier generation are replaced.
 */
function withGenerated(form: WordForm, content: GeneratedContent): WordForm {
  return {
    ...form,
    meaning: form.meaning.trim() ? form.meaning : content.meaning,
    phonetic: form.phonetic.trim() ? form.phonetic : content.phonetic,
    sentences: [
      ...form.sentences.filter((row) => !isBlankRow(row) && !row.generated),
      ...content.sentences.map((s) => ({ ...emptySentenceRow(), ...s, generated: true })),
    ],
  }
}

interface Props {
  title: string
  initial: WordForm
  /** The id of the word being edited, which is not a duplicate of itself. */
  ownId?: string
  /** Stores the input. A rejection is shown as a save failure. */
  onSave: (input: WordInput) => Promise<void>
  onCancel: () => void
}

/** The word form shared by the add and edit pages. */
export function WordEditor({ title, initial, ownId, onSave, onCancel }: Props) {
  const idsBySpelling = useIdsBySpelling()
  const [form, setForm] = useState<WordForm>(initial)
  // Errors appear after the first save attempt, then follow the input as it is corrected.
  const [submitted, setSubmitted] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const generation = useRef<AbortController | null>(null)
  const [{ openAIKey, openAIModel }] = useState(loadSettings)

  useEffect(() => () => generation.current?.abort(), [])

  const errors = submitted ? validateWordForm(form).errors : []
  const typed = form.word.trim().toLowerCase()
  const alreadyListed = typed !== '' && idsBySpelling.status === 'ready'
    && (idsBySpelling.data.get(typed) ?? []).some((id) => id !== ownId)

  const setField = (key: 'word' | 'meaning' | 'phonetic', value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const setRow = (index: number, key: Exclude<keyof SentenceRow, 'key'>, value: string) =>
    setForm((prev) => ({
      ...prev,
      // Editing a generated row makes it the user's, so generating again keeps it.
      sentences: prev.sentences.map((row, i) => (i === index ? { ...row, [key]: value, generated: false } : row)),
    }))

  // The form is locked while generating, so the result always belongs to the
  // word it was requested for. Only the latest request may change the state.
  async function generate() {
    const controller = new AbortController()
    generation.current = controller
    setGenerating(true)
    setGenerateError(null)
    try {
      const content = await generateContent(form.word, { apiKey: openAIKey, model: openAIModel, signal: controller.signal })
      if (generation.current === controller) setForm((prev) => withGenerated(prev, content))
    } catch (err) {
      if (generation.current !== controller) return
      if (!(err instanceof GenerationError)) console.error('[WordEditor] generation failed:', err)
      setGenerateError(err instanceof GenerationError ? err.message : '例文を生成できませんでした')
    } finally {
      if (generation.current === controller) {
        generation.current = null
        setGenerating(false)
      }
    }
  }

  function cancelGeneration() {
    generation.current?.abort()
    generation.current = null // so the aborted request cannot touch the state
    setGenerating(false)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)
    setSubmitted(true)
    const { input } = validateWordForm(form)
    if (!input) return
    setSaving(true)
    try {
      await onSave(input)
    } catch (err) {
      console.error('[WordEditor] save failed:', err)
      setSaveError('保存に失敗しました')
    } finally {
      setSaving(false) // also when the page stays mounted after a successful save
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <header className="sticky top-0 bg-[var(--ios-grouped-bg)] py-3 z-10 flex items-center justify-between">
        <h1 className="text-xl font-bold">{title}</h1>
        <Button variant="ghost" size="sm" onClick={onCancel}>キャンセル</Button>
      </header>

      <form onSubmit={save} noValidate className="mt-2 space-y-5">
        <section>
          <p className="text-xs text-muted-foreground uppercase tracking-wide px-1 mb-1">単語情報</p>
          {/* Locked while generating, so the result always belongs to the word it was asked for. */}
          <fieldset disabled={generating} className="bg-white rounded-2xl divide-y divide-border px-4 disabled:opacity-60">
            <Input aria-label="英単語" placeholder="英単語（例: apple）" autoComplete="off"
              value={form.word} onChange={(e) => setField('word', e.target.value)} className={fieldClass} />
            <Input aria-label="意味" placeholder="意味（例: りんご）" autoComplete="off"
              value={form.meaning} onChange={(e) => setField('meaning', e.target.value)} className={fieldClass} />
            <Input aria-label="発音記号" placeholder="発音記号（任意）" autoComplete="off"
              value={form.phonetic} onChange={(e) => setField('phonetic', e.target.value)} className={fieldClass} />
          </fieldset>
          {alreadyListed && (
            <p className="text-xs text-[var(--ios-orange)] px-1 mt-1.5">「{form.word.trim()}」は登録済みです</p>
          )}
        </section>

        <section>
          <p className="text-xs text-muted-foreground uppercase tracking-wide px-1 mb-1">例文（任意）</p>
          <div className="space-y-2">
            {generating ? (
              <div className="bg-white rounded-2xl pl-4 pr-2 py-1.5 flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-[var(--ios-blue)]" />
                <span className="text-sm flex-1">生成中…</span>
                <Button type="button" variant="ghost" size="sm" onClick={cancelGeneration}>
                  生成を中止
                </Button>
              </div>
            ) : (
              <Button
                type="button" variant="ghost"
                disabled={!openAIKey || !form.word.trim()}
                className="w-full bg-white rounded-2xl text-[var(--ios-blue)]"
                onClick={generate}
              >
                <Sparkles size={16} className="mr-1" />AIで例文を生成
              </Button>
            )}
            {!openAIKey && (
              <p className="text-xs text-muted-foreground px-1">設定で OpenAI の API キーを入力すると、例文を自動で生成できます</p>
            )}
            {generateError && <p role="alert" className="text-xs text-[var(--ios-red)] px-1">{generateError}</p>}
            <fieldset disabled={generating} className="space-y-2 disabled:opacity-60">
            {form.sentences.map((row, i) => (
              <div key={row.key} className="bg-white rounded-2xl pl-4 pr-2 py-1 flex gap-2">
                <div className="flex-1 divide-y divide-border">
                  <Input aria-label={`例文${i + 1}の英文`} placeholder="英文" autoComplete="off"
                    value={row.english} onChange={(e) => setRow(i, 'english', e.target.value)} className={fieldClass} />
                  <Input aria-label={`例文${i + 1}の和訳`} placeholder="和訳" autoComplete="off"
                    value={row.japanese} onChange={(e) => setRow(i, 'japanese', e.target.value)} className={fieldClass} />
                  <Input aria-label={`例文${i + 1}のカテゴリ`} placeholder="カテゴリ（任意）" autoComplete="off"
                    value={row.category} onChange={(e) => setRow(i, 'category', e.target.value)} className={fieldClass} />
                </div>
                <Button
                  type="button" variant="ghost" size="sm" aria-label={`例文${i + 1}を削除`}
                  className="self-start mt-1 text-muted-foreground"
                  onClick={() => setForm((prev) => ({ ...prev, sentences: prev.sentences.filter((_, j) => j !== i) }))}
                >
                  <X size={16} />
                </Button>
              </div>
            ))}
            <Button
              type="button" variant="ghost"
              className="w-full bg-white rounded-2xl text-[var(--ios-blue)]"
              onClick={() => setForm((prev) => ({ ...prev, sentences: [...prev.sentences, emptySentenceRow()] }))}
            >
              <Plus size={16} className="mr-1" />例文を追加
            </Button>
            </fieldset>
          </div>
        </section>

        {(errors.length > 0 || saveError) && (
          <div role="alert" className="space-y-0.5 px-1">
            {[...errors, ...(saveError ? [saveError] : [])].map((message) => (
              <p key={message} className="text-xs text-[var(--ios-red)]">{message}</p>
            ))}
          </div>
        )}

        <Button
          type="submit" disabled={saving || generating}
          className="w-full bg-[var(--ios-blue)] hover:bg-[var(--ios-blue)]/90 text-white"
        >
          保存
        </Button>
      </form>
    </div>
  )
}
