import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import AddPage from '@/pages/AddPage'
import { archiveForTest } from './helpers/archive'
import { getWords } from '@/services/WordRepository'
import { saveSettings } from '@/services/SettingsService'

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

  describe('generating sentences with OpenAI', () => {
    const generated = {
      meaning: 'りんご',
      phonetic: '/ˈæp.əl/',
      sentences: [
        { english: 'I ate an apple.', japanese: 'りんごを食べた。', category: '日常会話' },
        { english: 'Apples are red.', japanese: 'りんごは赤い。', category: '学習・教育' },
      ],
    }
    const completion = () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(generated) } }] }),
    })
    const generate = () => userEvent.click(screen.getByRole('button', { name: 'AIで例文を生成' }))

    beforeEach(() => {
      sessionStorage.clear()
      saveSettings({ openAIKey: 'sk-test' })
    })

    it('fills empty fields and adds the sentences as editable rows', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => completion()))
      render(<MemoryRouter><AddPage /></MemoryRouter>)
      await type('英単語', 'apple')
      await generate()
      expect(await screen.findByDisplayValue('I ate an apple.')).toBe(screen.getByLabelText('例文1の英文'))
      expect(screen.getByLabelText('例文2の和訳')).toHaveValue('りんごは赤い。')
      expect(screen.getByLabelText('意味')).toHaveValue('りんご')
      expect(screen.getByLabelText('発音記号')).toHaveValue('ˈæp.əl')
    })

    it('keeps a meaning and filled rows the user already typed, replacing only empty rows', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => completion()))
      render(<MemoryRouter><AddPage /></MemoryRouter>)
      await type('英単語', 'apple')
      await type('意味', '自分の訳')
      await userEvent.click(screen.getByRole('button', { name: '例文を追加' }))
      await type('例文1の英文', 'Mine.')
      await type('例文1の和訳', '自分の。')
      await userEvent.click(screen.getByRole('button', { name: '例文を追加' }))
      await generate()
      await screen.findByDisplayValue('I ate an apple.')
      expect(screen.getByLabelText('意味')).toHaveValue('自分の訳')
      expect(screen.getByLabelText('例文1の英文')).toHaveValue('Mine.')
      expect(screen.getByLabelText('例文2の英文')).toHaveValue('I ate an apple.')
      expect(screen.queryByLabelText('例文4の英文')).not.toBeInTheDocument()
    })

    const held = () => {
      let release: (value: unknown) => void = () => {}
      const promise = new Promise((resolve) => { release = resolve })
      return { promise, release }
    }
    const completionWith = (english: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ ...generated, sentences: [{ english, japanese: '訳', category: '' }] }) } }] }),
    })

    it('locks the word fields, the rows, and saving while generating', async () => {
      const pending = held()
      vi.stubGlobal('fetch', vi.fn(() => pending.promise))
      render(<MemoryRouter><AddPage /></MemoryRouter>)
      await type('英単語', 'apple')
      await userEvent.click(screen.getByRole('button', { name: '例文を追加' }))
      await generate()
      expect(screen.getByLabelText('英単語')).toBeDisabled()
      expect(screen.getByLabelText('意味')).toBeDisabled()
      expect(screen.getByLabelText('例文1の英文')).toBeDisabled()
      expect(screen.getByRole('button', { name: '例文を追加' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '生成を中止' })).toBeEnabled()
      pending.release(completion())
      await screen.findByDisplayValue('I ate an apple.')
      expect(screen.getByLabelText('英単語')).toBeEnabled()
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
    })

    it('ignores a cancelled request that settles after a newer one started', async () => {
      const first = held()
      const fetchMock = vi.fn()
        .mockImplementationOnce(() => first.promise) // ignores the abort, like a slow network
        .mockImplementationOnce(async () => completionWith('From the second request.'))
      vi.stubGlobal('fetch', fetchMock)
      render(<MemoryRouter><AddPage /></MemoryRouter>)
      await type('英単語', 'apple')
      await generate()
      await userEvent.click(screen.getByRole('button', { name: '生成を中止' }))
      await generate()
      await screen.findByDisplayValue('From the second request.')
      first.release(completionWith('From the cancelled request.'))
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(screen.queryByDisplayValue('From the cancelled request.')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('例文2の英文')).not.toBeInTheDocument()
    })

    it('replaces untouched generated rows when generating again, keeping edited ones', async () => {
      const fetchMock = vi.fn()
        .mockImplementationOnce(async () => completion())
        .mockImplementationOnce(async () => completionWith('Second round.'))
      vi.stubGlobal('fetch', fetchMock)
      render(<MemoryRouter><AddPage /></MemoryRouter>)
      await type('英単語', 'apple')
      await generate()
      await screen.findByDisplayValue('I ate an apple.')
      await userEvent.type(screen.getByLabelText('例文2の和訳'), '（修正）')
      await generate()
      await screen.findByDisplayValue('Second round.')
      expect(screen.queryByDisplayValue('I ate an apple.')).not.toBeInTheDocument()
      expect(screen.getByLabelText('例文1の和訳')).toHaveValue('りんごは赤い。（修正）')
      expect(screen.getByLabelText('例文2の英文')).toHaveValue('Second round.')
      expect(screen.queryByLabelText('例文3の英文')).not.toBeInTheDocument()
    })

    it('needs a word first', async () => {
      render(<MemoryRouter><AddPage /></MemoryRouter>)
      expect(screen.getByRole('button', { name: 'AIで例文を生成' })).toBeDisabled()
    })

    it('points to the settings when there is no API key', async () => {
      sessionStorage.clear()
      render(<MemoryRouter><AddPage /></MemoryRouter>)
      await type('英単語', 'apple')
      expect(screen.getByRole('button', { name: 'AIで例文を生成' })).toBeDisabled()
      expect(screen.getByText('設定で OpenAI の API キーを入力すると、例文を自動で生成できます')).toBeInTheDocument()
    })

    it('can be cancelled while generating, leaving the form as it was', async () => {
      vi.stubGlobal('fetch', vi.fn((_: string, init: RequestInit) => new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })))
      render(<MemoryRouter><AddPage /></MemoryRouter>)
      await type('英単語', 'apple')
      await generate()
      expect(screen.getByText('生成中…')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '生成を中止' }))
      expect(await screen.findByRole('button', { name: 'AIで例文を生成' })).toBeEnabled()
      expect(screen.queryByText('生成中…')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('例文1の英文')).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('shows why generation failed, and a retry can succeed', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
        .mockResolvedValueOnce(completion())
      vi.stubGlobal('fetch', fetchMock)
      render(<MemoryRouter><AddPage /></MemoryRouter>)
      await type('英単語', 'apple')
      await generate()
      expect(await screen.findByText('APIキーが正しくありません')).toBeInTheDocument()
      await generate()
      expect(await screen.findByDisplayValue('I ate an apple.')).toBeInTheDocument()
      expect(screen.queryByText('APIキーが正しくありません')).not.toBeInTheDocument()
    })
  })
})
