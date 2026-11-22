import { act, render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router'
import { afterEach, describe, it, expect, vi } from 'vitest'
import App from '@/App'
import { setZundamonSpeech } from '@/lib/zundamonSpeech'

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

  describe('zundamon avatar', () => {
    afterEach(() => {
      act(() => setZundamonSpeech(null))
      vi.unstubAllEnvs()
    })
    const renderApp = () => render(<HashRouter><App /></HashRouter>)

    it('is not shown unless VITE_ZUNDAMON_AVATAR is true', () => {
      vi.stubEnv('VITE_ZUNDAMON_AVATAR', '')
      renderApp()
      act(() => setZundamonSpeech({ audio: null, envelope: null }))
      expect(screen.queryByTestId('zundamon-avatar')).toBeNull()
    })

    it('is shown while zundamon speaks when VITE_ZUNDAMON_AVATAR is true', () => {
      vi.stubEnv('VITE_ZUNDAMON_AVATAR', 'true')
      renderApp()
      act(() => setZundamonSpeech({ audio: null, envelope: null }))
      expect(screen.getByTestId('zundamon-avatar')).toBeInTheDocument()
    })
  })
})
