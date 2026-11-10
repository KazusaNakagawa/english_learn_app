import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const MESSAGE = 'ずんだもんの接続先で使える API キーがないため、ブラウザの音声で読んでいます'

async function setup(path = '/') {
  vi.resetModules()
  sessionStorage.clear()
  const notice = await import('@/lib/voicevoxNotice')
  const { VoicevoxKeyNotice, NOTICE_MS } = await import('@/components/VoicevoxKeyNotice')
  render(
    <MemoryRouter initialEntries={[path]}>
      <VoicevoxKeyNotice />
      <nav>
        <Link to="/">学習タブ</Link>
        <Link to="/settings">設定タブ</Link>
      </nav>
      <Routes>
        <Route path="/" element={<p>単語一覧</p>} />
        <Route path="/settings" element={<p>設定画面</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return { report: () => act(() => notice.reportMissingVoicevoxKey()), NOTICE_MS }
}

describe('VoicevoxKeyNotice', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows nothing until a missing key is reported', async () => {
    await setup()
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument()
  })

  it('explains the fallback and links to Settings', async () => {
    const { report } = await setup()
    report()
    expect(screen.getByRole('status')).toHaveTextContent(MESSAGE)
    await userEvent.click(screen.getByRole('link', { name: '設定を開く' }))
    expect(screen.getByText('設定画面')).toBeInTheDocument()
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument()
  })

  it('can be dismissed', async () => {
    const { report } = await setup()
    report()
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument()
  })

  it('does not come back after Settings is opened from the tab bar', async () => {
    const { report } = await setup()
    report()
    await userEvent.click(screen.getByRole('link', { name: '設定タブ' }))
    await userEvent.click(screen.getByRole('link', { name: '学習タブ' }))
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument()
  })

  it('stays hidden on the Settings page and shows on the next report elsewhere', async () => {
    const { report } = await setup('/settings')
    report()
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: '学習タブ' }))
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument()
    report()
    expect(screen.getByText(MESSAGE)).toBeInTheDocument()
  })

  it('goes away on its own, so it does not keep covering the page', async () => {
    vi.useFakeTimers()
    const { report, NOTICE_MS } = await setup()
    report()
    expect(screen.getByText(MESSAGE)).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(NOTICE_MS) })
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument()
  })
})
