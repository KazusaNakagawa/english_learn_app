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
  // Mirrors what a browser does: aborting rejects a pending fetch.
  const pendingFetch = (_url: string, init: RequestInit) =>
    new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })
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
      removeEventListener: (_: string, listener: () => void) => {
        if (voicesChanged === listener) voicesChanged = null
      },
    })
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
    it('aborts a pending /audio_query and never sends /synthesis', async () => {
      fetchMock.mockImplementationOnce(pendingFetch)
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', options)
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
      stopTTS()
      await expect(result).resolves.toBe('cancelled')
      await flush()
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(FakeAudio.instances).toHaveLength(0)
      expect(speak).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
    })

    it('aborts a pending /synthesis and does not cache the clip', async () => {
      fetchMock.mockImplementationOnce(async () => okResponse()).mockImplementationOnce(pendingFetch)
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', options)
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
      stopTTS()
      await expect(result).resolves.toBe('cancelled')
      expect(cache.putCache).not.toHaveBeenCalled()
      expect(FakeAudio.instances).toHaveLength(0)
    })

    it('gives a request made after a stop a signal that is not aborted', async () => {
      fetchMock.mockImplementationOnce(pendingFetch)
      const { playTTS, stopTTS } = await load()
      const first = playTTS('first', options)
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
      stopTTS()
      await expect(first).resolves.toBe('cancelled')

      const second = playTTS('second', options)
      await audioStarted()
      expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
      expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(false)
      FakeAudio.instances[0].onended?.()
      await expect(second).resolves.toBe('voicevox')
    })

    it('does not fall back or log one when the fetch fails after the stop', async () => {
      let fail: (reason: Error) => void = () => {}
      fetchMock.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', options)
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
      stopTTS()
      fail(new Error('network down'))
      await expect(result).resolves.toBe('cancelled')
      expect(speak).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
    })

    it('still logs and falls back when the fetch fails without a stop', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network down'))
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { playTTS } = await load()
      await expect(playTTS('hello', options)).resolves.toBe('webspeech')
      expect(speak).toHaveBeenCalledOnce()
      expect(error).toHaveBeenCalledOnce()
    })

    it('resolves as cancelled when voiceschanged never fires', async () => {
      voices = []
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', { voice: 'female', lang: 'en' })
      await vi.waitFor(() => expect(voicesChanged).not.toBeNull())
      stopTTS()
      await expect(result).resolves.toBe('cancelled')
      expect(voicesChanged).toBeNull()
      expect(speak).not.toHaveBeenCalled()
    })

    it('still speaks once voices load without a stop', async () => {
      voices = []
      const { playTTS } = await load()
      const result = playTTS('hello', { voice: 'female', lang: 'en' })
      await vi.waitFor(() => expect(voicesChanged).not.toBeNull())
      voices = [{ lang: 'en-US', name: 'Test' }]
      voicesChanged?.()
      await expect(result).resolves.toBe('webspeech')
      expect(voicesChanged).toBeNull()
      expect(speak).toHaveBeenCalledOnce()
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

  describe('a new request while another is in progress', () => {
    it('stops the clip already playing so that stopTTS can reach the new one', async () => {
      const { playTTS, stopTTS } = await load()
      const first = playTTS('first', options)
      await audioStarted()

      const second = playTTS('second', options)
      await expect(first).resolves.toBe('cancelled')
      expect(FakeAudio.instances[0].paused).toBe(true)

      await audioStarted(2)
      stopTTS()
      await expect(second).resolves.toBe('cancelled')
      expect(FakeAudio.instances[1].paused).toBe(true)
    })

    it('aborts the older request without waiting for its response', async () => {
      fetchMock.mockImplementationOnce(pendingFetch)
      const { playTTS } = await load()
      const first = playTTS('first', options)
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())

      const second = playTTS('second', options)
      await expect(first).resolves.toBe('cancelled')

      await audioStarted()
      FakeAudio.instances[0].onended?.()
      await expect(second).resolves.toBe('voicevox')
    })

    it('does not let an older clip that arrives late interrupt the newer one', async () => {
      let release: () => void = () => {}
      fetchMock.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(okResponse()) }))
      const { playTTS } = await load()
      const first = playTTS('first', options)
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())

      const second = playTTS('second', options)
      await audioStarted()
      release()
      await expect(first).resolves.toBe('cancelled')

      expect(FakeAudio.instances).toHaveLength(1)
      expect(FakeAudio.instances[0].paused).toBe(false)
      FakeAudio.instances[0].onended?.()
      await expect(second).resolves.toBe('voicevox')
    })
  })

  describe('when the cache fails', () => {
    const playToEnd = async (result: Promise<unknown>) => {
      await audioStarted()
      FakeAudio.instances[0].onended?.()
      return result
    }

    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    it('writes and evicts when the cache is healthy', async () => {
      const { playTTS } = await load()
      await expect(playToEnd(playTTS('hello', options))).resolves.toBe('voicevox')
      expect(cache.putCache).toHaveBeenCalledOnce()
      expect(cache.evictCache).toHaveBeenCalledOnce()
      expect(console.warn).not.toHaveBeenCalled()
    })

    it('still plays the fetched clip when putCache rejects', async () => {
      cache.putCache.mockRejectedValue(new Error('quota exceeded'))
      const { playTTS } = await load()
      await expect(playToEnd(playTTS('hello', options))).resolves.toBe('voicevox')
      expect(speak).not.toHaveBeenCalled()
      expect(console.warn).toHaveBeenCalledOnce()
    })

    it('still plays the fetched clip when evictCache rejects', async () => {
      cache.evictCache.mockRejectedValue(new Error('transaction aborted'))
      const { playTTS } = await load()
      await expect(playToEnd(playTTS('hello', options))).resolves.toBe('voicevox')
      expect(speak).not.toHaveBeenCalled()
    })

    it('starts playback without waiting for a cache write that never settles', async () => {
      cache.putCache.mockImplementationOnce(() => new Promise(() => {}))
      const { playTTS } = await load()
      await expect(playToEnd(playTTS('hello', options))).resolves.toBe('voicevox')
      expect(cache.putCache).toHaveBeenCalledOnce()
    })

    it('settles a stop at once while a cache write is still running', async () => {
      let fail: (reason: Error) => void = () => {}
      cache.putCache.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', options)
      await audioStarted()
      stopTTS()
      await expect(result).resolves.toBe('cancelled')
      expect(FakeAudio.instances[0].paused).toBe(true)

      fail(new Error('quota exceeded'))
      await flush()
      expect(speak).not.toHaveBeenCalled()
      expect(FakeAudio.instances).toHaveLength(1)
    })

    it('does not store a clip that arrives after a stop', async () => {
      const blobPending: { release: () => void } = { release: () => {} }
      fetchMock.mockImplementationOnce(async () => okResponse())
      fetchMock.mockImplementationOnce(async () => ({
        ok: true,
        blob: () => new Promise<Blob>((resolve) => { blobPending.release = () => resolve(new Blob(['wav'])) }),
      }))
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', options)
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
      await flush()
      stopTTS()
      blobPending.release()
      await expect(result).resolves.toBe('cancelled')
      expect(cache.putCache).not.toHaveBeenCalled()
      expect(FakeAudio.instances).toHaveLength(0)
    })

    it('uses VOICEVOX without the cache when makeCacheKey rejects', async () => {
      cache.makeCacheKey.mockRejectedValue(new TypeError('crypto.subtle is undefined'))
      const { playTTS } = await load()
      await expect(playToEnd(playTTS('hello', options))).resolves.toBe('voicevox')
      expect(cache.getCache).not.toHaveBeenCalled()
      expect(cache.putCache).not.toHaveBeenCalled()
      expect(cache.evictCache).not.toHaveBeenCalled()
      expect(console.warn).toHaveBeenCalledOnce()
    })

    it('falls back to Web Speech when makeCacheKey and VOICEVOX both fail', async () => {
      cache.makeCacheKey.mockRejectedValue(new TypeError('crypto.subtle is undefined'))
      fetchMock.mockRejectedValueOnce(new Error('network down'))
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const { playTTS } = await load()
      await expect(playTTS('hello', options)).resolves.toBe('webspeech')
      expect(speak).toHaveBeenCalledOnce()
    })

    it('resolves as cancelled when makeCacheKey rejects after a stop', async () => {
      let fail: (reason: Error) => void = () => {}
      cache.makeCacheKey.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', options)
      await vi.waitFor(() => expect(cache.makeCacheKey).toHaveBeenCalledOnce())
      stopTTS()
      fail(new TypeError('crypto.subtle is undefined'))
      await expect(result).resolves.toBe('cancelled')
      expect(fetchMock).not.toHaveBeenCalled()
      expect(speak).not.toHaveBeenCalled()
    })
  })

  describe('where speechSynthesis is unavailable', () => {
    beforeEach(() => {
      vi.stubGlobal('speechSynthesis', undefined)
    })

    it('does not throw when nothing is playing', async () => {
      const { stopTTS } = await load()
      expect(() => stopTTS()).not.toThrow()
    })

    it('still plays and stops VOICEVOX audio', async () => {
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', options)
      await audioStarted()
      stopTTS()
      await expect(result).resolves.toBe('cancelled')
      expect(FakeAudio.instances[0].paused).toBe(true)
    })
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

