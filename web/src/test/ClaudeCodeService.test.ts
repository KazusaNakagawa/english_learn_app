import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkClaudeCode, generateWithClaudeCode } from '@/services/ClaudeCodeService'
import { GenerationError } from '@/services/OpenAIService'

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const health = (claude: unknown) => json(200, { app: 'english-learn-app', version: '0.1.0', claude })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('checkClaudeCode', () => {
  it('is ready when the CLI is installed and logged in, with the plan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => health({ installed: true, loggedIn: true, subscriptionType: 'max' })))
    expect(await checkClaudeCode()).toEqual({ kind: 'ready', plan: 'max' })
  })

  it('reports a logged-out CLI', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => health({ installed: true, loggedIn: false, subscriptionType: null })))
    expect(await checkClaudeCode()).toEqual({ kind: 'logged-out' })
  })

  it('reports a missing CLI', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => health({ installed: false, loggedIn: false, subscriptionType: null })))
    expect(await checkClaudeCode()).toEqual({ kind: 'cli-missing' })
  })

  it('reports no local server when /api/health is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(404, {})))
    expect(await checkClaudeCode()).toEqual({ kind: 'no-server' })
  })

  it('reports no local server when something else answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { app: 'other' })))
    expect(await checkClaudeCode()).toEqual({ kind: 'no-server' })
  })

  it('reports no local server when the reply is not JSON (an SPA fallback page)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('html') } })))
    expect(await checkClaudeCode()).toEqual({ kind: 'no-server' })
  })

  it('reports no local server when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    expect(await checkClaudeCode()).toEqual({ kind: 'no-server' })
  })

  it('passes an abort through', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('Aborted', 'AbortError') }))
    await expect(checkClaudeCode()).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('asks the same-origin /api/health without caching', async () => {
    const fetchMock = vi.fn(async () => health({ installed: true, loggedIn: true, subscriptionType: null }))
    vi.stubGlobal('fetch', fetchMock)
    await checkClaudeCode()
    const [url, init] = (fetchMock.mock.calls as unknown[][])[0]
    expect(url).toBe('/api/health')
    expect(init).toMatchObject({ cache: 'no-store' })
  })
})

describe('generateWithClaudeCode', () => {
  const content = {
    meaning: 'りんご',
    phonetic: 'ˈæp.əl',
    sentences: [{ english: 'I ate an apple.', japanese: 'りんごを食べた。', category: '日常会話' }],
  }

  it('posts the word and model as JSON and returns the content', async () => {
    const fetchMock = vi.fn(async () => json(200, content))
    vi.stubGlobal('fetch', fetchMock)
    expect(await generateWithClaudeCode('apple', { model: 'haiku' })).toEqual(content)
    const [url, init] = (fetchMock.mock.calls as unknown[][])[0] as [string, RequestInit]
    expect(url).toBe('/api/generate-sentences')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({ word: 'apple', model: 'haiku' })
  })

  it('rejects a blank word without a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(generateWithClaudeCode('  ', { model: 'sonnet' })).rejects.toBeInstanceOf(GenerationError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the server message on an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { error: 'not-logged-in', message: 'ログインしてください' })))
    await expect(generateWithClaudeCode('apple', { model: 'sonnet' })).rejects.toThrow('ログインしてください')
  })

  it('explains a missing local API (404) instead of a bare status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(404, {})))
    const err = await generateWithClaudeCode('apple', { model: 'sonnet' }).catch((e) => e)
    expect(err).toBeInstanceOf(GenerationError)
    expect(err.message).toMatch(/english-learn-app/)
  })

  it('falls back to the status when the error body is unreadable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => { throw new SyntaxError() } })))
    await expect(generateWithClaudeCode('apple', { model: 'sonnet' })).rejects.toThrow(/500/)
  })

  it('explains a connection failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const err = await generateWithClaudeCode('apple', { model: 'sonnet' }).catch((e) => e)
    expect(err).toBeInstanceOf(GenerationError)
    expect(err.message).toMatch(/接続/)
  })

  it('rejects a reply without sentences', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { meaning: 'm', sentences: [] })))
    await expect(generateWithClaudeCode('apple', { model: 'sonnet' })).rejects.toBeInstanceOf(GenerationError)
  })

  it('passes an abort through unwrapped', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('Aborted', 'AbortError') }))
    await expect(generateWithClaudeCode('apple', { model: 'sonnet' })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
