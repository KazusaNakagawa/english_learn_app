import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWords } from '@/hooks/useWords'
import { emptySentenceRow, validateWordForm, type SentenceRow, type WordForm } from '@/lib/wordForm'
import { addWord } from '@/services/WordRepository'

const fieldClass = 'border-0 shadow-none px-0 focus-visible:ring-0 text-sm'

export default function AddPage() {
  const navigate = useNavigate()
  const wordsState = useWords()
  const [form, setForm] = useState<WordForm>({ word: '', meaning: '', phonetic: '', sentences: [] })
  // Errors appear after the first save attempt, then follow the input as it is corrected.
  const [submitted, setSubmitted] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const errors = submitted ? validateWordForm(form).errors : []
  const typed = form.word.trim().toLowerCase()
  const alreadyListed = typed !== '' && wordsState.status === 'ready'
    && wordsState.data.some((w) => w.word.toLowerCase() === typed)

  const setField = (key: 'word' | 'meaning' | 'phonetic', value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const setRow = (index: number, key: keyof SentenceRow, value: string) =>
    setForm((prev) => ({
      ...prev,
      sentences: prev.sentences.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)
    setSubmitted(true)
    const { input } = validateWordForm(form)
    if (!input) return
    setSaving(true)
    try {
      await addWord(input)
      navigate('/')
    } catch (err) {
      console.error('[AddPage] save failed:', err)
      setSaveError('保存に失敗しました')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <header className="sticky top-0 bg-[var(--ios-grouped-bg)] py-3 z-10 flex items-center justify-between">
        <h1 className="text-xl font-bold">単語を追加</h1>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>キャンセル</Button>
      </header>

      <form onSubmit={save} noValidate className="mt-2 space-y-5">
        <section>
          <p className="text-xs text-muted-foreground uppercase tracking-wide px-1 mb-1">単語情報</p>
          <div className="bg-white rounded-2xl divide-y divide-border px-4">
            <Input aria-label="英単語" placeholder="英単語（例: apple）" autoComplete="off"
              value={form.word} onChange={(e) => setField('word', e.target.value)} className={fieldClass} />
            <Input aria-label="意味" placeholder="意味（例: りんご）" autoComplete="off"
              value={form.meaning} onChange={(e) => setField('meaning', e.target.value)} className={fieldClass} />
            <Input aria-label="発音記号" placeholder="発音記号（任意）" autoComplete="off"
              value={form.phonetic} onChange={(e) => setField('phonetic', e.target.value)} className={fieldClass} />
          </div>
          {alreadyListed && (
            <p className="text-xs text-[var(--ios-orange)] px-1 mt-1.5">「{form.word.trim()}」は登録済みです</p>
          )}
        </section>

        <section>
          <p className="text-xs text-muted-foreground uppercase tracking-wide px-1 mb-1">例文（任意）</p>
          <div className="space-y-2">
            {form.sentences.map((row, i) => (
              <div key={i} className="bg-white rounded-2xl pl-4 pr-2 py-1 flex gap-2">
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
          type="submit" disabled={saving}
          className="w-full bg-[var(--ios-blue)] hover:bg-[var(--ios-blue)]/90 text-white"
        >
          保存
        </Button>
      </form>
    </div>
  )
}
