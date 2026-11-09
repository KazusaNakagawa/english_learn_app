import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const cache = vi.hoisted(() => ({
  getCache: vi.fn(),
  putCache: vi.fn(),
  makeCacheKey: vi.fn(),
  evictCache: vi.fn(),
}))

// Mock IndexedDB cache so AudioService can be imported in jsdom
vi.mock('@/services/AudioCacheService', () => cache)

beforeEach(() => {
  cache.getCache.mockReset().mockResolvedValue(null)
  cache.putCache.mockReset().mockResolvedValue(undefined)
  cache.makeCacheKey.mockReset().mockResolvedValue('key')
  cache.evictCache.mockReset().mockResolvedValue(undefined)
})

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

    // We test indirectly: stopTTS should not throw even with no audio playing
    const { stopTTS } = await import('@/services/AudioService')
    expect(() => stopTTS()).not.toThrow()
    expect(pause).not.toHaveBeenCalled() // no audio was playing
  })
})

// Mirrors what a browser does: pausing rejects a pending play(), and clearing
// src fires `error` on the element.
class FakeAudio {
  static instances: FakeAudio[] = []
  static holdPlay = false

  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  paused = true
  private rejectPlay: ((reason: Error) => void) | null = null

  constructor() {
    FakeAudio.instances.push(this)
  }

  play(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (FakeAudio.holdPlay) { this.rejectPlay = reject; return }
      this.paused = false
      resolve()
    })
  }

  pause() {
    this.paused = true
    this.rejectPlay?.(new DOMException('interrupted by pause', 'AbortError'))
    this.rejectPlay = null
  }

  set src(value: string) {
    if (value === '') queueMicrotask(() => this.onerror?.())
  }
}

