/**
 * WordRepository — the user's word list in IndexedDB.
 *
 * Words are stored with their sentences nested, matching the iOS words.json.
 * The sample words seed a new database once, so they disappear once replaced
 * and do not come back when the list is emptied.
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

/** Not a word, so every read skips it. Its presence means seeding is done. */
export const SEEDED_MARKER_ID = '__samples_seeded__'

/**
 * Seeds the samples the first time a database is used, unless it already holds
 * words. The check and the writes share one transaction, so racing first loads
 * cannot double up.
 */
function seedOnce(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const marker = store.get(SEEDED_MARKER_ID)
    marker.onsuccess = () => {
      if (marker.result) return
      // Only the first read of a database gets here, so reading it all is cheap.
      const all = store.getAll()
      all.onsuccess = () => {
        if (!all.result.some(isWord)) SAMPLE_WORDS.forEach((word) => store.put(word))
        store.put({ id: SEEDED_MARKER_ID })
      }
    }
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error)
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

/** Words on the active list, alphabetically. */
export async function getWords(): Promise<Word[]> {
  const records: unknown[] = await read((store) => store.getAll())
  return records.filter(isWord).filter((w) => !w.deletedAt && !w.archivedAt).sort(byWord)
}

export async function getWord(id: string): Promise<Word | null> {
  const record: unknown = await read((store) => store.get(id))
  return isWord(record) ? record : null
}
