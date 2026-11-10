import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SAMPLE_WORDS } from '@/data/sampleWords'
import { openDB } from '@/services/db'
import { getWord, getWords, getWordsForExport, mergeWords, replaceWords, SEEDED_MARKER_ID } from '@/services/WordRepository'
import { parseWordFile, serializeWords } from '@/services/WordTransfer'
import type { Word } from '@/types/word'

const makeWord = (id: string, word: string, extra: Partial<Word> = {}): Word => ({
  id,
  word,
  meaning: `${word} の意味`,
  phonetic: '',
  sentences: [{ id: `${id}-s`, english: `${word} sentence.`, japanese: '例文', category: '一般' }],
  ...extra,
})

async function store(...words: Word[]) {
  const db = await openDB()
  const tx = db.transaction('words', 'readwrite')
  words.forEach((w) => tx.objectStore('words').put(w))
  await new Promise((resolve) => { tx.oncomplete = resolve })
  db.close()
}

const TRASHED_AT = '2026-11-01T00:00:00.000Z'

describe('WordRepository', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('getWords', () => {
    it('seeds the sample words into an empty store', async () => {
      const words = await getWords()
      expect(words).toHaveLength(SAMPLE_WORDS.length)
      expect(words.map((w) => w.id).sort()).toEqual(SAMPLE_WORDS.map((w) => w.id).sort())
    })

    it('returns stored words instead of the samples once any exist', async () => {
      await store(makeWord('a', 'apple'))
      await expect(getWords()).resolves.toEqual([makeWord('a', 'apple')])
    })

    it('does not bring the samples back on a later read', async () => {
      await store(makeWord('a', 'apple'))
      await getWords()
      await expect(getWords()).resolves.toHaveLength(1)
    })

    it('sorts alphabetically regardless of case', async () => {
      await store(makeWord('1', 'cherry'), makeWord('2', 'Banana'), makeWord('3', 'apple'))
      const words = await getWords()
      expect(words.map((w) => w.word)).toEqual(['apple', 'Banana', 'cherry'])
    })

    it('leaves out deleted and archived words', async () => {
      await store(
        makeWord('a', 'active'),
        makeWord('d', 'deleted', { deletedAt: '2026-11-01T00:00:00.000Z' }),
        makeWord('r', 'archived', { archivedAt: '2026-11-01T00:00:00.000Z' }),
      )
      const words = await getWords()
      expect(words.map((w) => w.word)).toEqual(['active'])
    })

    it('returns an empty list when every stored word is hidden', async () => {
      await store(makeWord('d', 'deleted', { deletedAt: '2026-11-01T00:00:00.000Z' }))
      await expect(getWords()).resolves.toEqual([])
    })

    it('does not duplicate the samples when reads race on first load', async () => {
      await Promise.all([getWords(), getWords(), getWord(SAMPLE_WORDS[0].id)])
      await expect(getWords()).resolves.toHaveLength(SAMPLE_WORDS.length)
    })

    it('ignores records written by the PoC screen, which have no sentences', async () => {
      const poc = { id: 'purge-test-1', word: 'poc', meaning: 'x', status: 'active', deleted_at: null }
      await store(makeWord('a', 'apple'), poc as unknown as Word)
      const words = await getWords()
      expect(words.map((w) => w.word)).toEqual(['apple'])
      await expect(getWord('purge-test-1')).resolves.toBeNull()
    })

    it('seeds the samples when the store holds only PoC records', async () => {
      await store({ id: 'purge-test-1', word: 'poc', meaning: 'x' } as unknown as Word)
      await expect(getWords()).resolves.toHaveLength(SAMPLE_WORDS.length)
    })

    it('does not seed again once the list has been emptied', async () => {
      await getWords()
      const db = await openDB()
      const tx = db.transaction('words', 'readwrite')
      SAMPLE_WORDS.forEach((w) => tx.objectStore('words').delete(w.id))
      await new Promise((resolve) => { tx.oncomplete = resolve })
      db.close()
      await expect(getWords()).resolves.toEqual([])
    })

    it('marks a store that already held words as seeded without adding samples', async () => {
      await store(makeWord('a', 'apple'))
      await getWords()
      const db = await openDB()
      const marker = await new Promise((resolve) => {
        const req = db.transaction('words').objectStore('words').get(SEEDED_MARKER_ID)
        req.onsuccess = () => resolve(req.result)
      })
      db.close()
      expect(marker).toBeDefined()
      await expect(getWords()).resolves.toHaveLength(1)
    })

    it('ignores a word whose sentences are malformed', async () => {
      await store(makeWord('a', 'apple'), makeWord('b', 'broken', { sentences: [{ id: 'x' }] as unknown as Word['sentences'] }))
      const words = await getWords()
      expect(words.map((w) => w.word)).toEqual(['apple'])
    })

    it('rejects when the database cannot be opened', async () => {
      vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked') } })
      await expect(getWords()).rejects.toThrow('blocked')
    })
  })

  describe('getWord', () => {
    it('finds a sample word on a first load straight to its page', async () => {
      const word = await getWord(SAMPLE_WORDS[0].id)
      expect(word?.word).toBe(SAMPLE_WORDS[0].word)
      expect(word?.sentences).toHaveLength(SAMPLE_WORDS[0].sentences.length)
    })

    it('resolves null for an unknown id', async () => {
      await expect(getWord('missing')).resolves.toBeNull()
    })
  })

  describe('getWordsForExport', () => {
    it('includes archived words and leaves out trashed ones', async () => {
      await store(
        makeWord('a', 'active'),
        makeWord('r', 'archived', { archivedAt: TRASHED_AT }),
        makeWord('d', 'trashed', { deletedAt: TRASHED_AT }),
      )
      const words = await getWordsForExport()
      expect(words.map((w) => w.word)).toEqual(['active', 'archived'])
    })
  })

  describe('mergeWords', () => {
    it('adds new words and keeps existing ones', async () => {
      await store(makeWord('a', 'apple'))
      await expect(mergeWords([makeWord('b', 'banana')])).resolves.toEqual({ added: 1, skipped: 0, duplicates: 0, hidden: 0 })
      const words = await getWords()
      expect(words.map((w) => w.word)).toEqual(['apple', 'banana'])
    })

    it('skips an id that already exists without overwriting it', async () => {
      await store(makeWord('a', 'apple'))
      await expect(mergeWords([makeWord('a', 'changed')])).resolves.toEqual({ added: 0, skipped: 1, duplicates: 0, hidden: 0 })
      expect((await getWord('a'))?.word).toBe('apple')
    })

    it('also skips an id that is in the trash', async () => {
      await store(makeWord('a', 'apple'), makeWord('d', 'trashed', { deletedAt: TRASHED_AT }))
      await expect(mergeWords([makeWord('d', 'back')])).resolves.toEqual({ added: 0, skipped: 1, duplicates: 0, hidden: 0 })
    })

    it('counts a repeated id in the file once', async () => {
      await store(makeWord('a', 'apple'))
      const result = await mergeWords([makeWord('b', 'one'), makeWord('b', 'two')])
      expect(result).toEqual({ added: 1, skipped: 0, duplicates: 1, hidden: 0 })
    })

    it('treats ids that differ only in case as the same word', async () => {
      await store(makeWord('abcdef01-0000-4000-8000-000000000001', 'apple'))
      const result = await mergeWords([makeWord('ABCDEF01-0000-4000-8000-000000000001', 'again')])
      expect(result).toEqual({ added: 0, skipped: 1, duplicates: 0, hidden: 0 })
    })

    it('counts added words the list will not show', async () => {
      await store(makeWord('a', 'apple'))
      const result = await mergeWords([
        makeWord('b', 'banana'),
        makeWord('r', 'archived', { archivedAt: TRASHED_AT }),
        makeWord('d', 'trashed', { deletedAt: TRASHED_AT }),
      ])
      expect(result).toEqual({ added: 3, skipped: 0, duplicates: 0, hidden: 2 })
    })

    it('does not add the samples when importing into a fresh store', async () => {
      await mergeWords([makeWord('a', 'apple')])
      await expect(getWords()).resolves.toHaveLength(1)
    })
  })

  describe('replaceWords', () => {
    it('removes active and archived words', async () => {
      await store(makeWord('a', 'apple'), makeWord('r', 'archived', { archivedAt: TRASHED_AT }))
      await replaceWords([makeWord('b', 'banana')])
      await expect(getWordsForExport()).resolves.toEqual([makeWord('b', 'banana')])
      await expect(getWord('r')).resolves.toBeNull()
    })

    it('keeps trashed words', async () => {
      await store(makeWord('d', 'trashed', { deletedAt: TRASHED_AT }))
      await replaceWords([makeWord('b', 'banana')])
      expect((await getWord('d'))?.word).toBe('trashed')
    })

    it('drops a trashed word whose id is in the file', async () => {
      await store(makeWord('d', 'trashed', { deletedAt: TRASHED_AT }))
      await replaceWords([makeWord('d', 'restored')])
      const word = await getWord('d')
      expect(word?.word).toBe('restored')
      expect(word?.deletedAt).toBeUndefined()
    })

    it('reports the number of words stored, counting a repeated id once', async () => {
      const result = await replaceWords([
        makeWord('b', 'one'),
        makeWord('b', 'two'),
        makeWord('r', 'archived', { archivedAt: TRASHED_AT }),
      ])
      expect(result).toEqual({ stored: 2, hidden: 1 })
      expect((await getWord('b'))?.word).toBe('two')
    })

    it('drops a trashed word whose id differs only in case', async () => {
      await store(makeWord('abcdef01-0000-4000-8000-000000000001', 'trashed', { deletedAt: TRASHED_AT }))
      await replaceWords([makeWord('ABCDEF01-0000-4000-8000-000000000001', 'restored')])
      await expect(getWord('abcdef01-0000-4000-8000-000000000001')).resolves.toBeNull()
    })

    it('does not bring the samples back after replacing', async () => {
      await getWords()
      await replaceWords([makeWord('b', 'banana')])
      await expect(getWords()).resolves.toEqual([makeWord('b', 'banana')])
    })

    it('removes records written by the PoC screen', async () => {
      const poc = { id: 'purge-test-1', word: 'poc', meaning: 'x', status: 'deleted', deleted_at: TRASHED_AT }
      await store(poc as unknown as Word)
      await replaceWords([makeWord('b', 'banana')])
      const db = await openDB()
      const left = await new Promise((resolve) => {
        const req = db.transaction('words').objectStore('words').get('purge-test-1')
        req.onsuccess = () => resolve(req.result)
      })
      db.close()
      expect(left).toBeUndefined()
    })

    it('changes nothing when the write fails', async () => {
      await store(makeWord('a', 'apple'))
      const bad = { ...makeWord('b', 'banana'), id: undefined } as unknown as Word
      await expect(replaceWords([makeWord('c', 'cherry'), bad])).rejects.toBeDefined()
      const words = await getWords()
      expect(words.map((w) => w.word)).toEqual(['apple'])
    })
  })

  describe('export and re-import', () => {
    const ids = (words: Word[]) => words.map((w) => w.id.toUpperCase()).sort()

    beforeEach(async () => {
      await store(
        makeWord('abcdef01-0000-4000-8000-000000000001', 'lowercase id', { sentences: [] }),
        makeWord('ABCDEF02-0000-4000-8000-000000000002', 'archived', { archivedAt: TRASHED_AT, sentences: [] }),
        makeWord('ABCDEF03-0000-4000-8000-000000000003', 'trashed', { deletedAt: TRASHED_AT, sentences: [] }),
      )
    })

    it('adds nothing when merging an export back in', async () => {
      const exported = parseWordFile(serializeWords(await getWordsForExport()))
      await expect(mergeWords(exported)).resolves.toMatchObject({ added: 0, skipped: 2 })
      expect(ids(await getWordsForExport())).toEqual(ids(exported))
    })

    it('keeps the same words when replacing with an export', async () => {
      const before = await getWordsForExport()
      const exported = parseWordFile(serializeWords(before))
      await expect(replaceWords(exported)).resolves.toEqual({ stored: 2, hidden: 1 })
      expect(ids(await getWordsForExport())).toEqual(ids(before))
      expect((await getWord('ABCDEF03-0000-4000-8000-000000000003'))?.word).toBe('trashed')
    })

    it('exports nothing from a store with only the trash and PoC records', async () => {
      const db = await openDB()
      const tx = db.transaction('words', 'readwrite')
      tx.objectStore('words').clear()
      tx.objectStore('words').put(makeWord('ABCDEF03-0000-4000-8000-000000000003', 'trashed', { deletedAt: TRASHED_AT }))
      tx.objectStore('words').put({ id: 'purge-test-1', word: 'poc', meaning: 'x' })
      await new Promise((resolve) => { tx.oncomplete = resolve })
      db.close()
      await expect(getWordsForExport()).resolves.toEqual([])
    })
  })

  it('stores sample ids that the iOS app can decode as UUIDs', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const ids = SAMPLE_WORDS.flatMap((w) => [w.id, ...w.sentences.map((s) => s.id)])
    expect(ids.every((id) => uuid.test(id))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
