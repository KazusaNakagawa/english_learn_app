import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import EditPage from '@/pages/EditPage'
import { SAMPLE_WORDS } from '@/data/sampleWords'
import { getWord, getWords } from '@/services/WordRepository'

const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const [word, other] = SAMPLE_WORDS

async function renderPage(id = word.id) {
  render(
    <MemoryRouter initialEntries={[`/words/${id}/edit`]}>
      <Routes>
        <Route path="/words/:id/edit" element={<EditPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const field = (label: string) => screen.getByLabelText(label)
const save = () => userEvent.click(screen.getByRole('button', { name: '保存' }))

describe('EditPage', () => {
  beforeEach(async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    mockNavigate.mockClear()
    await getWords() // seed the samples
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens with the stored word and its sentences filled in', async () => {
    await renderPage()
    expect(await screen.findByDisplayValue(word.word)).toBe(field('英単語'))
    expect(field('意味')).toHaveValue(word.meaning)
    expect(field('例文1の英文')).toHaveValue(word.sentences[0].english)
    expect(screen.getByRole('heading', { name: '単語を編集' })).toBeInTheDocument()
  })

  it('saves the changes and goes back', async () => {
    await renderPage()
    await screen.findByDisplayValue(word.word)
    await userEvent.clear(field('意味'))
    await userEvent.type(field('意味'), '修正した意味')
    await userEvent.clear(field('例文1の和訳'))
    await userEvent.type(field('例文1の和訳'), '修正した和訳')
    await save()
    await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(-1))
    const saved = await getWord(word.id)
    expect(saved?.meaning).toBe('修正した意味')
    expect(saved?.sentences[0]).toMatchObject({ id: word.sentences[0].id, japanese: '修正した和訳' })
    expect(saved?.sentences).toHaveLength(word.sentences.length)
  })

  it('does not warn about the word it is editing', async () => {
    await renderPage()
    await screen.findByDisplayValue(word.word)
    await userEvent.type(field('意味'), '!')
    expect(screen.queryByText(/は登録済みです/)).not.toBeInTheDocument()
  })

  it('warns when renamed to another listed word', async () => {
    await renderPage()
    await screen.findByDisplayValue(word.word)
    await userEvent.clear(field('英単語'))
    await userEvent.type(field('英単語'), other.word)
    expect(await screen.findByText(`「${other.word}」は登録済みです`)).toBeInTheDocument()
  })

  it('validates like the add page and saves nothing', async () => {
    await renderPage()
    await screen.findByDisplayValue(word.word)
    await userEvent.clear(field('意味'))
    await save()
    expect(await screen.findByText('意味を入力してください')).toBeInTheDocument()
    expect((await getWord(word.id))?.meaning).toBe(word.meaning)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('says when the word does not exist', async () => {
    await renderPage('missing')
    expect(await screen.findByText('単語が見つかりません')).toBeInTheDocument()
  })

  it('goes back on cancel without saving', async () => {
    await renderPage()
    await screen.findByDisplayValue(word.word)
    await userEvent.type(field('意味'), '変更')
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
    expect((await getWord(word.id))?.meaning).toBe(word.meaning)
  })
})
