import { describe, it, expect, vi, afterEach } from 'vitest'
import { checkEndpoint, defaultEndpoint, endpointError, isLocalEndpoint, normalizeEndpoint, resolveVoicevox, voicevoxHeaders } from '@/lib/voicevox'

describe('isLocalEndpoint', () => {
  it.each([
    ['http://127.0.0.1:50021', true],
    ['http://localhost:50021', true],
    ['http://localhost', true],
    ['http://[::1]:50021', true],
    ['https://abc123.execute-api.ap-northeast-1.amazonaws.com', false],
    ['http://localhost.example.com', false],
    ['http://192.168.1.10:50021', false],
    ['', false],
    ['not a url', false],
  ])('%s is local: %s', (url, local) => {
    expect(isLocalEndpoint(url)).toBe(local)
  })
})

describe('voicevoxHeaders', () => {
  it('adds x-api-key only when a key is given', () => {
    expect(voicevoxHeaders('k')).toEqual({ 'Content-Type': 'application/json', 'x-api-key': 'k' })
    expect(voicevoxHeaders('')).toEqual({ 'Content-Type': 'application/json' })
    expect(voicevoxHeaders()).toEqual({ 'Content-Type': 'application/json' })
  })
})

describe('normalizeEndpoint', () => {
  it('trims spaces and trailing slashes', () => {
    expect(normalizeEndpoint('  http://127.0.0.1:50021//  ')).toBe('http://127.0.0.1:50021')
  })

  it('leaves an empty value empty', () => {
    expect(normalizeEndpoint('   ')).toBe('')
  })
})

describe('endpointError', () => {
  it.each([
    ['', null],
    ['  ', null],
    ['http://127.0.0.1:50021', null],
    ['https://voicevox.example.com/prod', null],
    ['127.0.0.1:50021', 'http:// か https:// で始まる URL を入力してください'],
    ['ftp://example.com', 'http:// か https:// で始まる URL を入力してください'],
    ['not a url', 'http:// か https:// で始まる URL を入力してください'],
    ['http://', 'URL の形式が正しくありません'],
  ])('%j gives %j', (url, error) => {
    expect(endpointError(url)).toBe(error)
  })
})

describe('resolveVoicevox', () => {
  const AWS = 'https://abc.execute-api.ap-northeast-1.amazonaws.com/poc'

  afterEach(() => { vi.unstubAllEnvs() })

  const build = (endpoint: string, key: string) => {
    vi.stubEnv('VITE_VOICEVOX_ENDPOINT_POC', endpoint)
    vi.stubEnv('VITE_VOICEVOX_API_KEY_POC', key)
  }

  it('uses the build-time endpoint and key when the settings name no endpoint', () => {
    build(AWS + '/', 'build-key')
    expect(defaultEndpoint()).toBe(AWS)
    expect(resolveVoicevox({ voicevoxEndpoint: '', voicevoxApiKey: '' })).toEqual({ endpoint: AWS, apiKey: 'build-key' })
  })

  it('never sends the build-time key to another endpoint', () => {
    build(AWS, 'build-key')
    expect(resolveVoicevox({ voicevoxEndpoint: 'https://other.example.com', voicevoxApiKey: '' }))
      .toEqual({ endpoint: 'https://other.example.com', apiKey: '' })
  })

  it('still uses the build-time key when the settings repeat the build-time endpoint', () => {
    build(AWS, 'build-key')
    expect(resolveVoicevox({ voicevoxEndpoint: AWS + '/', voicevoxApiKey: '' }).apiKey).toBe('build-key')
  })

  it('sends a key typed in the settings to the endpoint typed there', () => {
    build(AWS, 'build-key')
    expect(resolveVoicevox({ voicevoxEndpoint: 'https://other.example.com', voicevoxApiKey: 'mine' }))
      .toEqual({ endpoint: 'https://other.example.com', apiKey: 'mine' })
  })

  it('falls back to the build-time endpoint when the typed one is invalid', () => {
    build(AWS, 'build-key')
    expect(resolveVoicevox({ voicevoxEndpoint: 'not a url', voicevoxApiKey: '' })).toEqual({ endpoint: AWS, apiKey: 'build-key' })
  })

  it('has no endpoint when neither the build nor the settings name one', () => {
    build('', '')
    expect(resolveVoicevox({ voicevoxEndpoint: '', voicevoxApiKey: '' })).toEqual({ endpoint: '', apiKey: '' })
  })
})

describe('checkEndpoint', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  const respond = (res: Response | Error) => {
    const fetchMock = vi.fn(() => (res instanceof Error ? Promise.reject(res) : Promise.resolve(res)))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('reports the engine version, sending the key when there is one', async () => {
    const fetchMock = respond(new Response(JSON.stringify('0.25.1')))
    await expect(checkEndpoint('https://vv.example.com', 'k')).resolves.toEqual({ ok: true, message: '接続できました（VOICEVOX 0.25.1）' })
    expect(fetchMock).toHaveBeenCalledWith('https://vv.example.com/version', expect.objectContaining({ headers: { 'x-api-key': 'k' } }))
  })

  it('sends no key header to a local engine without a key', async () => {
    const fetchMock = respond(new Response(JSON.stringify('0.25.1')))
    await checkEndpoint('http://127.0.0.1:50021', '')
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:50021/version', expect.objectContaining({ headers: {} }))
  })

  it.each([401, 403])('blames the key on %i', async (status) => {
    respond(new Response('', { status }))
    await expect(checkEndpoint('https://vv.example.com', '')).resolves.toEqual({ ok: false, message: 'API キーが違うか、入力されていません' })
  })

  it('shows the status of another failure', async () => {
    respond(new Response('', { status: 502 }))
    await expect(checkEndpoint('https://vv.example.com', 'k')).resolves.toEqual({ ok: false, message: '接続できませんでした（HTTP 502）' })
  })

  it('explains a network or CORS failure', async () => {
    respond(new TypeError('Failed to fetch'))
    const result = await checkEndpoint('http://127.0.0.1:50021', '')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('CORS')
  })

  it('does not call out without an endpoint', async () => {
    const fetchMock = respond(new Response(''))
    await expect(checkEndpoint('', '')).resolves.toEqual({ ok: false, message: '接続先が設定されていません' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
