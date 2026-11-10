/** The add-word form, and turning what was typed into something storable. */

export interface SentenceRow {
  english: string
  japanese: string
  category: string
}

export interface WordForm {
  word: string
  meaning: string
  phonetic: string
  sentences: SentenceRow[]
}

/** A validated form: trimmed, with empty sentence rows dropped. */
export type WordInput = WordForm

export const emptySentenceRow = (): SentenceRow => ({ english: '', japanese: '', category: '' })

export function validateWordForm(form: WordForm): { errors: string[]; input: WordInput | null } {
  const errors: string[] = []
  const word = form.word.trim()
  const meaning = form.meaning.trim()
  if (!word) errors.push('英単語を入力してください')
  if (!meaning) errors.push('意味を入力してください')

  const sentences: SentenceRow[] = []
  form.sentences.forEach((row, i) => {
    const english = row.english.trim()
    const japanese = row.japanese.trim()
    if (!english && !japanese) return // a row added but never filled in
    if (!english || !japanese) {
      errors.push(`例文${i + 1}: 英文と和訳の両方を入力してください`)
      return
    }
    sentences.push({ english, japanese, category: row.category.trim() })
  })

  if (errors.length > 0) return { errors, input: null }
  return { errors, input: { word, meaning, phonetic: form.phonetic.trim(), sentences } }
}
