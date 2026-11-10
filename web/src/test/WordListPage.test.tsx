import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import WordListPage from '@/pages/WordListPage'
import { SAMPLE_WORDS } from '@/data/sampleWords'
import * as AudioService from '@/services/AudioService'
import { getWords } from '@/services/WordRepository'

vi.mock('@/services/AudioService', () => ({
  playTTS: vi.fn().mockResolvedValue('webspeech'),
  stopTTS: vi.fn(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

async function renderPage() {
  const view = render(
    <MemoryRouter initialEntries={['/']}>
      <WordListPage />
    </MemoryRouter>,
  )
  await screen.findByText(SAMPLE_WORDS[0].word)
  return view
}

describe('WordListPage', () => {
  it('renders all sample words', async () => {
    await renderPage()
    for (const word of SAMPLE_WORDS) {
      expect(screen.getByText(word.word)).toBeInTheDocument()
    }
  })

  it('navigates to SentenceListPage on word card click', async () => {
    await renderPage()
    const firstWord = SAMPLE_WORDS[0]
    const card = screen.getByRole('button', { name: `${firstWord.word} — 例文一覧へ` })
    await userEvent.click(card)
    expect(mockNavigate).toHaveBeenCalledWith(`/words/${firstWord.id}/sentences`)
  })

  it('navigates on Enter key press', async () => {
    await renderPage()
    const firstWord = SAMPLE_WORDS[0]
    const card = screen.getByRole('button', { name: `${firstWord.word} — 例文一覧へ` })
    card.focus()
    await userEvent.keyboard('{Enter}')
    expect(mockNavigate).toHaveBeenCalledWith(`/words/${firstWord.id}/sentences`)
  })

  it('navigates on Space key press', async () => {
    await renderPage()
    const firstWord = SAMPLE_WORDS[0]
    const card = screen.getByRole('button', { name: `${firstWord.word} — 例文一覧へ` })
    card.focus()
    await userEvent.keyboard(' ')
    expect(mockNavigate).toHaveBeenCalledWith(`/words/${firstWord.id}/sentences`)
  })

  it('word card has tabIndex=0 for keyboard focus', async () => {
    await renderPage()
    const firstWord = SAMPLE_WORDS[0]
    const card = screen.getByRole('button', { name: `${firstWord.word} — 例文一覧へ` })
    expect(card).toHaveAttribute('tabindex', '0')
  })

  it('TTS button click does not navigate to sentence page', async () => {
    await renderPage()
    mockNavigate.mockClear()
    const ttsButtons = screen.getAllByTitle('英語を再生')
    await userEvent.click(ttsButtons[0])
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('/sentences'))
  })

  it('shows a message when the words cannot be loaded', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked') } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<MemoryRouter initialEntries={['/']}><WordListPage /></MemoryRouter>)
    expect(await screen.findByText('単語データを読み込めませんでした')).toBeInTheDocument()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('stopping audio when leaving the page', () => {
    beforeEach(() => {
      vi.mocked(AudioService.stopTTS).mockClear()
      // mockReset, not mockClear: it also drops an unconsumed mockImplementationOnce.
      vi.mocked(AudioService.playTTS).mockReset().mockResolvedValue('webspeech')
    })

    it('calls stopTTS on unmount with nothing playing', async () => {
      const { unmount } = await renderPage()
      expect(AudioService.stopTTS).not.toHaveBeenCalled()
      unmount()
      expect(AudioService.stopTTS).toHaveBeenCalledOnce()
    })

    it('does not stop a clip while the page stays mounted', async () => {
      vi.mocked(AudioService.playTTS).mockImplementationOnce(() => new Promise(() => {}))
      await renderPage()
      await userEvent.click(screen.getAllByTitle('英語を再生')[0])
      expect(AudioService.playTTS).toHaveBeenCalledOnce()
      expect(AudioService.stopTTS).not.toHaveBeenCalled()
    })

    it('stops a clip that is still pending when the page unmounts', async () => {
      vi.mocked(AudioService.playTTS).mockImplementationOnce(() => new Promise(() => {}))
      const { unmount } = await renderPage()
      await userEvent.click(screen.getAllByTitle('英語を再生')[0])
      expect(AudioService.playTTS).toHaveBeenCalledOnce()
      unmount()
      expect(AudioService.stopTTS).toHaveBeenCalledOnce()
    })
  })

  describe('moving a word to the trash', () => {
    const first = () => [...SAMPLE_WORDS].sort((a, b) => a.word.localeCompare(b.word))[0]

    beforeEach(() => {
      vi.stubGlobal('indexedDB', new IDBFactory())
    })

    afterEach(() => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    })

    it('removes the word from the list without opening it', async () => {
      await renderPage()
      const word = first()
      await userEvent.click(screen.getByLabelText(`「${word.word}」をゴミ箱へ移動`))
      expect(await screen.findByText(`「${word.word}」をゴミ箱に移動しました`)).toBeInTheDocument()
      expect(screen.queryByLabelText(`「${word.word}」をゴミ箱へ移動`)).not.toBeInTheDocument()
      expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('/sentences'))
      expect((await getWords()).map((w) => w.id)).not.toContain(word.id)
    })

    it('brings the word back with undo', async () => {
      await renderPage()
      const word = first()
      await userEvent.click(screen.getByLabelText(`「${word.word}」をゴミ箱へ移動`))
      await userEvent.click(await screen.findByRole('button', { name: '元に戻す' }))
      expect(await screen.findByLabelText(`「${word.word}」をゴミ箱へ移動`)).toBeInTheDocument()
      expect(screen.queryByText(`「${word.word}」をゴミ箱に移動しました`)).not.toBeInTheDocument()
      expect((await getWords()).map((w) => w.id)).toContain(word.id)
    })

    it('reports a failure and keeps the word', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await renderPage()
      const word = first()
      vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked') } })
      await userEvent.click(screen.getByLabelText(`「${word.word}」をゴミ箱へ移動`))
      expect(await screen.findByText('ゴミ箱に移動できませんでした')).toBeInTheDocument()
      expect(screen.getByLabelText(`「${word.word}」をゴミ箱へ移動`)).toBeInTheDocument()
    })
  })
})
