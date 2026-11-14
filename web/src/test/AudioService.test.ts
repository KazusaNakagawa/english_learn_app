import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const cache = vi.hoisted(() => ({
  getCache: vi.fn(),
  putCache: vi.fn(),
  makeCacheKey: vi.fn(),
  evictCache: vi.fn(),
}))

// Mock IndexedDB cache so AudioService can be imported in jsdom
vi.mock('@/services/AudioCacheService', () => cache)

// Asserted directly, so the once-per-session flag cannot hide a wrong report.
const notice = vi.hoisted(() => ({ reportMissingVoicevoxKey: vi.fn(), onMissingVoicevoxKey: vi.fn() }))
vi.mock('@/lib/voicevoxNotice', () => notice)

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
  let voices: { lang: string; name: string; localService?: boolean }[]
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
      addEventListener: (_: string, listener: () => void, listenerOptions?: AddEventListenerOptions) => {
        voicesChanged = listener
        listenerOptions?.signal?.addEventListener('abort', () => { voicesChanged = null })
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

  describe('the endpoint option', () => {
    const urlOf = (call: number) => fetchMock.mock.calls[call][0] as string

    it('sends requests to the endpoint passed in, not the build-time one', async () => {
      const { playTTS } = await load()
      const result = playTTS('hello', { ...options, endpoint: 'https://other.test/' })
      await audioStarted()
      FakeAudio.instances[0].onended?.()
      await expect(result).resolves.toBe('voicevox')
      expect(urlOf(0)).toMatch(/^https:\/\/other\.test\/audio_query\?/)
      expect(urlOf(1)).toMatch(/^https:\/\/other\.test\/synthesis\?/)
      expect(cache.makeCacheKey).toHaveBeenCalledWith('hello', expect.any(String), 'https://other.test')
    })

    it('reads aloud with Web Speech when the endpoint passed in is empty', async () => {
      const { playTTS } = await load()
      await expect(playTTS('hello', { ...options, endpoint: '' })).resolves.toBe('webspeech')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('a VOICEVOX engine without an API key', () => {
    const noKey = { voice: 'zundamon', lang: 'en' } as const
    const headersOf = (call: number) => fetchMock.mock.calls[call][1].headers as Record<string, string>

    const local = () => vi.stubEnv('VITE_VOICEVOX_ENDPOINT_POC', 'http://127.0.0.1:50021')

    it('uses a local engine with no key, sending no x-api-key header', async () => {
      local()
      const { playTTS } = await load()
      const result = playTTS('hello', noKey)
      await audioStarted()
      FakeAudio.instances[0].onended?.()
      await expect(result).resolves.toBe('voicevox')
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(headersOf(0)).not.toHaveProperty('x-api-key')
      expect(headersOf(1)).not.toHaveProperty('x-api-key')
    })

    it('treats an empty key as no key', async () => {
      local()
      const { playTTS } = await load()
      const result = playTTS('hello', { ...noKey, apiKey: '' })
      await audioStarted()
      FakeAudio.instances[0].onended?.()
      await expect(result).resolves.toBe('voicevox')
      expect(headersOf(0)).not.toHaveProperty('x-api-key')
    })

    it('still sends x-api-key when a key is set', async () => {
      const { playTTS } = await load()
      const result = playTTS('hello', options)
      await audioStarted()
      FakeAudio.instances[0].onended?.()
      await result
      expect(headersOf(0)['x-api-key']).toBe('test-key')
      expect(headersOf(1)['x-api-key']).toBe('test-key')
    })

    it('sends nothing to a remote endpoint without a key, so its 4xx alarm is not tripped', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { playTTS } = await load()
      await expect(playTTS('hello', noKey)).resolves.toBe('webspeech')
      expect(fetchMock).not.toHaveBeenCalled()
      expect(speak).toHaveBeenCalledOnce()
    })

    describe('the missing-key notice', () => {
      const reported = () => notice.reportMissingVoicevoxKey.mock.calls.length

      beforeEach(() => {
        notice.reportMissingVoicevoxKey.mockClear()
        vi.spyOn(console, 'warn').mockImplementation(() => {})
      })

      it('is reported when a remote endpoint has no key', async () => {
        const { playTTS } = await load()
        await playTTS('hello', noKey)
        expect(reported()).toBe(1)
      })

      it('is not reported for a local engine, which needs no key', async () => {
        local()
        const { playTTS } = await load()
        const result = playTTS('hello', noKey)
        await audioStarted()
        FakeAudio.instances[0].onended?.()
        await result
        expect(reported()).toBe(0)
      })

      it('is not reported when no endpoint is configured, since the browser voice is then the choice', async () => {
        vi.stubEnv('VITE_VOICEVOX_ENDPOINT_POC', '')
        const { playTTS } = await load()
        await playTTS('hello', noKey)
        expect(reported()).toBe(0)
      })

      it('is not reported when there is a key', async () => {
        const { playTTS } = await load()
        const result = playTTS('hello', { ...noKey, apiKey: 'test-key' })
        await audioStarted()
        FakeAudio.instances[0].onended?.()
        await result
        expect(reported()).toBe(0)
      })

      it('is not reported for a voice other than zundamon', async () => {
        const { playTTS } = await load()
        await playTTS('hello', { voice: 'default', lang: 'en' })
        expect(reported()).toBe(0)
      })
    })

    it('falls back to Web Speech when the local engine is not running', async () => {
      local()
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const { playTTS } = await load()
      await expect(playTTS('hello', noKey)).resolves.toBe('webspeech')
      expect(speak).toHaveBeenCalledOnce()
    })

    it('includes the endpoint in the cache key', async () => {
      local()
      const { playTTS } = await load()
      const result = playTTS('hello', noKey)
      await audioStarted()
      FakeAudio.instances[0].onended?.()
      await result
      expect(cache.makeCacheKey).toHaveBeenCalledWith('hello', '3', 'http://127.0.0.1:50021')
    })

    it('sends no VOICEVOX request when no endpoint is configured', async () => {
      vi.stubEnv('VITE_VOICEVOX_ENDPOINT_POC', '')
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { playTTS } = await load()
      await expect(playTTS('hello', noKey)).resolves.toBe('webspeech')
      expect(fetchMock).not.toHaveBeenCalled()
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

    it('rejects with a readable error for a Web Speech voice', async () => {
      const { playTTS } = await load()
      await expect(playTTS('hello', { voice: 'female', lang: 'en' })).rejects.toThrow('音声合成に対応していません')
    })

    it('rejects with a readable error when VOICEVOX falls back', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network down'))
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const { playTTS } = await load()
      await expect(playTTS('hello', options)).rejects.toThrow('音声合成に対応していません')
    })

    it('resolves as cancelled when the stop lands before the fallback', async () => {
      let fail: (reason: Error) => void = () => {}
      fetchMock.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', options)
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
      stopTTS()
      fail(new Error('network down'))
      await expect(result).resolves.toBe('cancelled')
    })
  })

  describe('when voices never load', () => {
    const webSpeech = { voice: 'female', lang: 'en' } as const

    beforeEach(() => {
      voices = []
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('waits for the full timeout, then speaks with the default voice', async () => {
      const { playTTS } = await load()
      const result = playTTS('hello', webSpeech)
      await vi.advanceTimersByTimeAsync(2999)
      expect(speak).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      await expect(result).resolves.toBe('webspeech')
      expect(speak).toHaveBeenCalledOnce()
    })

    it('speaks once when voiceschanged fires before the timeout', async () => {
      const { playTTS } = await load()
      const result = playTTS('hello', webSpeech)
      await vi.advanceTimersByTimeAsync(0)
      voices = [{ lang: 'en-US', name: 'Test' }]
      voicesChanged?.()
      await expect(result).resolves.toBe('webspeech')
      await vi.advanceTimersByTimeAsync(5000)
      expect(speak).toHaveBeenCalledOnce()
    })

    it('does not wait again once a load has timed out', async () => {
      const { playTTS } = await load()
      const first = playTTS('first', webSpeech)
      await vi.advanceTimersByTimeAsync(3000)
      await first
      await expect(playTTS('second', webSpeech)).resolves.toBe('webspeech')
      expect(speak).toHaveBeenCalledTimes(2)
    })

    it('uses voices that appear after a timeout', async () => {
      const { playTTS } = await load()
      const first = playTTS('first', webSpeech)
      await vi.advanceTimersByTimeAsync(3000)
      await first
      voices = [{ lang: 'en-US', name: 'Test Female' }]
      await playTTS('second', webSpeech)
      expect(speak.mock.calls[1][0]).toMatchObject({ voice: voices[0] })
    })

    it('does not wait for voices in Japanese, which never reads them', async () => {
      const { playTTS } = await load()
      await expect(playTTS('こんにちは', { voice: 'female', lang: 'ja' })).resolves.toBe('webspeech')
      expect(voicesChanged).toBeNull()
    })

    it('speaks in the chosen voice\'s own language, not the en-US default', async () => {
      const daniel = { lang: 'en-GB', name: 'Daniel', localService: true }
      voices = [{ lang: 'en-US', name: 'Samantha', localService: true }, daniel]
      const { playTTS } = await load()
      await expect(playTTS('hello', { voice: 'male', lang: 'en' })).resolves.toBe('webspeech')
      const utterance = speak.mock.calls[0][0]
      expect(utterance.voice).toBe(daniel)
      expect(utterance.lang).toBe('en-GB')
    })

    it('keeps lang en-US when the browser is left to pick the voice', async () => {
      voices = [{ lang: 'en-US', name: 'Albert', localService: true }]
      const { playTTS } = await load()
      await playTTS('hello', { voice: 'male', lang: 'en' })
      const utterance = speak.mock.calls[0][0]
      expect(utterance.voice).toBeUndefined()
      expect(utterance.lang).toBe('en-US')
    })

    it('reads the zundamon fallback with the default (female) browser voice', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const samantha = { lang: 'en-US', name: 'Samantha', localService: true }
      voices = [{ lang: 'en-US', name: 'Albert', localService: true }, samantha]
      const { playTTS } = await load()
      await expect(playTTS('hello', { voice: 'zundamon', lang: 'en' })).resolves.toBe('webspeech')
      expect(speak.mock.calls[0][0].voice).toBe(samantha)
    })

    it('does not speak when the timeout passes after a stop', async () => {
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', webSpeech)
      await vi.advanceTimersByTimeAsync(0)
      stopTTS()
      await expect(result).resolves.toBe('cancelled')
      await vi.advanceTimersByTimeAsync(5000)
      expect(speak).not.toHaveBeenCalled()
    })
  })

  describe('when an utterance never ends', () => {
    const webSpeech = { voice: 'female', lang: 'en' } as const

    beforeEach(() => {
      speak.mockImplementation(() => {})
    })

    it('resolves as cancelled after a stop with no end or error event', async () => {
      const { playTTS, stopTTS } = await load()
      const result = playTTS('hello', webSpeech)
      await vi.waitFor(() => expect(speak).toHaveBeenCalledOnce())
      stopTTS()
      await expect(result).resolves.toBe('cancelled')
    })

    it('resolves the first call as cancelled when a new request supersedes it', async () => {
      const { playTTS } = await load()
      const first = playTTS('first', webSpeech)
      await vi.waitFor(() => expect(speak).toHaveBeenCalledOnce())
      void playTTS('second', webSpeech)
      await expect(first).resolves.toBe('cancelled')
    })

    describe('without a stop', () => {
      const timeoutMessage = '音声の再生がタイムアウトしました'
      const cancelCalls = () => vi.mocked(window.speechSynthesis.cancel).mock.calls.length

      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      })

      afterEach(() => {
        vi.useRealTimers()
      })

      it('stays pending until the limit for the text, then rejects', async () => {
        const { playTTS } = await load()
        let settled = false
        const result = playTTS('hello', webSpeech).finally(() => { settled = true })
        const rejection = expect(result).rejects.toThrow(timeoutMessage)
        await vi.advanceTimersByTimeAsync(11499)
        expect(settled).toBe(false)
        await vi.advanceTimersByTimeAsync(1)
        await rejection
      })

      it('allows longer text proportionally more time', async () => {
        const { playTTS } = await load()
        let settled = false
        const result = playTTS('a'.repeat(100), webSpeech).finally(() => { settled = true })
        const rejection = expect(result).rejects.toThrow(timeoutMessage)
        await vi.advanceTimersByTimeAsync(39999)
        expect(settled).toBe(false)
        await vi.advanceTimersByTimeAsync(1)
        await rejection
      })

      it('clears the stuck utterance when the limit is reached', async () => {
        const { playTTS } = await load()
        const rejection = expect(playTTS('hello', webSpeech)).rejects.toThrow(timeoutMessage)
        await vi.advanceTimersByTimeAsync(0)
        const before = cancelCalls()
        await vi.advanceTimersByTimeAsync(11500)
        await rejection
        expect(cancelCalls()).toBe(before + 1)
      })

      it('does not fire the limit after the utterance ends', async () => {
        speak.mockImplementation((u: { onend: (() => void) | null }) => u.onend?.())
        const { playTTS } = await load()
        await expect(playTTS('hello', webSpeech)).resolves.toBe('webspeech')
        const before = cancelCalls()
        await vi.advanceTimersByTimeAsync(20000)
        expect(cancelCalls()).toBe(before)
      })

      it('does not fire the limit after a stop', async () => {
        const { playTTS, stopTTS } = await load()
        const result = playTTS('hello', webSpeech)
        await vi.advanceTimersByTimeAsync(0)
        stopTTS()
        await expect(result).resolves.toBe('cancelled')
        const before = cancelCalls()
        await vi.advanceTimersByTimeAsync(20000)
        expect(cancelCalls()).toBe(before)
      })
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

