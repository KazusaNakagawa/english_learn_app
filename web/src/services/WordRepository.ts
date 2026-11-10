/**
 * WordRepository — the user's word list in IndexedDB.
 *
 * Words are stored with their sentences nested, matching the iOS words.json.
 * The sample words seed an empty store, so they disappear once replaced.
 */

import { SAMPLE_WORDS } from '@/data/sampleWords'
import type { Word } from '@/types/word'
import { openDB } from './db'

const STORE = 'words'

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

/** Count and writes share one transaction, so racing first loads cannot double up. */
function seedIfEmpty(db: IDBDatabase): Promise<void> {
  return inTransaction<void>(db, (store, finish) => {
    const count = store.count()
    count.onsuccess = () => {
      if (count.result === 0) SAMPLE_WORDS.forEach((word) => store.put(word))
      finish()
    }
  })
}

async function read<T>(query: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB()
  try {
    await seedIfEmpty(db)
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

/**
 * The PoC screen writes records of its own shape into this store, without
 * sentences. Pages would crash on them, so only well-formed words are read.
 */
function isWord(value: unknown): value is Word {
  if (typeof value !== 'object' || value === null) return false
  const w = value as Record<string, unknown>
  return typeof w.id === 'string'
    && typeof w.word === 'string'
    && typeof w.meaning === 'string'
    && typeof w.phonetic === 'string'
    && Array.isArray(w.sentences)
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
export function mergeWords(imported: Word[]): Promise<MergeResult> {
  return update((store, finish) => {
    const keys = store.getAllKeys()
    keys.onsuccess = () => {
      const stored = new Set(keys.result.map(sameId))
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
export function replaceWords(imported: Word[]): Promise<ReplaceResult> {
  const words = lastPerId(imported)
  const ids = new Set(words.map((w) => sameId(w.id)))
  return update((store, finish) => {
    // Deleting in place keeps the trash where it is instead of rewriting it.
    const cursor = store.openCursor()
    cursor.onsuccess = () => {
      const current = cursor.result
      if (current) {
        const record: unknown = current.value
        const keep = isWord(record) && !!record.deletedAt && !ids.has(sameId(record.id))
        if (!keep) current.delete()
        current.continue()
        return
      }
      words.forEach((w) => store.put(w))
      finish({ stored: words.length, hidden: words.filter(isHidden).length })
    }
  })
}
