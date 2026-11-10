import { describe, it, expect } from 'vitest'
import { exportFileName, parseWordFile, serializeWords, WordFileError } from '@/services/WordTransfer'
import type { Word } from '@/types/word'

const ID = '10000001-0001-0001-0001-000000000001'
const SENTENCE_ID = '10000001-0001-0001-0001-000000000101'

const fileWord = (extra: Record<string, unknown> = {}) => ({
  id: ID,
  word: 'important',
  meaning: '重要な',
  phonetic: 'ɪmˈpɔːr.tənt',
  sentences: [{ id: SENTENCE_ID, english: 'It is important.', japanese: '重要だ。', category: '一般' }],
  ...extra,
})
const parse = (...words: unknown[]) => parseWordFile(JSON.stringify({ words }))

describe('parseWordFile', () => {
  describe('valid files', () => {
    it('reads the minimal shape the iOS bundle uses', () => {
      expect(parse(fileWord())).toEqual([{ ...fileWord(), isFavorite: false }])
    })

    it('converts Swift reference-date seconds to ISO strings', () => {
      const [word] = parse(fileWord({ createdAt: 0, archivedAt: 784111777.5 }))
      expect(word.createdAt).toBe('2001-01-01T00:00:00.000Z')
      expect(word.archivedAt).toBe('2025-11-06T08:49:37.500Z')
    })

    it('treats a null date as absent', () => {
      expect(parse(fileWord({ deletedAt: null }))[0].deletedAt).toBeUndefined()
    })

    it('reads isFavorite and defaults anything else to false, as iOS does', () => {
      expect(parse(fileWord({ isFavorite: true }))[0].isFavorite).toBe(true)
      expect(parse(fileWord({ isFavorite: 'yes' }))[0].isFavorite).toBe(false)
    })

    it('uppercases ids so iOS and Web spellings compare equal', () => {
      const [word] = parse(fileWord({ id: 'abcdef01-0001-0001-0001-000000000001' }))
      expect(word.id).toBe('ABCDEF01-0001-0001-0001-000000000001')
    })

    it('accepts a word with no sentences and ignores unknown keys', () => {
      const [word] = parse(fileWord({ sentences: [], extra: 1 }))
      expect(word.sentences).toEqual([])
      expect(word).not.toHaveProperty('extra')
    })

    it('tolerates a byte order mark', () => {
      expect(parseWordFile(`\uFEFF${JSON.stringify({ words: [fileWord()] })}`)).toHaveLength(1)
    })
  })

  describe('invalid files', () => {
    it.each([
      ['text that is not JSON', 'not json', 'JSON'],
      ['a top-level array', '[]', 'words'],
      ['a missing words key', '{}', 'words'],
      ['an empty word list', '{"words":[]}', '単語がありません'],
    ])('rejects %s', (_, text, message) => {
      expect(() => parseWordFile(text)).toThrow(WordFileError)
      expect(() => parseWordFile(text)).toThrow(message)
    })

    it('names the position and field of a missing required value', () => {
      expect(() => parse(fileWord(), fileWord({ meaning: undefined }))).toThrow('2番目の単語: meaning')
    })

    it('rejects a word id that is not a UUID', () => {
      expect(() => parse(fileWord({ id: '1' }))).toThrow('1番目の単語: id')
    })

    it('rejects a sentence with a missing field', () => {
      const sentences = [{ id: SENTENCE_ID, english: 'x', japanese: 'y' }]
      expect(() => parse(fileWord({ sentences }))).toThrow('1番目の単語の1番目の例文: category')
    })

    it('rejects sentences that are not a list', () => {
      expect(() => parse(fileWord({ sentences: 'x' }))).toThrow('sentences')
    })

    it.each([['a string', '2025-01-01'], ['an out-of-range number', 1e20]])('rejects a date that is %s', (_, value) => {
      expect(() => parse(fileWord({ createdAt: value }))).toThrow('createdAt')
    })
  })
})

describe('serializeWords', () => {
  const word: Word = {
    ...fileWord(),
    createdAt: '2025-11-06T08:49:37.500Z',
    deletedAt: undefined,
    isFavorite: true,
  }

  it('writes the iOS shape, with dates as reference-date seconds', () => {
    expect(JSON.parse(serializeWords([word]))).toEqual({
      words: [{ ...fileWord(), createdAt: 784111777.5, isFavorite: true }],
    })
  })

  it('writes isFavorite as false when it was never set', () => {
    const plain = { ...word, isFavorite: undefined }
    expect(JSON.parse(serializeWords([plain])).words[0].isFavorite).toBe(false)
  })

  it('survives a round trip', () => {
    expect(parseWordFile(serializeWords([word]))).toEqual([word])
  })
})

describe('exportFileName', () => {
  it('matches the iOS name, in whole seconds', () => {
    expect(exportFileName(1_700_000_000_999)).toBe('words_export_1700000000.json')
  })
})
