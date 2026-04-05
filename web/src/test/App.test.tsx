import { render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router'
import { describe, it, expect, vi } from 'vitest'
import App from '@/App'

vi.mock('@/services/AudioService', () => ({
  playTTS: vi.fn().mockResolvedValue('webspeech'),
  stopTTS: vi.fn(),
}))

describe('App', () => {
  it('renders the word list page heading', () => {
    render(
      <HashRouter>
        <App />
      </HashRouter>,
    )
    expect(screen.getByText('単語一覧')).toBeInTheDocument()
  })
})
