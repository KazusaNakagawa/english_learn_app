import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, renderHook, screen, fireEvent } from '@testing-library/react'
import { LocalVoiceSetup } from '@/components/LocalVoiceSetup'

const service = vi.hoisted(() => ({ checkLocalVoice: vi.fn() }))
vi.mock('@/services/LocalVoiceService', () => service)

describe('LocalVoiceSetup', () => {
  it('shows a spinner while checking', () => {
    render(<LocalVoiceSetup state="checking" onRecheck={() => {}} />)
    expect(screen.getByText(/状態を確認しています/)).toBeInTheDocument()
  })

  it('says the natural voice is in use when ready', () => {
    render(<LocalVoiceSetup state="ready" onRecheck={() => {}} />)
    expect(screen.getByText('ナチュラル音声で読み上げます')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /再確認/ })).not.toBeInTheDocument()
  })

  it('explains the first download while starting', () => {
    render(<LocalVoiceSetup state="starting" onRecheck={() => {}} />)
    expect(screen.getByText('ナチュラル音声を準備しています')).toBeInTheDocument()
    expect(screen.getByText(/1.5GB/)).toBeInTheDocument()
  })

  it('gives the uv install command and the restart step when uv is missing', () => {
    render(<LocalVoiceSetup state="uv-missing" onRecheck={() => {}} />)
    expect(screen.getByText(/uv が必要です/)).toBeInTheDocument()
    expect(screen.getByText('curl -LsSf https://astral.sh/uv/install.sh | sh')).toBeInTheDocument()
    expect(screen.getByText(/もう一度起動します/)).toBeInTheDocument()
  })

  it('points to the launcher when there is no local API', () => {
    render(<LocalVoiceSetup state="no-server" onRecheck={() => {}} />)
    expect(screen.getByText(/この画面ではナチュラル音声を使えません/)).toBeInTheDocument()
    expect(screen.getByText('npx english-learn-app')).toBeInTheDocument()
  })

  it('offers a retry when the voice failed to start', () => {
    const onRecheck = vi.fn()
    render(<LocalVoiceSetup state="failed" onRecheck={onRecheck} />)
    expect(screen.getByText(/起動できませんでした/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /再確認/ }))
    expect(onRecheck).toHaveBeenCalledOnce()
  })
})

describe('useLocalVoiceStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    service.checkLocalVoice.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  const load = async () => (await import('@/hooks/useLocalVoiceStatus')).useLocalVoiceStatus

  it('does not check while disabled', async () => {
    const useLocalVoiceStatus = await load()
    renderHook(() => useLocalVoiceStatus(false))
    expect(service.checkLocalVoice).not.toHaveBeenCalled()
  })

  it('polls while starting and stops once ready', async () => {
    service.checkLocalVoice.mockResolvedValueOnce('starting').mockResolvedValueOnce('starting').mockResolvedValue('ready')
    const useLocalVoiceStatus = await load()
    const { result } = renderHook(() => useLocalVoiceStatus(true))
    await act(async () => {})
    expect(result.current.state).toBe('starting')
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(service.checkLocalVoice).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(result.current.state).toBe('ready')
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(service.checkLocalVoice).toHaveBeenCalledTimes(3)
  })

  it('stops polling on unmount', async () => {
    service.checkLocalVoice.mockResolvedValue('starting')
    const useLocalVoiceStatus = await load()
    const { unmount } = renderHook(() => useLocalVoiceStatus(true))
    await act(async () => {})
    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(service.checkLocalVoice).toHaveBeenCalledTimes(1)
  })
})
