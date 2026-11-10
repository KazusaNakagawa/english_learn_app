/** The add-word form, and turning what was typed into something storable. */

import type { Sentence } from '@/types/word'

/** A sentence being typed. `key` keeps React rows stable when one is removed. */
export type SentenceRow = Omit<Sentence, 'id'> & { key: string }

export interface WordForm {
  word: string
  meaning: string
  phonetic: string
  sentences: SentenceRow[]
}

/** A validated form: trimmed, with empty sentence rows dropped and row keys gone. */
export interface WordInput {
  word: string
  meaning: string
  phonetic: string
  sentences: Omit<Sentence, 'id'>[]
}

let nextRowKey = 0

export const emptySentenceRow = (): SentenceRow => ({
  key: `row-${nextRowKey++}`,
  english: '',
  japanese: '',
  category: '',
})

export function validateWordForm(form: WordForm): { errors: string[]; input: WordInput | null } {
  const errors: string[] = []
  const word = form.word.trim()
  const meaning = form.meaning.trim()
  if (!word) errors.push('英単語を入力してください')
  if (!meaning) errors.push('意味を入力してください')

  const sentences: Omit<Sentence, 'id'>[] = []
  form.sentences.forEach((row, i) => {
    const english = row.english.trim()
    const japanese = row.japanese.trim()
    const category = row.category.trim()
    if (!english && !japanese && !category) return // a row added but never filled in
    if (!english || !japanese) {
      errors.push(`例文${i + 1}: 英文と和訳の両方を入力してください`)
      return
    }
    sentences.push({ english, japanese, category })
  })

  if (errors.length > 0) return { errors, input: null }
  return { errors, input: { word, meaning, phonetic: form.phonetic.trim(), sentences } }
}
