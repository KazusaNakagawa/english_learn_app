/** The app's single IndexedDB database, shared by every store. */

const DB_NAME = 'EnglishLearnDB'
const DB_VERSION = 1

export async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('words')) {
        const words = db.createObjectStore('words', { keyPath: 'id' })
        words.createIndex('status', 'status')
        words.createIndex('created_at', 'created_at')
        words.createIndex('word', 'word')
      }
      if (!db.objectStoreNames.contains('sentences')) {
        const sentences = db.createObjectStore('sentences', { keyPath: 'id' })
        sentences.createIndex('word_id', 'word_id')
      }
      if (!db.objectStoreNames.contains('audio_cache')) {
        const cache = db.createObjectStore('audio_cache', { keyPath: 'id' })
        cache.createIndex('created_at', 'created_at')
        cache.createIndex('last_accessed_at', 'last_accessed_at')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}
