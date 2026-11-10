import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import AddPage from '@/pages/AddPage'
import { archiveForTest } from './helpers/archive'
import { getWords } from '@/services/WordRepository'

const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const type = (label: string, text: string) => userEvent.type(screen.getByLabelText(label), text)
const save = () => userEvent.click(screen.getByRole('button', { name: '保存' }))

describe('AddPage', () => {
  beforeEach(async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    mockNavigate.mockClear()
    await getWords() // seed the samples, as a first visit to the list would
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('saves a word and returns to the list', async () => {
    render(<MemoryRouter><AddPage /></MemoryRouter>)
    await type('英単語', 'apple')
    await type('意味', 'りんご')
    await type('発音記号', 'ˈæp.əl')
    await save()
    await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }))
    const saved = (await getWords()).find((w) => w.word === 'apple')
    expect(saved).toMatchObject({ meaning: 'りんご', phonetic: 'ˈæp.əl', sentences: [] })
  })

  it('saves the sentences that were filled in', async () => {
    render(<MemoryRouter><AddPage /></MemoryRouter>)
    await type('英単語', 'apple')
    await type('意味', 'りんご')
    await userEvent.click(screen.getByRole('button', { name: '例文を追加' }))
    await type('例文1の英文', 'I ate an apple.')
    await type('例文1の和訳', 'りんごを食べた。')
    await type('例文1のカテゴリ', '食べ物')
    await userEvent.click(screen.getByRole('button', { name: '例文を追加' }))
    await save()
    await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }))
    const saved = (await getWords()).find((w) => w.word === 'apple')
    expect(saved?.sentences).toEqual([
      expect.objectContaining({ english: 'I ate an apple.', japanese: 'りんごを食べた。', category: '食べ物' }),
    ])
  })

  it('removes a sentence row', async () => {
    render(<MemoryRouter><AddPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: '例文を追加' }))
    await userEvent.click(screen.getByRole('button', { name: '例文1を削除' }))
    expect(screen.queryByLabelText('例文1の英文')).not.toBeInTheDocument()
  })

  it('shows what is missing and saves nothing', async () => {
    render(<MemoryRouter><AddPage /></MemoryRouter>)
    const before = (await getWords()).length
    await save()
    expect(await screen.findByText('英単語を入力してください')).toBeInTheDocument()
    expect(screen.getByText('意味を入力してください')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(await getWords()).toHaveLength(before)
  })

  it('clears each message as the field is filled in', async () => {
    render(<MemoryRouter><AddPage /></MemoryRouter>)
    await save()
    await screen.findByText('英単語を入力してください')
    await type('英単語', 'apple')
    expect(screen.queryByText('英単語を入力してください')).not.toBeInTheDocument()
    expect(screen.getByText('意味を入力してください')).toBeInTheDocument()
  })

  it('warns about a word already in the list but still saves it', async () => {
    render(<MemoryRouter><AddPage /></MemoryRouter>)
    await type('英単語', 'Rarity')
    expect(await screen.findByText('「Rarity」は登録済みです')).toBeInTheDocument()
    await type('意味', '二つ目')
    await save()
    await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }))
    expect((await getWords()).filter((w) => w.word.toLowerCase() === 'rarity')).toHaveLength(2)
  })

  it('warns about a word that is archived', async () => {
    await archiveForTest('rarity')
    render(<MemoryRouter><AddPage /></MemoryRouter>)
    await type('英単語', 'rarity')
    expect(await screen.findByText('「rarity」は登録済みです')).toBeInTheDocument()
  })

  it('keeps typed text with its row when an earlier row is removed', async () => {
    render(<MemoryRouter><AddPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: '例文を追加' }))
    await userEvent.click(screen.getByRole('button', { name: '例文を追加' }))
    await type('例文1の英文', 'first')
    await type('例文2の英文', 'second')
    const secondInput = screen.getByLabelText('例文2の英文')
    await userEvent.click(screen.getByRole('button', { name: '例文1を削除' }))
    expect(screen.getByLabelText('例文1の英文')).toBe(secondInput)
    expect(secondInput).toHaveValue('second')
  })

  it('reports a save failure and keeps the input', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<MemoryRouter><AddPage /></MemoryRouter>)
    await type('英単語', 'apple')
    await type('意味', 'りんご')
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked') } })
    await save()
    expect(await screen.findByText('保存に失敗しました')).toBeInTheDocument()
    expect(screen.getByLabelText('英単語')).toHaveValue('apple')
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('goes back on cancel', async () => {
    render(<MemoryRouter><AddPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })
})
