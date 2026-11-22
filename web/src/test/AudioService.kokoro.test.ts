import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const cache = vi.hoisted(() => ({
  getCache: vi.fn(),
  putCache: vi.fn(),
  makeCacheKey: vi.fn(),
  evictCache: vi.fn(),
}))
vi.mock('@/services/AudioCacheService', () => cache)

const local = vi.hoisted(() => ({
  fetchLocalVoice: vi.fn(),
  isLocalVoiceAvailable: vi.fn(),
}))
vi.mock('@/services/LocalVoiceService', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/LocalVoiceService')>()
  return { ...real, fetchLocalVoice: local.fetchLocalVoice, isLocalVoiceAvailable: local.isLocalVoiceAvailable }
})

class FakeAudio {
  static instances: FakeAudio[] = []
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() {
    FakeAudio.instances.push(this)
    // Plays to the end on the next tick.
    queueMicrotask(() => setTimeout(() => this.onended?.(), 0))
  }
  play() {
    return Promise.resolve()
  }
  pause() {}
  set src(_: string) {}
}

let speak: ReturnType<typeof vi.fn>
let spoken: { text: string; voice?: { name: string } | null }[]
const load = () => import('@/services/AudioService')

beforeEach(async () => {
  vi.resetModules()
  cache.getCache.mockReset().mockResolvedValue(null)
  cache.putCache.mockReset().mockResolvedValue(undefined)
  cache.makeCacheKey.mockReset().mockResolvedValue('kokoro-key')
  cache.evictCache.mockReset().mockResolvedValue(undefined)
  local.fetchLocalVoice.mockReset().mockResolvedValue(new Blob(['RIFF']))
  local.isLocalVoiceAvailable.mockReset().mockReturnValue(true)
  FakeAudio.instances = []
  spoken = []
  speak = vi.fn((u: { text: string; voice?: { name: string } | null; onend: (() => void) | null }) => {
    spoken.push({ text: u.text, voice: u.voice })
    u.onend?.()
  })
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('VOICEVOX must not be called') }))
  vi.stubGlobal('SpeechSynthesisUtterance', class { onend = null; onerror = null; voice = null; lang = ''; constructor(public text: string) {} })
  vi.stubGlobal('speechSynthesis', {
    cancel: vi.fn(),
    speak,
    getVoices: () => [{ lang: 'en-US', name: 'Samantha Female' }, { lang: 'en-US', name: 'Daniel Male' }],
    addEventListener: () => {},
  })
  URL.createObjectURL = vi.fn(() => 'blob:test')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'debug').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('playTTS with the local voice (English male, Japanese female)', () => {
  it('does not use the local voice for English female', async () => {
    const { playTTS } = await load()
    await expect(playTTS('Hello.', { voice: 'female', lang: 'en' })).resolves.toBe('webspeech')
    expect(local.fetchLocalVoice).not.toHaveBeenCalled()
    expect(spoken[0]).toMatchObject({ voice: { name: 'Samantha Female' } })
  })

  it('does not use the local voice for the Japanese default voice', async () => {
    const { playTTS } = await load()
    await expect(playTTS('こんにちは', { voice: 'default', lang: 'ja' })).resolves.toBe('webspeech')
    expect(local.fetchLocalVoice).not.toHaveBeenCalled()
  })

  it('plays the local voice clip and caches it under its own key', async () => {
    const { playTTS } = await load()
    await expect(playTTS('Hello.', { voice: 'male', lang: 'en' })).resolves.toBe('kokoro')
    expect(local.fetchLocalVoice).toHaveBeenCalledWith('Hello.', 'en', expect.any(AbortSignal))
    expect(cache.makeCacheKey).toHaveBeenCalledWith('Hello.', 'kokoro:am_echo', 'local-kokoro')
    await vi.waitFor(() => expect(cache.putCache).toHaveBeenCalledWith('kokoro-key', 'Hello.', 'kokoro:am_echo', expect.any(Blob)))
    expect(speak).not.toHaveBeenCalled()
  })

  it('keys Japanese clips by the Japanese voice', async () => {
    const { playTTS } = await load()
    await playTTS('こんにちは', { voice: 'female', lang: 'ja' })
    expect(cache.makeCacheKey).toHaveBeenCalledWith('こんにちは', 'kokoro:jf_alpha', 'local-kokoro')
    expect(local.fetchLocalVoice).toHaveBeenCalledWith('こんにちは', 'ja', expect.any(AbortSignal))
  })

  it('plays a cached clip without asking the local API, even when it is unavailable', async () => {
    cache.getCache.mockResolvedValue({ audio_data: new Blob(['cached']) })
    local.isLocalVoiceAvailable.mockReturnValue(false)
    const { playTTS } = await load()
    await expect(playTTS('Hello.', { voice: 'male', lang: 'en' })).resolves.toBe('cache')
    expect(local.fetchLocalVoice).not.toHaveBeenCalled()
  })

  it('reads with a male browser voice when the local voice is not ready', async () => {
    const { LocalVoiceError } = await import('@/services/LocalVoiceService')
    local.fetchLocalVoice.mockRejectedValue(new LocalVoiceError('starting'))
    const { playTTS } = await load()
    await expect(playTTS('Hello.', { voice: 'male', lang: 'en' })).resolves.toBe('webspeech')
    expect(spoken[0]).toMatchObject({ text: 'Hello.', voice: { name: 'Daniel Male' } })
    expect(cache.putCache).not.toHaveBeenCalled()
  })

  it('falls back for a sentence the voice cannot read', async () => {
    const { LocalVoiceError } = await import('@/services/LocalVoiceService')
    local.fetchLocalVoice.mockRejectedValue(new LocalVoiceError('unsupported-text'))
    const { playTTS } = await load()
    await expect(playTTS('Zyxquork.', { voice: 'male', lang: 'en' })).resolves.toBe('webspeech')
  })

  it('skips the local API once it is known to be unavailable', async () => {
    local.isLocalVoiceAvailable.mockReturnValue(false)
    const { playTTS } = await load()
    await expect(playTTS('こんにちは', { voice: 'female', lang: 'ja' })).resolves.toBe('webspeech')
    expect(local.fetchLocalVoice).not.toHaveBeenCalled()
  })

  it('falls back and logs an error for an unexpected failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    local.fetchLocalVoice.mockRejectedValue(new Error('boom'))
    const { playTTS } = await load()
    await expect(playTTS('Hello.', { voice: 'male', lang: 'en' })).resolves.toBe('webspeech')
    expect(error).toHaveBeenCalled()
  })

  it('resolves as cancelled, without falling back, when stopped during the fetch', async () => {
    local.fetchLocalVoice.mockImplementation(
      (_t: string, _l: string, signal: AbortSignal) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
    )
    const { playTTS, stopTTS } = await load()
    const result = playTTS('Hello.', { voice: 'male', lang: 'en' })
    await vi.waitFor(() => expect(local.fetchLocalVoice).toHaveBeenCalled())
    stopTTS()
    await expect(result).resolves.toBe('cancelled')
    expect(speak).not.toHaveBeenCalled()
  })

  it('still uses the local API when the cache key cannot be made', async () => {
    cache.makeCacheKey.mockRejectedValue(new Error('no crypto.subtle'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { playTTS } = await load()
    await expect(playTTS('Hello.', { voice: 'male', lang: 'en' })).resolves.toBe('kokoro')
    expect(cache.putCache).not.toHaveBeenCalled()
  })
})
