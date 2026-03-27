import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SentenceListPage from '@/pages/SentenceListPage'
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

const word = SAMPLE_WORDS[0]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/words/${word.id}/sentences`]}>
      <Routes>
        <Route path="/words/:id/sentences" element={<SentenceListPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SentenceListPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    vi.mocked(AudioService.stopTTS).mockClear()
    vi.mocked(AudioService.playTTS).mockClear()
  })

  it('renders the word heading', () => {
    renderPage()
    expect(screen.getByText(word.word)).toBeInTheDocument()
  })

  it('renders all sentences', () => {
    renderPage()
    for (const sentence of word.sentences) {
      expect(screen.getByText(sentence.english)).toBeInTheDocument()
    }
  })

  it('sentence row click navigates to PronunciationPage', async () => {
    renderPage()
    const firstSentence = word.sentences[0]
    // Row aria-label ends with "— 発音練習へ"
    const row = screen.getByRole('button', {
      name: `${firstSentence.english} — 発音練習へ`,
    })
    await userEvent.click(row)
    expect(mockNavigate).toHaveBeenCalledWith(
      `/words/${word.id}/pronunciation/${firstSentence.id}`,
    )
  })

  it('play button click does NOT navigate to PronunciationPage', async () => {
    renderPage()
    const firstSentence = word.sentences[0]
    // Play button aria-label is 「...」を再生
    const playButton = screen.getByLabelText(`「${firstSentence.english}」を再生`)
    await userEvent.click(playButton)
    expect(mockNavigate).not.toHaveBeenCalledWith(
      expect.stringContaining('/pronunciation/'),
    )
  })

  it('play button has accessible aria-label', () => {
    renderPage()
    const firstSentence = word.sentences[0]
    expect(
      screen.getByLabelText(`「${firstSentence.english}」を再生`),
    ).toBeInTheDocument()
  })

  it('calls stopTTS on unmount', () => {
    const { unmount } = renderPage()
    unmount()
    expect(AudioService.stopTTS).toHaveBeenCalled()
  })

  it('back button navigates to word list', async () => {
    renderPage()
    await userEvent.click(screen.getByText('単語一覧'))
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })
})
