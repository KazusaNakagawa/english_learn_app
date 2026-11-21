import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const load = () => import('@/services/LocalVoiceService')

const json = (body: unknown, init: { status?: number } = {}) =>
  new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { 'content-type': 'application/json' } })
const wav = () => new Response('RIFF', { status: 200, headers: { 'content-type': 'audio/wav' } })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('checkLocalVoice', () => {
  it('asks /api/health?tts=1 and returns the reported status', async () => {
    fetchMock.mockResolvedValue(json({ app: 'english-learn-app', tts: { status: 'ready' } }))
    const { checkLocalVoice } = await load()
    await expect(checkLocalVoice()).resolves.toBe('ready')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/health?tts=1')
  })

  it.each(['starting', 'uv-missing', 'failed'])('passes on %s', async (status) => {
    fetchMock.mockResolvedValue(json({ app: 'english-learn-app', tts: { status } }))
    const { checkLocalVoice } = await load()
    await expect(checkLocalVoice()).resolves.toBe(status)
  })

  it('treats idle (the moment before start) as starting', async () => {
    fetchMock.mockResolvedValue(json({ app: 'english-learn-app', tts: { status: 'idle' } }))
    const { checkLocalVoice } = await load()
    await expect(checkLocalVoice()).resolves.toBe('starting')
  })

  it('is no-server for another app, an older launcher, a 404, or a network error', async () => {
    const { checkLocalVoice } = await load()
    fetchMock.mockResolvedValueOnce(json({ app: 'other', tts: { status: 'ready' } }))
    await expect(checkLocalVoice()).resolves.toBe('no-server')
    fetchMock.mockResolvedValueOnce(json({ app: 'english-learn-app' }))
    await expect(checkLocalVoice()).resolves.toBe('no-server')
    fetchMock.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
    await expect(checkLocalVoice()).resolves.toBe('no-server')
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(checkLocalVoice()).resolves.toBe('no-server')
  })

  it('marks the voice unavailable for no-server and uv-missing, and available again when ready', async () => {
    const { checkLocalVoice, isLocalVoiceAvailable } = await load()
    fetchMock.mockResolvedValueOnce(json({ app: 'english-learn-app', tts: { status: 'uv-missing' } }))
    await checkLocalVoice()
    expect(isLocalVoiceAvailable()).toBe(false)
    fetchMock.mockResolvedValueOnce(json({ app: 'english-learn-app', tts: { status: 'ready' } }))
    await checkLocalVoice()
    expect(isLocalVoiceAvailable()).toBe(true)
  })

  it('rethrows an abort', async () => {
    fetchMock.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    const { checkLocalVoice } = await load()
    await expect(checkLocalVoice()).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('fetchLocalVoice', () => {
  it('POSTs the text and language and returns the WAV', async () => {
    fetchMock.mockResolvedValue(wav())
    const { fetchLocalVoice } = await load()
    const blob = await fetchLocalVoice('Hello.', 'en')
    expect(await blob.text()).toBe('RIFF')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/tts')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ text: 'Hello.', lang: 'en' })
  })

  it.each([
    ['starting', 503],
    ['unsupported-text', 422],
  ])('rejects with %s and stays available', async (code, status) => {
    fetchMock.mockResolvedValue(json({ error: code, message: 'm' }, { status }))
    const { fetchLocalVoice, isLocalVoiceAvailable } = await load()
    await expect(fetchLocalVoice('x', 'en')).rejects.toMatchObject({ code })
    expect(isLocalVoiceAvailable()).toBe(true)
  })

  it('rejects with uv-missing and then stops asking', async () => {
    fetchMock.mockResolvedValue(json({ error: 'uv-missing', message: 'install uv' }, { status: 503 }))
    const { fetchLocalVoice } = await load()
    await expect(fetchLocalVoice('x', 'en')).rejects.toMatchObject({ code: 'uv-missing', message: 'install uv' })
    await expect(fetchLocalVoice('y', 'en')).rejects.toMatchObject({ code: 'uv-missing' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('treats a static host (404, or its index page with 200) as no-server and stops asking', async () => {
    const { fetchLocalVoice, isLocalVoiceAvailable, resetLocalVoiceAvailability } = await load()
    fetchMock.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
    await expect(fetchLocalVoice('x', 'en')).rejects.toMatchObject({ code: 'no-server' })
    expect(isLocalVoiceAvailable()).toBe(false)
    resetLocalVoiceAvailability()
    fetchMock.mockResolvedValueOnce(new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    await expect(fetchLocalVoice('x', 'en')).rejects.toMatchObject({ code: 'no-server' })
    expect(isLocalVoiceAvailable()).toBe(false)
  })

  it('is failed for other errors, and stays available', async () => {
    fetchMock.mockResolvedValue(json({ error: 'failed', message: 'm' }, { status: 502 }))
    const { fetchLocalVoice, isLocalVoiceAvailable } = await load()
    await expect(fetchLocalVoice('x', 'ja')).rejects.toMatchObject({ code: 'failed' })
    expect(isLocalVoiceAvailable()).toBe(true)
  })

  it('rethrows an abort without marking anything', async () => {
    fetchMock.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    const { fetchLocalVoice, isLocalVoiceAvailable } = await load()
    await expect(fetchLocalVoice('x', 'en')).rejects.toMatchObject({ name: 'AbortError' })
    expect(isLocalVoiceAvailable()).toBe(true)
  })
})
