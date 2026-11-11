import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi } from 'vitest'
import App from '@/App'

vi.mock('@/services/AudioService', () => ({
  playTTS: vi.fn().mockResolvedValue('webspeech'),
  stopTTS: vi.fn(),
}))

vi.mock('@/services/AudioCacheService', () => ({
  getCacheUsage: vi.fn().mockResolvedValue(0),
  clearCache: vi.fn().mockResolvedValue(undefined),
}))

async function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
  await act(async () => {}) // let the settings page's cache usage request settle
}

describe('legal pages', () => {
  it('opens the privacy policy from Settings', async () => {
    await renderAt('/settings')
    await userEvent.click(screen.getByRole('button', { name: 'プライバシーポリシー' }))

    expect(screen.getByRole('heading', { level: 1, name: 'プライバシーポリシー' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1. 概要' })).toBeInTheDocument()
  })

  it('opens the terms of service from Settings', async () => {
    await renderAt('/settings')
    await userEvent.click(screen.getByRole('button', { name: '利用規約' }))

    expect(screen.getByRole('heading', { level: 1, name: '利用規約' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1. 同意' })).toBeInTheDocument()
  })

  it('switches between Japanese and English', async () => {
    await renderAt('/settings/privacy')
    await userEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1. Overview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: '日本語' }))
    expect(screen.getByRole('heading', { level: 1, name: 'プライバシーポリシー' })).toBeInTheDocument()
  })

  it('goes back to Settings', async () => {
    await renderAt('/settings/terms')
    await userEvent.click(screen.getByRole('button', { name: '設定に戻る' }))

    expect(screen.getByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument()
  })

  it('starts at the top even when Settings was scrolled down', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    try {
      await renderAt('/settings')
      scrollTo.mockClear()
      await userEvent.click(screen.getByRole('button', { name: '利用規約' }))
      expect(scrollTo).toHaveBeenCalledWith(0, 0)
    } finally {
      scrollTo.mockRestore()
    }
  })

  it('keeps the Settings tab selected on a legal page', async () => {
    await renderAt('/settings/privacy')

    expect(screen.getByRole('link', { name: '設定' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '学習' })).not.toHaveAttribute('aria-current')
  })
})
