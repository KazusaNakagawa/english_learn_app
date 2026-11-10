import { describe, it, expect } from 'vitest'
import { emptySentenceRow, validateWordForm, type WordForm } from '@/lib/wordForm'

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
      sentences: [{ key: 'k', english: ' I ate an apple. ', japanese: ' りんごを食べた。 ', category: ' 食べ物 ' }],
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

  it('ignores a sentence row left completely empty, spaces included', () => {
    const result = validateWordForm(form({ sentences: [emptySentenceRow(), { key: 'k', english: ' ', japanese: '', category: ' ' }] }))
    expect(result.errors).toEqual([])
    expect(result.input?.sentences).toEqual([])
  })

  it('does not drop a row that has only a category', () => {
    const result = validateWordForm(form({ sentences: [{ key: 'k', english: '', japanese: '', category: '食べ物' }] }))
    expect(result.errors).toEqual(['例文1: 英文と和訳の両方を入力してください'])
  })

  it('gives every new row its own key', () => {
    expect(emptySentenceRow().key).not.toBe(emptySentenceRow().key)
  })

  it('names the row that has only one of English and Japanese', () => {
    const sentences = [
      { key: 'a', english: 'Fine.', japanese: '大丈夫。', category: '' },
      { key: 'b', english: 'Missing translation.', japanese: '', category: '' },
    ]
    expect(validateWordForm(form({ sentences })).errors).toEqual(['例文2: 英文と和訳の両方を入力してください'])
  })

  it('reports every problem at once', () => {
    const result = validateWordForm(form({ word: '', meaning: '', sentences: [{ key: 'k', english: '', japanese: 'だけ', category: '' }] }))
    expect(result.errors).toHaveLength(3)
  })
})
