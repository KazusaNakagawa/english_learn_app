import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SAMPLE_WORDS } from '@/data/sampleWords'
import { openDB } from '@/services/db'
import { getWord, getWords, getWordsForExport, mergeWords, replaceWords } from '@/services/WordRepository'
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
      await expect(mergeWords([makeWord('b', 'banana')])).resolves.toEqual({ added: 1, skipped: 0 })
      const words = await getWords()
      expect(words.map((w) => w.word)).toEqual(['apple', 'banana'])
    })

    it('skips an id that already exists without overwriting it', async () => {
      await store(makeWord('a', 'apple'))
      await expect(mergeWords([makeWord('a', 'changed')])).resolves.toEqual({ added: 0, skipped: 1 })
      expect((await getWord('a'))?.word).toBe('apple')
    })

    it('also skips an id that is in the trash', async () => {
      await store(makeWord('a', 'apple'), makeWord('d', 'trashed', { deletedAt: TRASHED_AT }))
      await expect(mergeWords([makeWord('d', 'back')])).resolves.toEqual({ added: 0, skipped: 1 })
    })

    it('counts a repeated id in the file once', async () => {
      await store(makeWord('a', 'apple'))
      const result = await mergeWords([makeWord('b', 'one'), makeWord('b', 'two')])
      expect(result).toEqual({ added: 1, skipped: 1 })
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

    it('changes nothing when the write fails', async () => {
      await store(makeWord('a', 'apple'))
      const bad = { ...makeWord('b', 'banana'), id: undefined } as unknown as Word
      await expect(replaceWords([makeWord('c', 'cherry'), bad])).rejects.toBeDefined()
      const words = await getWords()
      expect(words.map((w) => w.word)).toEqual(['apple'])
    })
  })

  it('stores sample ids that the iOS app can decode as UUIDs', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const ids = SAMPLE_WORDS.flatMap((w) => [w.id, ...w.sentences.map((s) => s.id)])
    expect(ids.every((id) => uuid.test(id))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
