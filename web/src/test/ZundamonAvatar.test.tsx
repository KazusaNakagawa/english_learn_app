import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { LINGER_MS, ZundamonAvatar } from '@/components/ZundamonAvatar'
import { setZundamonSpeech } from '@/lib/zundamonSpeech'

describe('ZundamonAvatar', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] }) })
  afterEach(() => {
    act(() => setZundamonSpeech(null))
    vi.useRealTimers()
  })

  const avatar = () => screen.queryByTestId('zundamon-avatar')

  it('stays hidden until zundamon speaks', () => {
    render(<ZundamonAvatar />)
    expect(avatar()).toBeNull()
    act(() => setZundamonSpeech({ audio: null, envelope: null }))
    expect(avatar()).toHaveAttribute('data-speaking', 'true')
  })

  it('lingers between clips, then leaves', () => {
    render(<ZundamonAvatar />)
    act(() => setZundamonSpeech({ audio: null, envelope: null }))
    act(() => setZundamonSpeech(null))
    act(() => { vi.advanceTimersByTime(LINGER_MS - 100) })
    expect(avatar()).toHaveAttribute('data-speaking', 'false')
    act(() => setZundamonSpeech({ audio: null, envelope: null }))
    act(() => { vi.advanceTimersByTime(LINGER_MS) })
    expect(avatar()).not.toBeNull()
    act(() => setZundamonSpeech(null))
    act(() => { vi.advanceTimersByTime(LINGER_MS) })
    expect(avatar()).toBeNull()
  })

  it('opens the mouth where the clip is loud', () => {
    render(<ZundamonAvatar />)
    const audio = { currentTime: 0 } as HTMLAudioElement
    act(() => setZundamonSpeech({ audio, envelope: { rate: 10, levels: [0, 1] } }))
    act(() => { vi.advanceTimersByTime(20) })
    expect(avatar()).toHaveAttribute('data-mouth', 'closed')
    audio.currentTime = 0.15
    act(() => { vi.advanceTimersByTime(20) })
    expect(avatar()).toHaveAttribute('data-mouth', 'open')
  })

  it('draws the placeholder when the art is missing', () => {
    const { container } = render(<ZundamonAvatar />)
    act(() => setZundamonSpeech({ audio: null, envelope: null }))
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('shows the art once both images load', () => {
    const { container } = render(<ZundamonAvatar />)
    act(() => setZundamonSpeech({ audio: null, envelope: null }))
    container.querySelectorAll('img').forEach((img) => fireEvent.load(img))
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('img[src$="mouth-closed.png"]')).not.toBeNull()
  })
})
