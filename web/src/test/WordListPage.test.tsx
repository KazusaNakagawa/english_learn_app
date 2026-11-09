import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import WordListPage from '@/pages/WordListPage'
import { SAMPLE_WORDS } from '@/data/sampleWords'
import * as AudioService from '@/services/AudioService'

vi.mock('@/services/AudioService', () => ({
  playTTS: vi.fn().mockResolvedValue('webspeech'),
  stopTTS: vi.fn(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <WordListPage />
    </MemoryRouter>,
  )
}

describe('WordListPage', () => {
  it('renders all sample words', () => {
    renderPage()
    for (const word of SAMPLE_WORDS) {
      expect(screen.getByText(word.word)).toBeInTheDocument()
    }
  })

  it('navigates to SentenceListPage on word card click', async () => {
    renderPage()
    const firstWord = SAMPLE_WORDS[0]
    const card = screen.getByRole('button', { name: new RegExp(firstWord.word) })
    await userEvent.click(card)
    expect(mockNavigate).toHaveBeenCalledWith(`/words/${firstWord.id}/sentences`)
  })

  it('navigates on Enter key press', async () => {
    renderPage()
    const firstWord = SAMPLE_WORDS[0]
    const card = screen.getByRole('button', { name: new RegExp(firstWord.word) })
    card.focus()
    await userEvent.keyboard('{Enter}')
    expect(mockNavigate).toHaveBeenCalledWith(`/words/${firstWord.id}/sentences`)
  })

  it('navigates on Space key press', async () => {
    renderPage()
    const firstWord = SAMPLE_WORDS[0]
    const card = screen.getByRole('button', { name: new RegExp(firstWord.word) })
    card.focus()
    await userEvent.keyboard(' ')
    expect(mockNavigate).toHaveBeenCalledWith(`/words/${firstWord.id}/sentences`)
  })

  it('word card has tabIndex=0 for keyboard focus', () => {
    renderPage()
    const firstWord = SAMPLE_WORDS[0]
    const card = screen.getByRole('button', { name: new RegExp(firstWord.word) })
    expect(card).toHaveAttribute('tabindex', '0')
  })

  it('TTS button click does not navigate to sentence page', async () => {
    renderPage()
    mockNavigate.mockClear()
    const ttsButtons = screen.getAllByTitle('英語を再生')
    await userEvent.click(ttsButtons[0])
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('/sentences'))
  })

  describe('stopping audio when leaving the page', () => {
    beforeEach(() => {
      vi.mocked(AudioService.stopTTS).mockClear()
    })

    it('calls stopTTS on unmount with nothing playing', () => {
      const { unmount } = renderPage()
      expect(AudioService.stopTTS).not.toHaveBeenCalled()
      unmount()
      expect(AudioService.stopTTS).toHaveBeenCalledOnce()
    })

    it('does not stop a clip while the page stays mounted', async () => {
      vi.mocked(AudioService.playTTS).mockImplementationOnce(() => new Promise(() => {}))
      renderPage()
      await userEvent.click(screen.getAllByTitle('英語を再生')[0])
      expect(AudioService.playTTS).toHaveBeenCalled()
      expect(AudioService.stopTTS).not.toHaveBeenCalled()
    })

    it('stops a clip that is still pending when the page unmounts', async () => {
      vi.mocked(AudioService.playTTS).mockImplementationOnce(() => new Promise(() => {}))
      const { unmount } = renderPage()
      await userEvent.click(screen.getAllByTitle('英語を再生')[0])
      unmount()
      expect(AudioService.stopTTS).toHaveBeenCalledOnce()
    })
  })
})
