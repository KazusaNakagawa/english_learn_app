import { describe, it, expect, vi, afterEach } from 'vitest'
import { checkEndpoint, defaultEndpoint, endpointError, endpointOrigin, isLocalEndpoint, normalizeEndpoint, resolveVoicevox, voicevoxHeaders } from '@/lib/voicevox'

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

  it('leaves out Content-Type for a GET', () => {
    expect(voicevoxHeaders('k', { json: false })).toEqual({ 'x-api-key': 'k' })
    expect(voicevoxHeaders('', { json: false })).toEqual({})
  })
})

describe('normalizeEndpoint', () => {
  it('trims spaces and trailing slashes', () => {
    expect(normalizeEndpoint('  http://127.0.0.1:50021//  ')).toBe('http://127.0.0.1:50021')
  })

  it('spells one endpoint one way: lowercase host, no default port', () => {
    expect(normalizeEndpoint('HTTPS://ABC.Example.COM:443/poc/')).toBe('https://abc.example.com/poc')
  })

  it('keeps the case of the path', () => {
    expect(normalizeEndpoint('https://abc.example.com/Prod')).toBe('https://abc.example.com/Prod')
  })

  it('leaves an empty value empty', () => {
    expect(normalizeEndpoint('   ')).toBe('')
  })
})

describe('endpointOrigin', () => {
  it.each([
    ['https://abc.example.com/poc', 'https://abc.example.com'],
    ['http://127.0.0.1:50021', 'http://127.0.0.1:50021'],
    ['', ''],
    ['not a url', ''],
  ])('%j gives %j', (url, origin) => {
    expect(endpointOrigin(url)).toBe(origin)
  })
})

describe('endpointError', () => {
  const scheme = 'http:// か https:// で始まる URL を入力してください'
  it.each([
    ['', null],
    ['  ', null],
    ['http://127.0.0.1:50021', null],
    ['https://voicevox.example.com/prod', null],
    ['127.0.0.1:50021', scheme],
    ['ftp://example.com', scheme],
    ['not a url', scheme],
    ['http://', 'URL の形式が正しくありません'],
    ['http://127.0.0.1:50021/?x=1', '? や # を含まない URL を入力してください'],
    ['http://127.0.0.1:50021#top', '? や # を含まない URL を入力してください'],
    ['http://127.0.0.1:50021/?', '? や # を含まない URL を入力してください'],
    ['https://user:pass@example.com', 'ユーザー名やパスワードを含まない URL を入力してください'],
  ])('%j gives %j', (url, error) => {
    expect(endpointError(url)).toBe(error)
  })
})

