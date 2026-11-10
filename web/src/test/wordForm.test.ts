import { describe, it, expect, vi, afterEach } from 'vitest'
import { emptySentenceRow, validateWordForm, type WordForm } from '@/lib/wordForm'
import { newId } from '@/lib/id'

const form = (extra: Partial<WordForm> = {}): WordForm => ({
  word: 'apple',
  meaning: 'りんご',
  phonetic: '',
  sentences: [],
  ...extra,
})

describe('validateWordForm', () => {
  it('accepts a word and meaning, trimming every field', () => {
    const result = validateWordForm(form({
      word: '  apple ',
      meaning: ' りんご ',
      phonetic: ' ˈæp.əl ',
      sentences: [{ english: ' I ate an apple. ', japanese: ' りんごを食べた。 ', category: ' 食べ物 ' }],
    }))
    expect(result.errors).toEqual([])
    expect(result.input).toEqual({
      word: 'apple',
      meaning: 'りんご',
      phonetic: 'ˈæp.əl',
      sentences: [{ english: 'I ate an apple.', japanese: 'りんごを食べた。', category: '食べ物' }],
    })
  })

  it.each([
    ['an empty word', { word: '' }, '英単語を入力してください'],
    ['a word of spaces', { word: '   ' }, '英単語を入力してください'],
    ['an empty meaning', { meaning: '' }, '意味を入力してください'],
  ])('rejects %s', (_, extra, message) => {
    const result = validateWordForm(form(extra))
    expect(result.errors).toContain(message)
    expect(result.input).toBeNull()
  })

  it('ignores a sentence row left completely empty', () => {
    const result = validateWordForm(form({ sentences: [emptySentenceRow(), { english: ' ', japanese: '', category: 'x' }] }))
    expect(result.errors).toEqual([])
    expect(result.input?.sentences).toEqual([])
  })

  it('names the row that has only one of English and Japanese', () => {
    const sentences = [
      { english: 'Fine.', japanese: '大丈夫。', category: '' },
      { english: 'Missing translation.', japanese: '', category: '' },
    ]
    expect(validateWordForm(form({ sentences })).errors).toEqual(['例文2: 英文と和訳の両方を入力してください'])
  })

  it('reports every problem at once', () => {
    const result = validateWordForm(form({ word: '', meaning: '', sentences: [{ english: '', japanese: 'だけ', category: '' }] }))
    expect(result.errors).toHaveLength(3)
  })
})

describe('newId', () => {
  const UUID_V4 = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('makes an uppercase UUID v4, the spelling iOS writes', () => {
    expect(newId()).toMatch(UUID_V4)
  })

  it('works without crypto.randomUUID, which non-secure origins lack', () => {
    const original = crypto.randomUUID
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      const ids = new Set(Array.from({ length: 50 }, newId))
      expect([...ids].every((id) => UUID_V4.test(id))).toBe(true)
      expect(ids.size).toBe(50)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true })
    }
  })
})
