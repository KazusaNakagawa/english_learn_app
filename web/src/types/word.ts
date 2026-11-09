/** Mirrors the iOS `Word` model. Dates are ISO 8601 strings. */
export interface Sentence {
  id: string
  english: string
  japanese: string
  category: string
}

export interface Word {
  id: string
  word: string
  meaning: string
  phonetic: string
  sentences: Sentence[]
  createdAt?: string
  deletedAt?: string
  archivedAt?: string
  isFavorite?: boolean
}
