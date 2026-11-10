import { openDB } from '@/services/db'

/** Archives a stored word by spelling. The app has no archive action yet. */
export async function archiveForTest(spelling: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('words', 'readwrite')
  const store = tx.objectStore('words')
  const all = store.getAll()
  all.onsuccess = () => {
    for (const record of all.result) {
      if (record.word === spelling) store.put({ ...record, archivedAt: '2026-11-01T00:00:00.000Z' })
    }
  }
  await new Promise((resolve) => { tx.oncomplete = resolve })
  db.close()
}
