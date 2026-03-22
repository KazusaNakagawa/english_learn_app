import { useRef, useState } from 'react'

type ResultState = { text: string; type: 'ok' | 'err' | 'warn' | '' }

export default function IndexedDbTab({
  onResult,
}: {
  onResult: (key: string, value: boolean) => void
}) {
  const dbRef = useRef<IDBDatabase | null>(null)
  const [initResult, setInitResult] = useState<ResultState>({ text: '—', type: '' })
  const [wordResult, setWordResult] = useState<ResultState>({ text: '—', type: '' })
  const [blobResult, setBlobResult] = useState<ResultState>({ text: '—', type: '' })
  const [purgeResult, setPurgeResult] = useState<ResultState>({ text: '—', type: '' })

  function requireDB(): IDBDatabase | null {
    if (!dbRef.current) {
      alert('Click "Open / Initialize DB" first')
      return null
    }
    return dbRef.current
  }

  async function initDB() {
    try {
      const req = indexedDB.open('EnglishLearnDB', 1)
      req.onupgradeneeded = (e) => {
        const d = (e.target as IDBOpenDBRequest).result

        const words = d.createObjectStore('words', { keyPath: 'id' })
        words.createIndex('status', 'status')
        words.createIndex('created_at', 'created_at')
        words.createIndex('word', 'word')

        const sentences = d.createObjectStore('sentences', { keyPath: 'id' })
        sentences.createIndex('word_id', 'word_id')

        const audioCache = d.createObjectStore('audio_cache', { keyPath: 'id' })
        audioCache.createIndex('created_at', 'created_at')
        audioCache.createIndex('last_accessed_at', 'last_accessed_at')
      }
      const db = await new Promise<IDBDatabase>((res, rej) => {
        req.onsuccess = () => res(req.result)
        req.onerror = () => rej(req.error)
      })
      dbRef.current = db
      const stores = Array.from(db.objectStoreNames).join(', ')
      setInitResult({ text: `✓ EnglishLearnDB v${db.version}\nStores: ${stores}`, type: 'ok' })
      onResult('idb_init', true)
    } catch (err) {
      setInitResult({ text: `✗ ${err}`, type: 'err' })
      onResult('idb_init', false)
    }
  }

  async function deleteDB() {
    dbRef.current?.close()
    dbRef.current = null
    await new Promise<void>((res, rej) => {
      const req = indexedDB.deleteDatabase('EnglishLearnDB')
      req.onsuccess = () => res()
      req.onerror = () => rej(req.error)
    })
    setInitResult({ text: '✓ Database deleted', type: 'ok' })
    onResult('idb_init', false)
  }

  async function saveWord() {
    const db = requireDB()
    if (!db) return
    const word = {
      id: crypto.randomUUID(),
      word: 'validate',
      meaning: '検証する',
      phonetic: 'ˈvæl.ɪ.deɪt',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      archived_at: null,
    }
    const tx = db.transaction('words', 'readwrite')
    await new Promise<void>((res, rej) => {
      const req = tx.objectStore('words').add(word)
      req.onsuccess = () => res()
      req.onerror = () => rej(req.error)
    })
    setWordResult({ text: `✓ Saved:\n${JSON.stringify(word, null, 2)}`, type: 'ok' })
  }

  async function getAllWords() {
    const db = requireDB()
    if (!db) return
    const tx = db.transaction('words', 'readonly')
    const words = await new Promise<object[]>((res, rej) => {
      const req = tx.objectStore('words').getAll()
      req.onsuccess = () => res(req.result as object[])
      req.onerror = () => rej(req.error)
    })
    setWordResult({ text: `✓ ${words.length} word(s):\n${JSON.stringify(words, null, 2)}`, type: 'ok' })
  }

  async function filterActive() {
    const db = requireDB()
    if (!db) return
    const tx = db.transaction('words', 'readonly')
    const words = await new Promise<object[]>((res, rej) => {
      const req = tx.objectStore('words').index('status').getAll('active')
      req.onsuccess = () => res(req.result as object[])
      req.onerror = () => rej(req.error)
    })
    setWordResult({ text: `✓ ${words.length} active word(s):\n${JSON.stringify(words, null, 2)}`, type: 'ok' })
  }

  async function clearWords() {
    const db = requireDB()
    if (!db) return
    const tx = db.transaction('words', 'readwrite')
    await new Promise<void>((res, rej) => {
      const req = tx.objectStore('words').clear()
      req.onsuccess = () => res()
      req.onerror = () => rej(req.error)
    })
    setWordResult({ text: '✓ words store cleared', type: 'ok' })
  }

  async function saveBlob() {
    const db = requireDB()
    if (!db) return
    const bytes = new Uint8Array(100 * 1024)
    crypto.getRandomValues(bytes)
    const blob = new Blob([bytes], { type: 'audio/wav' })
    const record = {
      id: 'test-audio-key-001',
      text: 'こんにちは',
      speaker_id: 3,
      audio_data: blob,
      size_bytes: blob.size,
      created_at: new Date().toISOString(),
      last_accessed_at: new Date().toISOString(),
    }
    const tx = db.transaction('audio_cache', 'readwrite')
    await new Promise<void>((res, rej) => {
      const req = tx.objectStore('audio_cache').put(record)
      req.onsuccess = () => res()
      req.onerror = () => rej(req.error)
    })
    setBlobResult({
      text: `✓ Stored 100 KB Blob\nKey: ${record.id}\nSize: ${(blob.size / 1024).toFixed(1)} KB`,
      type: 'ok',
    })
    onResult('idb_blob', true)
  }

  async function getBlob() {
    const db = requireDB()
    if (!db) return
    const tx = db.transaction('audio_cache', 'readonly')
    const record = await new Promise<Record<string, unknown> | undefined>((res, rej) => {
      const req = tx.objectStore('audio_cache').get('test-audio-key-001')
      req.onsuccess = () => res(req.result as Record<string, unknown> | undefined)
      req.onerror = () => rej(req.error)
    })
    if (!record) {
      setBlobResult({ text: '⚠ No cache found. Click "Store Blob" first.', type: 'warn' })
      return
    }
    setBlobResult({
      text: `✓ Retrieved Blob\nKey: ${record.id}\nSize: ${((record.size_bytes as number) / 1024).toFixed(1)} KB\nBlob valid: ${record.audio_data instanceof Blob}`,
      type: 'ok',
    })
  }

  async function runPurge() {
    const db = requireDB()
    if (!db) return
    const oldDate = new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString()
    const word = {
      id: `purge-test-${Date.now()}`,
      word: 'obsolete',
      meaning: '廃れた',
      phonetic: '',
      status: 'deleted',
      created_at: oldDate,
      updated_at: oldDate,
      deleted_at: oldDate,
      archived_at: null,
    }
    const tx1 = db.transaction('words', 'readwrite')
    await new Promise<void>((res, rej) => {
      const req = tx1.objectStore('words').put(word)
      req.onsuccess = () => res()
      req.onerror = () => rej(req.error)
    })

    const threshold = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const tx2 = db.transaction('words', 'readwrite')
    let purged = 0
    await new Promise<void>((res, rej) => {
      const req = tx2.objectStore('words').index('status').openCursor('deleted')
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result
        if (!cursor) { res(); return }
        const val = cursor.value as { deleted_at: string | null }
        if (val.deleted_at && val.deleted_at < threshold) {
          cursor.delete()
          purged++
        }
        cursor.continue()
      }
      req.onerror = () => rej(req.error)
    })
    setPurgeResult({
      text: `✓ Purge complete: ${purged} record(s) deleted (deleted_at > 10 days)`,
      type: 'ok',
    })
    onResult('idb_purge', true)
  }

  const resultStyle: Record<string, string> = {
    ok: 'bg-green-50 text-green-800',
    err: 'bg-red-50 text-red-800',
    warn: 'bg-yellow-50 text-yellow-800',
    '': 'bg-gray-50 text-gray-600',
  }

  function Result({ state }: { state: ResultState }) {
    return (
      <pre className={`text-xs px-3 py-2 rounded whitespace-pre-wrap break-all mt-2 ${resultStyle[state.type]}`}>
        {state.text}
      </pre>
    )
  }

  function Btn({ onClick, label, danger }: { onClick: () => void; label: string; danger?: boolean }) {
    return (
      <button
        onClick={onClick}
        className={`px-3 py-1.5 rounded text-sm font-medium ${danger ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-800'}`}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg p-4 shadow-sm space-y-2">
        <h3 className="font-semibold text-sm">Database Initialization</h3>
        <div className="flex gap-2">
          <button onClick={initDB} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">
            Open / Init DB
          </button>
          <Btn onClick={deleteDB} label="Delete DB" danger />
        </div>
        <Result state={initResult} />
      </div>

      <div className="bg-white rounded-lg p-4 shadow-sm space-y-2">
        <h3 className="font-semibold text-sm">Word Store — CRUD</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={saveWord} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">
            Save sample word
          </button>
          <Btn onClick={getAllWords} label="Get all words" />
          <Btn onClick={filterActive} label="Filter status=active" />
          <Btn onClick={clearWords} label="Clear store" danger />
        </div>
        <Result state={wordResult} />
      </div>

      <div className="bg-white rounded-lg p-4 shadow-sm space-y-2">
        <h3 className="font-semibold text-sm">Audio Cache Store — Blob Storage</h3>
        <p className="text-xs text-gray-500">Stores a 100 KB simulated WAV Blob.</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={saveBlob} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">
            Store 100 KB Blob
          </button>
          <Btn onClick={getBlob} label="Retrieve Blob" />
        </div>
        <Result state={blobResult} />
      </div>

      <div className="bg-white rounded-lg p-4 shadow-sm space-y-2">
        <h3 className="font-semibold text-sm">Soft-delete Auto-purge (10-day)</h3>
        <button onClick={runPurge} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">
          Run purge test
        </button>
        <Result state={purgeResult} />
      </div>
    </div>
  )
}
