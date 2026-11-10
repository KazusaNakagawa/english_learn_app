/**
 * WordRepository — the user's word list in IndexedDB.
 *
 * Words are stored with their sentences nested, matching the iOS words.json.
 * The sample words seed a new database once, so they disappear once replaced
 * and do not come back when the list is emptied.
 */

import { SAMPLE_WORDS } from '@/data/sampleWords'
import { newId } from '@/lib/id'
import type { WordInput } from '@/lib/wordForm'
import type { Word } from '@/types/word'
import { openDB } from './db'

const STORE = 'words'

/** Not a word, so every read skips it. Its presence means seeding is done. */
export const SEEDED_MARKER_ID = '__samples_seeded__'

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Runs a read-then-write in one transaction, so a failure changes nothing. */
function inTransaction<T>(
  db: IDBDatabase,
  work: (store: IDBObjectStore, finish: (value: T) => void) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    let outcome: T
    work(tx.objectStore(STORE), (value) => { outcome = value })
    tx.oncomplete = () => resolve(outcome)
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
  })
}

/**
 * Seeds the samples the first time a database is used, unless it already holds
 * words. The check and the writes share one transaction, so racing first loads
 * cannot double up.
 */
function seedOnce(db: IDBDatabase): Promise<void> {
  return inTransaction<void>(db, (store, finish) => {
    const marker = store.get(SEEDED_MARKER_ID)
    marker.onsuccess = () => {
      if (marker.result) return finish()
      // Only the first read of a database gets here, so reading it all is cheap.
      const all = store.getAll()
      all.onsuccess = () => {
        if (!all.result.some(isWord)) SAMPLE_WORDS.forEach((word) => store.put(word))
        store.put({ id: SEEDED_MARKER_ID })
        finish()
      }
    }
  })
}

async function read<T>(query: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB()
  try {
    await seedOnce(db)
    return await result(query(db.transaction(STORE).objectStore(STORE)))
  } finally {
    db.close()
  }
}