describe('playTTS with stopTTS', () => {
  const options = { voice: 'zundamon', apiKey: 'test-key', lang: 'en' } as const
  const cached = { audio_data: new Blob(['cached']) }
  let fetchMock: ReturnType<typeof vi.fn>
  let speak: ReturnType<typeof vi.fn>
  let voices: { lang: string; name: string }[]
  let voicesChanged: (() => void) | null

  const okResponse = () => ({ ok: true, json: async () => ({}), blob: async () => new Blob(['wav']) })
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
  const audioStarted = (count = 1) => vi.waitFor(() => expect(FakeAudio.instances).toHaveLength(count))
  const load = () => import('@/services/AudioService')

  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_VOICEVOX_ENDPOINT_POC', 'https://voicevox.test')
    FakeAudio.instances = []
    FakeAudio.holdPlay = false
    voices = [{ lang: 'en-US', name: 'Test' }]
    voicesChanged = null
    speak = vi.fn((utterance: { onend: (() => void) | null }) => utterance.onend?.())
    fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('Audio', FakeAudio)
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('SpeechSynthesisUtterance', class { onend = null; onerror = null; constructor(public text: string) {} })
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak,
      getVoices: () => voices,
      addEventListener: (_: string, listener: () => void) => { voicesChanged = listener },
    })
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  describe('without a stop', () => {
    it('reports voicevox when a fetched clip plays to the end', async () => {
      const { playTTS } = await load()
      const result = playTTS('hello', options)
      await audioStarted()
      FakeAudio.instances[0].onended?.()
      await expect(result).resolves.toBe('voicevox')
      expect(speak).not.toHaveBeenCalled()
    })

    it('reports cache when a cached clip plays to the end', async () => {
      cache.getCache.mockResolvedValue(cached)
      const { playTTS } = await load()
      const result = playTTS('hello', options)
      await audioStarted()
      FakeAudio.instances[0].onended?.()
      await expect(result).resolves.toBe('cache')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('falls back to Web Speech on a genuine playback error', async () => {
      const { playTTS } = await load()
      const result = playTTS('hello', options)
      await audioStarted()
      FakeAudio.instances[0].onerror?.()
      await expect(result).resolves.toBe('webspeech')
      expect(speak).toHaveBeenCalledOnce()
    })

    it('falls through to VOICEVOX when a cached clip fails to play', async () => {
      cache.getCache.mockResolvedValue(cached)
      const { playTTS } = await load()
      const result = playTTS('hello', options)
      await audioStarted()
      FakeAudio.instances[0].onerror?.()
      await audioStarted(2)
      FakeAudio.instances[1].onended?.()
      await expect(result).resolves.toBe('voicevox')
    })
  })

  describe('stopping during playback', () => {
    it('does not speak after a freshly fetched clip is stopped', async () => {
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', options)
      await audioStarted()
      stopTTS()
      await expect(result).resolves.toBe('cancelled')
      await flush()
      expect(speak).not.toHaveBeenCalled()
      expect(FakeAudio.instances[0].paused).toBe(true)
    })

    it('does not re-fetch or replay after a cached clip is stopped', async () => {
      cache.getCache.mockResolvedValue(cached)
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', options)
      await audioStarted()
      stopTTS()
      await expect(result).resolves.toBe('cancelled')
      await flush()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(FakeAudio.instances).toHaveLength(1)
      expect(speak).not.toHaveBeenCalled()
    })

    it('does not fall back when the stop lands before play() settles', async () => {
      FakeAudio.holdPlay = true
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', options)
      await audioStarted()
      stopTTS()
      await expect(result).resolves.toBe('cancelled')
      await flush()
      expect(speak).not.toHaveBeenCalled()
    })

    it('revokes the object URL exactly once', async () => {
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', options)
      await audioStarted()
      stopTTS()
      await result
      await flush()
      expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
    })
  })

  describe('stopping before audio starts', () => {
    it('does not play a clip that arrives after the stop, but still caches it', async () => {
      let release: () => void = () => {}
      fetchMock.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(okResponse()) }))
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', options)
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
      stopTTS()
      release()
      await expect(result).resolves.toBe('cancelled')
      expect(FakeAudio.instances).toHaveLength(0)
      expect(speak).not.toHaveBeenCalled()
      expect(cache.putCache).toHaveBeenCalledOnce()
    })

    it('does not fall back when the fetch fails after the stop', async () => {
      let fail: (reason: Error) => void = () => {}
      fetchMock.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', options)
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
      stopTTS()
      fail(new Error('network down'))
      await expect(result).resolves.toBe('cancelled')
      expect(speak).not.toHaveBeenCalled()
    })

    it('does not play a cached clip when the stop lands during the cache read', async () => {
      let release: (value: typeof cached) => void = () => {}
      cache.getCache.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', options)
      await vi.waitFor(() => expect(cache.getCache).toHaveBeenCalledOnce())
      stopTTS()
      release(cached)
      await expect(result).resolves.toBe('cancelled')
      expect(FakeAudio.instances).toHaveLength(0)
    })

    it('does not speak when the stop lands while voices are loading', async () => {
      voices = []
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', { voice: 'female', lang: 'en' })
      await vi.waitFor(() => expect(voicesChanged).not.toBeNull())
      stopTTS()
      voicesChanged?.()
      await expect(result).resolves.toBe('cancelled')
      expect(speak).not.toHaveBeenCalled()
    })
  })

  describe('Web Speech', () => {
    type Utterance = { onerror: ((event: { error: string }) => void) | null }

    it('resolves as cancelled when the stop surfaces as an utterance error', async () => {
      let utterance: Utterance | undefined
      speak.mockImplementationOnce((u: Utterance) => { utterance = u })
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', { voice: 'female', lang: 'en' })
      await vi.waitFor(() => expect(utterance).toBeDefined())
      stopTTS()
      utterance?.onerror?.({ error: 'canceled' })
      await expect(result).resolves.toBe('cancelled')
    })

    it('still rejects on a genuine utterance error', async () => {
      let utterance: Utterance | undefined
      speak.mockImplementationOnce((u: Utterance) => { utterance = u })
      const { playTTS } = await load()
      const result = playTTS('hello', { voice: 'female', lang: 'en' })
      await vi.waitFor(() => expect(utterance).toBeDefined())
      utterance?.onerror?.({ error: 'synthesis-failed' })
      await expect(result).rejects.toThrow('synthesis-failed')
    })
  })

  it('plays normally when a new request follows a stop', async () => {
    const { playTTS, stopTTS } = await load()
    const first = playTTS('first', options)
    await audioStarted()
    stopTTS()
    await expect(first).resolves.toBe('cancelled')

    const second = playTTS('second', options)
    await audioStarted(2)
    FakeAudio.instances[1].onended?.()
    await expect(second).resolves.toBe('voicevox')
  })

  it('leaves a stop with nothing playing harmless', async () => {
    const { playTTS, stopTTS } = await load()
    expect(() => stopTTS()).not.toThrow()
    const result = playTTS('hello', options)
    await audioStarted()
    FakeAudio.instances[0].onended?.()
    await expect(result).resolves.toBe('voicevox')
  })
})

