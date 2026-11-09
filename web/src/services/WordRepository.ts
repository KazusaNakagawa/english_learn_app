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

function byWord(a: Word, b: Word): number {
  const [x, y] = [a.word.toLowerCase(), b.word.toLowerCase()]
  return x < y ? -1 : x > y ? 1 : 0
}

/** Words on the active list, alphabetically. */
export async function getWords(): Promise<Word[]> {
  const words: Word[] = await read((store) => store.getAll())
  return words.filter((w) => !w.deletedAt && !w.archivedAt).sort(byWord)
}

export async function getWord(id: string): Promise<Word | null> {
  const word: Word | undefined = await read((store) => store.get(id))
  return word ?? null
}
