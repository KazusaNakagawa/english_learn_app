import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const MESSAGE = 'ずんだもんの接続先に API キーがないため、ブラウザの音声で読んでいます'

async function setup(path = '/') {
  vi.resetModules()
  sessionStorage.clear()
  const notice = await import('@/lib/voicevoxNotice')
  const { VoicevoxKeyNotice } = await import('@/components/VoicevoxKeyNotice')
  render(
    <MemoryRouter initialEntries={[path]}>
      <VoicevoxKeyNotice />
      <Routes>
        <Route path="/" element={<p>単語一覧</p>} />
        <Route path="/settings" element={<p>設定画面</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return { report: () => act(() => notice.reportMissingVoicevoxKey()) }
}

describe('VoicevoxKeyNotice', () => {
  beforeEach(() => {
    sessionStorage.clear()
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

  it('stays hidden on the Settings page, which explains the key itself', async () => {
    const { report } = await setup('/settings')
    report()
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument()
  })
})
