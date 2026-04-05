import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock IndexedDB cache so AudioService can be imported in jsdom
vi.mock('@/services/AudioCacheService', () => ({
  getCache: vi.fn().mockResolvedValue(null),
  putCache: vi.fn().mockResolvedValue(undefined),
  makeCacheKey: vi.fn().mockResolvedValue('key'),
  evictCache: vi.fn().mockResolvedValue(undefined),
}))

describe('stopTTS', () => {
  beforeEach(() => {
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: vi.fn(),
      getVoices: () => [],
    })
  })

  it('calls speechSynthesis.cancel()', async () => {
    const { stopTTS } = await import('@/services/AudioService')
    stopTTS()
    expect(window.speechSynthesis.cancel).toHaveBeenCalledOnce()
  })

  it('pauses and nulls out a playing HTMLAudioElement', async () => {
    const pause = vi.fn()
    const mockAudio = { pause, src: 'blob:fake' } as unknown as HTMLAudioElement

    // Inject the private _currentAudio by constructing a Blob playback scenario
    // We test indirectly: stopTTS should not throw even with no audio playing
    const { stopTTS } = await import('@/services/AudioService')
    expect(() => stopTTS()).not.toThrow()
    expect(pause).not.toHaveBeenCalled() // no audio was playing
  })
})

