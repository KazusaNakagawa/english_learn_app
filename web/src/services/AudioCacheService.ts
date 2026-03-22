/**
 * AudioCacheService — IndexedDB-backed audio cache for VOICEVOX WAV blobs.
 *
 * Cache key: `${text}_${speakerId}` (SHA-256 hex)
 * Store    : EnglishLearnDB / audio_cache (opened by PoC; reused here)
 * Eviction : LRU — evicts oldest last_accessed_at records when over maxBytes
 */

const DB_NAME = 'EnglishLearnDB'
const DB_VERSION = 1
const STORE = 'audio_cache'

export interface AudioCacheRecord {
  id: string           // SHA-256 cache key
  text: string
  speaker_id: string
  audio_data: Blob
  size_bytes: number
  created_at: string
  last_accessed_at: string
}

async function openDB(): Promise<IDBDatabase> {
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
      if (!db.objectStoreNames.contains(STORE)) {
        const cache = db.createObjectStore(STORE, { keyPath: 'id' })
        cache.createIndex('created_at', 'created_at')
        cache.createIndex('last_accessed_at', 'last_accessed_at')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function makeCacheKey(text: string, speakerId: string): Promise<string> {
  return sha256(`${text}_${speakerId}`)
}

export async function getCache(cacheKey: string): Promise<AudioCacheRecord | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).get(cacheKey)
    req.onsuccess = () => {
      const record = req.result as AudioCacheRecord | undefined
      if (!record) { resolve(null); return }
      // update last_accessed_at (LRU touch)
      record.last_accessed_at = new Date().toISOString()
      tx.objectStore(STORE).put(record)
    }
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => resolve(req.result as AudioCacheRecord | null)
    tx.onerror    = () => reject(tx.error)
  })
}

export async function putCache(
  cacheKey: string,
  text: string,
  speakerId: string,
  blob: Blob,
): Promise<void> {
  const db = await openDB()
  const now = new Date().toISOString()
  const record: AudioCacheRecord = {
    id: cacheKey,
    text,
    speaker_id: speakerId,
    audio_data: blob,
    size_bytes: blob.size,
    created_at: now,
    last_accessed_at: now,
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).put(record)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

export async function getCacheUsage(): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => {
      const total = (req.result as AudioCacheRecord[]).reduce((s, r) => s + r.size_bytes, 0)
      resolve(total)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function clearCache(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).clear()
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

/** LRU eviction: remove oldest last_accessed_at records until total < maxBytes */
export async function evictCache(maxBytes: number): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(STORE, 'readwrite')

  const records: AudioCacheRecord[] = await new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE).index('last_accessed_at').getAll()
    req.onsuccess = () => resolve(req.result as AudioCacheRecord[])
    req.onerror   = () => reject(req.error)
  })

  let total = records.reduce((s, r) => s + r.size_bytes, 0)
  if (total <= maxBytes) return

  // oldest first
  records.sort((a, b) => a.last_accessed_at.localeCompare(b.last_accessed_at))

  for (const r of records) {
    if (total <= maxBytes) break
    tx.objectStore(STORE).delete(r.id)
    total -= r.size_bytes
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}
