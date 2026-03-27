import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import PronunciationPage from '@/pages/PronunciationPage'
import { SAMPLE_WORDS } from '@/data/sampleWords'
import * as AudioService from '@/services/AudioService'

const { mockPlayTTS } = vi.hoisted(() => ({ mockPlayTTS: vi.fn() }))
vi.mock('@/services/AudioService', () => ({
  playTTS: mockPlayTTS,
  stopTTS: vi.fn(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const word = SAMPLE_WORDS[0]
const sentence = word.sentences[0]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/words/${word.id}/pronunciation/${sentence.id}`]}>
      <Routes>
        <Route path="/words/:id/pronunciation/:sentenceId" element={<PronunciationPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PronunciationPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    vi.mocked(AudioService.stopTTS).mockClear()
    mockPlayTTS.mockReset().mockResolvedValue('webspeech')
  })

  it('renders the sentence text', () => {
    renderPage()
    expect(screen.getByText(sentence.english)).toBeInTheDocument()
    expect(screen.getByText(sentence.japanese)).toBeInTheDocument()
  })

  it('renders word context', () => {
    renderPage()
    expect(screen.getByText(word.word)).toBeInTheDocument()
  })

  it('calls stopTTS on unmount', () => {
    const { unmount } = renderPage()
    unmount()
    expect(AudioService.stopTTS).toHaveBeenCalled()
  })

  it('both TTS buttons are disabled while one is playing', async () => {
    // playTTS never resolves so the playing state persists
    mockPlayTTS.mockReturnValue(new Promise(() => {}))
    renderPage()

    const enButton = screen.getByRole('button', { name: '英語を聞く' })
    const jaButton = screen.getByRole('button', { name: '日本語を聞く' })

    await userEvent.click(enButton)

    expect(enButton).toBeDisabled()
    expect(jaButton).toBeDisabled()
  })

  it('TTS buttons are enabled before playback starts', () => {
    renderPage()
    expect(screen.getByRole('button', { name: '英語を聞く' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: '日本語を聞く' })).not.toBeDisabled()
  })

  it('back button navigates to sentence list', async () => {
    renderPage()
    await userEvent.click(screen.getByText('例文一覧'))
    expect(mockNavigate).toHaveBeenCalledWith(`/words/${word.id}/sentences`)
  })
})
