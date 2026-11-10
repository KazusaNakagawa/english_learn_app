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

/** Count and writes share one transaction, so racing first loads cannot double up. */
function seedIfEmpty(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const count = store.count()
    count.onsuccess = () => {
      if (count.result === 0) SAMPLE_WORDS.forEach((word) => store.put(word))
    }
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error)
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

/** Words on the active list, alphabetically. */
export async function getWords(): Promise<Word[]> {
  const records: unknown[] = await read((store) => store.getAll())
  return records.filter(isWord).filter((w) => !w.deletedAt && !w.archivedAt).sort(byWord)
}

export async function getWord(id: string): Promise<Word | null> {
  const record: unknown = await read((store) => store.get(id))
  return isWord(record) ? record : null
}

/** Everything iOS would export: all words except those in the trash. */
export async function getWordsForExport(): Promise<Word[]> {
  const words: Word[] = await read((store) => store.getAll())
  return words.filter((w) => !w.deletedAt).sort(byWord)
}

/** Runs a read-then-write in one transaction, so a failure changes nothing. */
async function update<T>(work: (store: IDBObjectStore, finish: (value: T) => void) => void): Promise<T> {
  const db = await openDB()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      let outcome: T
      work(tx.objectStore(STORE), (value) => { outcome = value })
      tx.oncomplete = () => resolve(outcome)
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
    })
  } finally {
    db.close()
  }
}

export interface MergeResult {
  added: number
  skipped: number
}

/** Adds words whose id is not stored yet, trash included, as iOS does. */
export function mergeWords(imported: Word[]): Promise<MergeResult> {
  return update((store, finish) => {
    const keys = store.getAllKeys()
    keys.onsuccess = () => {
      const seen = new Set<IDBValidKey>(keys.result)
      const fresh = imported.filter((w) => !seen.has(w.id) && seen.add(w.id))
      fresh.forEach((w) => store.put(w))
      finish({ added: fresh.length, skipped: imported.length - fresh.length })
    }
  })
}

/** Replaces everything except trashed words whose id is not being imported. */
export function replaceWords(imported: Word[]): Promise<void> {
  return update((store, finish) => {
    const all: IDBRequest<Word[]> = store.getAll()
    all.onsuccess = () => {
      const ids = new Set(imported.map((w) => w.id))
      const trashed = all.result.filter((w) => w.deletedAt && !ids.has(w.id))
      store.clear()
      ;[...trashed, ...imported].forEach((w) => store.put(w))
      finish(undefined)
    }
  })
}
