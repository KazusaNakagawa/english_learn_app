/**
 * WordTransfer — the word list file format, shared with the iOS app.
 *
 * Matches what WordDataManager.exportToJSON writes: `{ "words": [...] }`, with
 * dates as Swift's default encoding, seconds since 2001-01-01 UTC.
 */

import type { Sentence, Word } from '@/types/word'

const REFERENCE_DATE_MS = Date.UTC(2001, 0, 1)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A file the app cannot read. The message is written for the user. */
export class WordFileError extends Error {}

type Fields = Record<string, unknown>

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readText(fields: Fields, key: string, where: string): string {
  const value = fields[key]
  if (typeof value !== 'string') throw new WordFileError(`${where}: ${key} がありません`)
  return value
}

/** iOS writes uppercase UUIDs, so one spelling keeps duplicates detectable. */
function readId(fields: Fields, where: string): string {
  const value = readText(fields, 'id', where)
  if (!UUID.test(value)) throw new WordFileError(`${where}: id が UUID ではありません`)
  return value.toUpperCase()
}

function readDate(fields: Fields, key: string, where: string): string | undefined {
  const value = fields[key]
  if (value === undefined || value === null) return undefined
  const date = new Date(typeof value === 'number' ? REFERENCE_DATE_MS + Math.round(value * 1000) : NaN)
  if (Number.isNaN(date.getTime())) throw new WordFileError(`${where}: ${key} が日時ではありません`)
  return date.toISOString()
}

function parseSentence(value: unknown, where: string): Sentence {
  if (!isFields(value)) throw new WordFileError(`${where}: 形式が正しくありません`)
  return {
    id: readId(value, where),
    english: readText(value, 'english', where),
    japanese: readText(value, 'japanese', where),
    category: readText(value, 'category', where),
  }
}

function parseWord(value: unknown, where: string): Word {
  if (!isFields(value)) throw new WordFileError(`${where}: 形式が正しくありません`)
  if (!Array.isArray(value.sentences)) throw new WordFileError(`${where}: sentences がありません`)
  return {
    id: readId(value, where),
    word: readText(value, 'word', where),
    meaning: readText(value, 'meaning', where),
    phonetic: readText(value, 'phonetic', where),
    sentences: value.sentences.map((s, i) => parseSentence(s, `${where}の${i + 1}番目の例文`)),
    createdAt: readDate(value, 'createdAt', where),
    deletedAt: readDate(value, 'deletedAt', where),
    archivedAt: readDate(value, 'archivedAt', where),
    isFavorite: value.isFavorite === true,
  }
}

/** Parses a word list file. Throws WordFileError if any part is invalid. */
export function parseWordFile(text: string): Word[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    throw new WordFileError('JSON ファイルとして読み込めません')
  }
  if (!isFields(parsed) || !Array.isArray(parsed.words)) {
    throw new WordFileError('words の一覧が見つかりません')
  }
  if (parsed.words.length === 0) throw new WordFileError('単語がありません')
  return parsed.words.map((w, i) => parseWord(w, `${i + 1}番目の単語`))
}

function toSeconds(iso: string | undefined): number | undefined {
  return iso === undefined ? undefined : (Date.parse(iso) - REFERENCE_DATE_MS) / 1000
}

export function serializeWords(words: Word[]): string {
  const file = words.map((w) => ({
    ...w,
    createdAt: toSeconds(w.createdAt),
    deletedAt: toSeconds(w.deletedAt),
    archivedAt: toSeconds(w.archivedAt),
    isFavorite: w.isFavorite ?? false,
  }))
  return JSON.stringify({ words: file }, null, 2)
}

export function exportFileName(now = Date.now()): string {
  return `words_export_${Math.floor(now / 1000)}.json`
}
