import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import WordListPage from '@/pages/WordListPage'
import { SAMPLE_WORDS } from '@/data/sampleWords'
import * as AudioService from '@/services/AudioService'
import { getArchivedWords, getWords } from '@/services/WordRepository'

vi.mock('@/services/AudioService', () => ({
  playTTS: vi.fn().mockResolvedValue('webspeech'),
  stopTTS: vi.fn(),
}))

// Short enough for waitFor, long enough to act on the notice before it goes.
vi.mock('@/lib/ui', () => ({ UNDO_TOAST_MS: 300 }))

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

    const card = (word: string) => screen.getByLabelText(`${word} — 例文一覧へ`)
    const swipe = (word: string, dx: number, dy = 0) => {
      const row = card(word).parentElement as HTMLElement
      fireEvent.pointerDown(row, { pointerId: 1, button: 0, clientX: 300, clientY: 100 })
      fireEvent.pointerMove(row, { pointerId: 1, clientX: 300 + dx / 2, clientY: 100 + dy / 2 })
      fireEvent.pointerMove(row, { pointerId: 1, clientX: 300 + dx, clientY: 100 + dy })
      fireEvent.pointerUp(row, { pointerId: 1, clientX: 300 + dx, clientY: 100 + dy })
      fireEvent.click(card(word))
    }
    const deleteButton = (word: string) => screen.getByRole('button', { name: `「${word}」をゴミ箱へ移動` })

    it('shows no trash button until the row is swiped', async () => {
      await renderPage()
      const word = first()
      expect(screen.queryByText('削除')).not.toBeInTheDocument()
      swipe(word.word, -100)
      expect(screen.getByText('削除')).toBeInTheDocument()
      expect(deleteButton(word.word)).toHaveAttribute('tabindex', '0')
      expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('/sentences'))
    })

    it('deletes from the revealed button', async () => {
      await renderPage()
      const word = first()
      swipe(word.word, -100)
      await userEvent.click(deleteButton(word.word))
      expect(await screen.findByText(`「${word.word}」をゴミ箱に移動しました`)).toBeInTheDocument()
      expect((await getWords()).map((w) => w.id)).not.toContain(word.id)
    })

    it('archives from the button beside delete, and undo brings the word back', async () => {
      await renderPage()
      const word = first()
      swipe(word.word, -100)
      const archive = screen.getByRole('button', { name: `「${word.word}」をアーカイブ` })
      expect(archive).toHaveAttribute('tabindex', '0')
      await userEvent.click(archive)
      expect(await screen.findByText(`「${word.word}」をアーカイブしました`)).toBeInTheDocument()
      expect((await getWords()).map((w) => w.id)).not.toContain(word.id)
      expect((await getArchivedWords()).map((w) => w.id)).toEqual([word.id])

      await userEvent.click(screen.getByRole('button', { name: '元に戻す' }))
      expect(await screen.findByLabelText(`${word.word} — 例文一覧へ`)).toBeInTheDocument()
      expect(await getArchivedWords()).toEqual([])
    })

    it('covers the row with archive while archiving, and a second tap does not trash it', async () => {
      await renderPage()
      const word = first()
      swipe(word.word, -100)
      fireEvent.click(screen.getByRole('button', { name: `「${word.word}」をアーカイブ` }))
      // Mid-animation: archive spans the row, delete is gone, and taps do nothing.
      expect(screen.queryByRole('button', { name: `「${word.word}」をゴミ箱へ移動` })).not.toBeInTheDocument()
      const archive = screen.getByRole('button', { name: `「${word.word}」をアーカイブ` })
      expect(archive).toBeDisabled()
      fireEvent.click(archive)
      expect(await screen.findByText(`「${word.word}」をアーカイブしました`)).toBeInTheDocument()
      expect((await getArchivedWords()).map((w) => w.id)).toEqual([word.id])
      expect((await getArchivedWords())[0].deletedAt).toBeUndefined()
    })

    it('hides the archive button during a full swipe, which trashes instead', async () => {
      await renderPage()
      const word = first()
      const row = card(word.word).parentElement as HTMLElement
      fireEvent.pointerDown(row, { pointerId: 1, button: 0, clientX: 300, clientY: 100 })
      fireEvent.pointerMove(row, { pointerId: 1, clientX: 175, clientY: 100 })
      fireEvent.pointerMove(row, { pointerId: 1, clientX: 50, clientY: 100 })
      expect(screen.queryByRole('button', { name: `「${word.word}」をアーカイブ` })).not.toBeInTheDocument()
      fireEvent.pointerUp(row, { pointerId: 1, clientX: 50, clientY: 100 })
      expect(await screen.findByText(`「${word.word}」をゴミ箱に移動しました`)).toBeInTheDocument()
      expect(await getArchivedWords()).toEqual([])
    })

    it('reports a failed archive and keeps the word', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await renderPage()
      const word = first()
      swipe(word.word, -100)
      vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked') } })
      await userEvent.click(screen.getByRole('button', { name: `「${word.word}」をアーカイブ` }))
      expect(await screen.findByText('アーカイブできませんでした')).toBeInTheDocument()
      expect(screen.getByLabelText(`${word.word} — 例文一覧へ`)).toBeInTheDocument()
    })

    it('deletes at once on a full swipe', async () => {
      await renderPage()
      const word = first()
      swipe(word.word, -250)
      expect(await screen.findByText(`「${word.word}」をゴミ箱に移動しました`)).toBeInTheDocument()
      expect((await getWords()).map((w) => w.id)).not.toContain(word.id)
    })

    it('springs back after a short swipe, so a tap still opens the word', async () => {
      await renderPage()
      const word = first()
      swipe(word.word, -20)
      expect(screen.queryByText('削除')).not.toBeInTheDocument()
      await userEvent.click(card(word.word))
      expect(mockNavigate).toHaveBeenCalledWith(`/words/${word.id}/sentences`)
    })

    it('leaves a vertical drag to scrolling', async () => {
      await renderPage()
      const word = first()
      swipe(word.word, -10, 60)
      expect(screen.queryByText('削除')).not.toBeInTheDocument()
    })

    it('closes an open row on tap instead of opening the word', async () => {
      await renderPage()
      const word = first()
      swipe(word.word, -100)
      mockNavigate.mockClear()
      await userEvent.click(card(word.word))
      expect(screen.queryByText('削除')).not.toBeInTheDocument()
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('keeps only one row open at a time', async () => {
      await renderPage()
      const [a, b] = [...SAMPLE_WORDS].sort((x, y) => x.word.localeCompare(y.word))
      swipe(a.word, -100)
      fireEvent.pointerDown(card(b.word), { pointerId: 2, button: 0, clientX: 10, clientY: 10 })
      fireEvent.pointerUp(card(b.word), { pointerId: 2, clientX: 10, clientY: 10 })
      expect(screen.queryByText('削除')).not.toBeInTheDocument()
    })

    it('hides the notice after a few seconds', async () => {
      await renderPage()
      const word = first()
      swipe(word.word, -250)
      const notice = await screen.findByText(`「${word.word}」をゴミ箱に移動しました`)
      await vi.waitFor(() => expect(notice).not.toBeInTheDocument())
    })

    it('stops the audio of a word that is being trashed', async () => {
      vi.mocked(AudioService.playTTS).mockImplementationOnce(() => new Promise(() => {}))
      await renderPage()
      const word = first()
      await userEvent.click(screen.getAllByTitle('英語を再生')[0])
      expect(screen.getAllByTitle('英語を再生')[1]).toBeDisabled()
      vi.mocked(AudioService.stopTTS).mockClear()
      card(word.word).focus()
      await userEvent.keyboard('{Delete}')
      await screen.findByText(`「${word.word}」をゴミ箱に移動しました`)
      expect(AudioService.stopTTS).toHaveBeenCalled()
      expect(screen.getAllByTitle('英語を再生')[0]).toBeEnabled()
    })

    it('keeps undo available when the undo itself fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await renderPage()
      swipe(first().word, -250)
      const undo = await screen.findByRole('button', { name: '元に戻す' })
      vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked') } })
      await userEvent.click(undo)
      expect(await screen.findByText('元に戻せませんでした')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '元に戻す' })).toBeInTheDocument()
    })

    it('keeps the earlier undo when trashing another word fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await renderPage()
      const [a, b] = [...SAMPLE_WORDS].sort((x, y) => x.word.localeCompare(y.word))
      swipe(a.word, -250)
      await screen.findByText(`「${a.word}」をゴミ箱に移動しました`)
      vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked') } })
      card(b.word).focus()
      await userEvent.keyboard('{Delete}')
      expect(await screen.findByText('ゴミ箱に移動できませんでした')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '元に戻す' })).toBeInTheDocument()
    })

    it('deletes the focused card with the Delete key', async () => {
      await renderPage()
      const word = first()
      card(word.word).focus()
      await userEvent.keyboard('{Delete}')
      expect(await screen.findByText(`「${word.word}」をゴミ箱に移動しました`)).toBeInTheDocument()
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