describe('resolveVoicevox', () => {
  const AWS = 'https://abc.execute-api.ap-northeast-1.amazonaws.com/poc'
  const AWS_ORIGIN = 'https://abc.execute-api.ap-northeast-1.amazonaws.com'
  const LOCAL = 'http://127.0.0.1:50021'

  afterEach(() => { vi.unstubAllEnvs() })

  const build = (endpoint: string, key: string) => {
    vi.stubEnv('VITE_VOICEVOX_ENDPOINT_POC', endpoint)
    vi.stubEnv('VITE_VOICEVOX_API_KEY_POC', key)
  }
  const settings = (voicevoxEndpoint: string, voicevoxApiKey = '', voicevoxApiKeyOrigin = '') =>
    ({ voicevoxEndpoint, voicevoxApiKey, voicevoxApiKeyOrigin })

  it('uses the build-time endpoint and key when the settings name no endpoint', () => {
    build(AWS + '/', 'build-key')
    expect(defaultEndpoint()).toBe(AWS)
    expect(resolveVoicevox(settings(''))).toEqual({ endpoint: AWS, apiKey: 'build-key', keySource: 'build' })
  })

  it('never sends the build-time key to another endpoint', () => {
    build(AWS, 'build-key')
    expect(resolveVoicevox(settings('https://other.example.com')))
      .toEqual({ endpoint: 'https://other.example.com', apiKey: '', keySource: 'none' })
  })

  it('still uses the build-time key when the settings spell the build-time endpoint differently', () => {
    build(AWS, 'build-key')
    expect(resolveVoicevox(settings('HTTPS://ABC.execute-api.ap-northeast-1.amazonaws.com:443/poc/')).keySource).toBe('build')
  })

  it('sends a typed key to the origin it was typed for', () => {
    build(AWS, 'build-key')
    expect(resolveVoicevox(settings('https://other.example.com/x', 'mine', 'https://other.example.com')))
      .toEqual({ endpoint: 'https://other.example.com/x', apiKey: 'mine', keySource: 'settings' })
  })

  it('never sends a typed key to an endpoint typed later', () => {
    build(AWS, 'build-key')
    expect(resolveVoicevox(settings('https://evil.example.com', 'mine', AWS_ORIGIN)))
      .toEqual({ endpoint: 'https://evil.example.com', apiKey: '', keySource: 'none' })
  })

  it('keeps a typed AWS key while a local engine is in use, and uses it again on AWS', () => {
    build(AWS, '')
    expect(resolveVoicevox(settings(LOCAL, 'mine', AWS_ORIGIN))).toEqual({ endpoint: LOCAL, apiKey: '', keySource: 'none' })
    expect(resolveVoicevox(settings('', 'mine', AWS_ORIGIN))).toEqual({ endpoint: AWS, apiKey: 'mine', keySource: 'settings' })
  })

  it('treats a key saved before keys were tied as one for the build-time endpoint', () => {
    build(AWS, 'build-key')
    expect(resolveVoicevox(settings('', 'mine', '')).apiKey).toBe('mine')
    expect(resolveVoicevox(settings('https://other.example.com', 'mine', '')).apiKey).toBe('')
  })

  it('falls back to the build-time endpoint when the typed one is invalid', () => {
    build(AWS, 'build-key')
    expect(resolveVoicevox(settings('not a url'))).toEqual({ endpoint: AWS, apiKey: 'build-key', keySource: 'build' })
  })

  it('has no endpoint when neither the build nor the settings name one', () => {
    build('', '')
    expect(resolveVoicevox(settings('', 'mine'))).toEqual({ endpoint: '', apiKey: '', keySource: 'none' })
  })
})

describe('checkEndpoint', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  type Reply = Response | Error
  const respond = (speakers: Reply, version: Reply = new Response(JSON.stringify('0.25.1'))) => {
    const fetchMock = vi.fn((url: string) => {
      const reply = url.endsWith('/speakers') ? speakers : version
      return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply.clone())
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }
  const ok = () => new Response('[]')

  it('checks the key on /speakers, which AWS guards, then shows the version', async () => {
    const fetchMock = respond(ok())
    await expect(checkEndpoint('https://vv.example.com', 'k')).resolves.toEqual({ ok: true, message: '接続できました（VOICEVOX 0.25.1）' })
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://vv.example.com/speakers', expect.objectContaining({ headers: { 'x-api-key': 'k' } }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://vv.example.com/version', expect.anything())
  })

  it('sends no headers to a local engine without a key', async () => {
    const fetchMock = respond(ok())
    await checkEndpoint('http://127.0.0.1:50021', '')
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:50021/speakers', expect.objectContaining({ headers: {} }))
  })

  it.each([401, 403])('blames the key on %i, without asking for the version', async (status) => {
    const fetchMock = respond(new Response('', { status }))
    await expect(checkEndpoint('https://vv.example.com', '')).resolves.toEqual({ ok: false, message: 'API キーが違うか、入力されていません' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('shows the status of another failure', async () => {
    respond(new Response('', { status: 502 }))
    await expect(checkEndpoint('https://vv.example.com', 'k')).resolves.toEqual({ ok: false, message: '接続できませんでした（HTTP 502）' })
  })

  it('still passes when only the version cannot be read', async () => {
    respond(ok(), new Response('', { status: 500 }))
    await expect(checkEndpoint('https://vv.example.com', 'k')).resolves.toEqual({ ok: true, message: '接続できました' })
  })

  it('explains a network or CORS failure', async () => {
    respond(new TypeError('Failed to fetch'))
    const result = await checkEndpoint('http://127.0.0.1:50021', '')
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain('CORS')
  })

  it('resolves null once the caller aborts it', async () => {
    vi.stubGlobal('fetch', vi.fn((_: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const run = new AbortController()
    const result = checkEndpoint('https://vv.example.com', 'k', run.signal)
    run.abort()
    await expect(result).resolves.toBeNull()
  })

  it('does not call out without an endpoint', async () => {
    const fetchMock = respond(ok())
    await expect(checkEndpoint('', '')).resolves.toEqual({ ok: false, message: '接続先が設定されていません' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