async function update<T>(work: (store: IDBObjectStore, finish: (value: T) => void) => void): Promise<T> {
  const db = await openDB()
  try {
    return await inTransaction(db, work)
  } finally {
    db.close()
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSentence(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.english === 'string'
    && typeof value.japanese === 'string'
    && typeof value.category === 'string'
}

/**
 * Older builds of the PoC screen wrote records of their own shape into this
 * store, and pages would crash on them, so only well-formed words are read.
 */
function isWord(value: unknown): value is Word {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.word === 'string'
    && typeof value.meaning === 'string'
    && typeof value.phonetic === 'string'
    && Array.isArray(value.sentences)
    && value.sentences.every(isSentence)
}

function byWord(a: Word, b: Word): number {
  const [x, y] = [a.word.toLowerCase(), b.word.toLowerCase()]
  return x < y ? -1 : x > y ? 1 : 0
}

/** iOS compares UUIDs ignoring case, and its exports are uppercase. */
const sameId = (id: IDBValidKey) => String(id).toUpperCase()

const isHidden = (w: Word) => !!(w.deletedAt || w.archivedAt)

/** Keeps the last of each id, as writing them in order would. */
function lastPerId(words: Word[]): Word[] {
  return [...new Map(words.map((w) => [sameId(w.id), w])).values()]
}

async function allWords(): Promise<Word[]> {
  const records: unknown[] = await read((store) => store.getAll())
  return records.filter(isWord)
}

/** Words on the active list, alphabetically. */
export async function getWords(): Promise<Word[]> {
  return (await allWords()).filter((w) => !isHidden(w)).sort(byWord)
}

export async function getWord(id: string): Promise<Word | null> {
  const record: unknown = await read((store) => store.get(id))
  return isWord(record) ? record : null
}

/** Lowercased spellings of every word not in the trash, archived ones included, for duplicate checks. */
export async function getListedSpellings(): Promise<Set<string>> {
  return new Set((await allWords()).filter((w) => !w.deletedAt).map((w) => w.word.toLowerCase()))
}

/** Everything iOS would export: all words except those in the trash. */
export async function getWordsForExport(): Promise<Word[]> {
  return (await allWords()).filter((w) => !w.deletedAt).sort(byWord)
}

export interface MergeResult {
  added: number
  /** Ids already stored, trash included. */
  skipped: number
  /** Repeats of an id earlier in the same file. */
  duplicates: number
  /** Added words that are archived or trashed, so the list does not show them. */
  hidden: number
}

/** Adds words whose id is not stored yet, trash included, as iOS does. */
export function mergeWords(imported: Word[], now = Date.now()): Promise<MergeResult> {
  return update((store, finish) => {
    const all: IDBRequest<unknown[]> = store.getAll()
    all.onsuccess = () => {
      const stored = new Set<string>()
      for (const record of all.result) {
        if (!isRecord(record) || typeof record.id !== 'string') continue
        // Expired trash is as good as gone, so its id may come back.
        if (isWord(record) && isExpiredTrash(record, now)) store.delete(record.id)
        else stored.add(sameId(record.id))
      }
      const seen = new Set<string>()
      let duplicates = 0
      const fresh = imported.filter((w) => {
        const id = sameId(w.id)
        if (seen.has(id)) { duplicates++; return false }
        seen.add(id)
        return !stored.has(id)
      })
      fresh.forEach((w) => store.put(w))
      finish({
        added: fresh.length,
        skipped: seen.size - fresh.length,
        duplicates,
        hidden: fresh.filter(isHidden).length,
      })
    }
  })
}

export interface ReplaceResult {
  stored: number
  hidden: number
}

/** Replaces everything except trashed words whose id is not being imported. */
export function replaceWords(imported: Word[], now = Date.now()): Promise<ReplaceResult> {
  const words = lastPerId(imported)
  const ids = new Set(words.map((w) => sameId(w.id)))
  return update((store, finish) => {
    // Deleting in place keeps the trash where it is instead of rewriting it.
    const cursor = store.openCursor()
    cursor.onsuccess = () => {
      const current = cursor.result
      if (current) {
        const record: unknown = current.value
        const isMarker = isRecord(record) && record.id === SEEDED_MARKER_ID
        const keep = isMarker || (
          isWord(record) && !!record.deletedAt && !isExpiredTrash(record, now) && !ids.has(sameId(record.id))
        )
        if (!keep) current.delete()
        current.continue()
        return
      }
      words.forEach((w) => store.put(w))
      finish({ stored: words.length, hidden: words.filter(isHidden).length })
    }
  })
}

export const TRASH_RETENTION_DAYS = 10
const DAY_MS = 24 * 60 * 60 * 1000

/** Rewrites one word, or deletes it when `change` returns null. Unknown ids are ignored. */
function modifyWord(id: string, change: (word: Word) => Word | null): Promise<void> {
  return update<void>((store, finish) => {
    const request = store.get(id)
    request.onsuccess = () => {
      const record: unknown = request.result
      if (isWord(record)) {
        const next = change(record)
        if (next) store.put(next)
        else store.delete(id)
      }
      finish()
    }
  })
}

export function trashWord(id: string, now = new Date()): Promise<void> {
  return modifyWord(id, (word) => ({ ...word, deletedAt: now.toISOString() }))
}

export function restoreWord(id: string): Promise<void> {
  return modifyWord(id, (word) => {
    const restored = { ...word }
    delete restored.deletedAt
    return restored
  })
}

export function deleteWordPermanently(id: string): Promise<void> {
  return modifyWord(id, () => null)
}

/** Due for purging once the full retention period has passed, the moment the days left reach 0. */
function isExpiredTrash(word: Word, now: number): boolean {
  return !!word.deletedAt && Date.parse(word.deletedAt) + TRASH_RETENTION_DAYS * DAY_MS <= now
}

/** Whole days left, rounded up, so a word trashed just now shows the full 10. */
export function daysUntilPurge(deletedAt: string, now = Date.now()): number {
  const left = Date.parse(deletedAt) + TRASH_RETENTION_DAYS * DAY_MS - now
  return Math.max(0, Math.ceil(left / DAY_MS))
}

/**
 * Trashed words, newest first. Words trashed more than 10 days ago are purged
 * on the way, as the iOS app does.
 */
export function getTrashedWords(now = Date.now()): Promise<Word[]> {
  return update<Word[]>((store, finish) => {
    const trashed: Word[] = []
    const cursor = store.openCursor()
    cursor.onsuccess = () => {
      const current = cursor.result
      if (current) {
        const record: unknown = current.value
        if (isWord(record) && record.deletedAt) {
          if (isExpiredTrash(record, now)) current.delete()
          else trashed.push(record)
        }
        current.continue()
        return
      }
      finish(trashed.sort((a, b) => Date.parse(b.deletedAt ?? '') - Date.parse(a.deletedAt ?? '')))
    }
  })
}

/**
 * Stores a word typed in by the user, giving it and its sentences new ids.
 * Adding to a database that has never been read leaves the samples out on
 * purpose: someone whose first act is adding a word is starting their own list.
 */
export async function addWord(input: WordInput, now = new Date()): Promise<Word> {
  const word: Word = {
    id: newId(),
    word: input.word,
    meaning: input.meaning,
    phonetic: input.phonetic,
    sentences: input.sentences.map((s) => ({ id: newId(), ...s })),
    createdAt: now.toISOString(),
    isFavorite: false,
  }
  await update<void>((store, finish) => {
    store.put(word)
    finish()
  })
  return word
}
