import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SettingsPage from '@/pages/SettingsPage'
import * as AudioService from '@/services/AudioService'

vi.mock('@/services/AudioService', () => ({
  playTTS: vi.fn().mockResolvedValue('webspeech'),
  stopTTS: vi.fn(),
}))

vi.mock('@/services/AudioCacheService', () => ({
  getCacheUsage: vi.fn().mockResolvedValue(0),
  clearCache: vi.fn().mockResolvedValue(undefined),
}))

async function renderPage() {
  const view = render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  await act(async () => {}) // let the cache usage request settle
  return view
}

describe('SettingsPage', () => {
  describe('stopping audio when leaving the page', () => {
    beforeEach(() => {
      vi.mocked(AudioService.stopTTS).mockClear()
      vi.mocked(AudioService.playTTS).mockClear()
    })

    it('calls stopTTS on unmount with nothing playing', async () => {
      const { unmount } = await renderPage()
      expect(AudioService.stopTTS).not.toHaveBeenCalled()
      unmount()
      expect(AudioService.stopTTS).toHaveBeenCalledOnce()
    })

    it('does not stop a sample while the page stays mounted', async () => {
      vi.mocked(AudioService.playTTS).mockImplementationOnce(() => new Promise(() => {}))
      await renderPage()
      await userEvent.click(screen.getByText('英語サンプルを再生'))
      expect(AudioService.playTTS).toHaveBeenCalledOnce()
      expect(AudioService.stopTTS).not.toHaveBeenCalled()
    })

    it('stops a sample that is still pending when the page unmounts', async () => {
      vi.mocked(AudioService.playTTS).mockImplementationOnce(() => new Promise(() => {}))
      const { unmount } = await renderPage()
      await userEvent.click(screen.getByText('日本語サンプルを再生'))
      unmount()
      expect(AudioService.stopTTS).toHaveBeenCalledOnce()
    })
  })
})
