/** The word form shared by the add and edit pages, and turning what was typed into something storable. */

import type { Sentence, Word } from '@/types/word'

/**
 * A sentence being typed. `key` keeps React rows stable when one is removed;
 * `id` is set for a sentence that is already stored, so editing keeps it.
 * `generated` marks a row from AI generation that the user has not touched,
 * which generating again may replace.
 */
export type SentenceRow = Omit<Sentence, 'id'> & { key: string; id?: string; generated?: boolean }

/** A sentence ready to store, with its id when it already exists. */
export type SentenceInput = Omit<Sentence, 'id'> & { id?: string }

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
  sentences: SentenceInput[]
}

let nextRowKey = 0

export const emptySentenceRow = (): SentenceRow => ({
  key: `row-${nextRowKey++}`,
  english: '',
  japanese: '',
  category: '',
})

/** A row added but never filled in, spaces included. */
export function isBlankRow(row: Omit<Sentence, 'id'>): boolean {
  return !row.english.trim() && !row.japanese.trim() && !row.category.trim()
}

export function formFromWord(word: Word): WordForm {
  return {
    word: word.word,
    meaning: word.meaning,
    phonetic: word.phonetic,
    sentences: word.sentences.map((s) => ({
      key: `row-${nextRowKey++}`,
      id: s.id,
      english: s.english,
      japanese: s.japanese,
      category: s.category,
    })),
  }
}

export function validateWordForm(form: WordForm): { errors: string[]; input: WordInput | null } {
  const errors: string[] = []
  const word = form.word.trim()
  const meaning = form.meaning.trim()
  if (!word) errors.push('英単語を入力してください')
  if (!meaning) errors.push('意味を入力してください')

  const sentences: SentenceInput[] = []
  form.sentences.forEach((row, i) => {
    const english = row.english.trim()
    const japanese = row.japanese.trim()
    const category = row.category.trim()
    if (isBlankRow(row)) return
    if (!english || !japanese) {
      errors.push(`例文${i + 1}: 英文と和訳の両方を入力してください`)
      return
    }
    sentences.push(row.id ? { id: row.id, english, japanese, category } : { english, japanese, category })
  })

  if (errors.length > 0) return { errors, input: null }
  return { errors, input: { word, meaning, phonetic: form.phonetic.trim(), sentences } }
}
