/** VOICEVOX endpoint rules shared by playback and the PoC diagnostics. */

/**
 * A VOICEVOX engine on this machine, such as one in local Docker. It needs no
 * API key; the AWS endpoint does, and answers a request without one with 401.
 */
export function isLocalEndpoint(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}

/**
 * Request headers, with x-api-key only when there is a key to send. A GET has
 * no body, so it leaves out Content-Type.
 */
export function voicevoxHeaders(apiKey?: string, { json = true } = {}): Record<string, string> {
  const headers: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {}
  if (apiKey) headers['x-api-key'] = apiKey
  return headers
}

/**
 * One spelling per endpoint: the host lowercased, a default port dropped, and
 * no trailing slash, so the same URL typed two ways is one endpoint and one
 * cache. A value that does not parse is only trimmed.
 */
export function normalizeEndpoint(url: string): string {
  const value = url.trim()
  try {
    const { origin, pathname } = new URL(value)
    return (origin + pathname).replace(/\/+$/, '')
  } catch {
    return value.replace(/\/+$/, '')
  }
}

/** The scheme, host, and port of an endpoint, which a key typed in Settings is tied to. Empty if none. */
export function endpointOrigin(url: string): string {
  try {
    return url ? new URL(url).origin : ''
  } catch {
    return ''
  }
}

/** The endpoint baked in at build time, used when the settings name none. */
export function defaultEndpoint(): string {
  return normalizeEndpoint(import.meta.env.VITE_VOICEVOX_ENDPOINT_POC ?? '')
}

/** A message for an endpoint that cannot be used, or null. Empty means "use the default". */
export function endpointError(url: string): string | null {
  const value = url.trim()
  if (!value) return null
  if (!/^https?:\/\//i.test(value)) return 'http:// か https:// で始まる URL を入力してください'
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return 'URL の形式が正しくありません'
  }
  // Request paths are appended to the endpoint, and fetch rejects URLs with credentials.
  if (parsed.search || parsed.hash || value.endsWith('?') || value.endsWith('#')) return '? や # を含まない URL を入力してください'
  if (parsed.username || parsed.password) return 'ユーザー名やパスワードを含まない URL を入力してください'
  return null
}

export type KeySource = 'settings' | 'build' | 'none'

export interface VoicevoxSettings {
  voicevoxEndpoint: string
  voicevoxApiKey: string
  /** Where the key typed in Settings may go. Empty means the build-time endpoint, as before keys were tied. */
  voicevoxApiKeyOrigin: string
}

/**
 * The endpoint and key playback should use, and where the key came from.
 * Each key goes only where it belongs: the build-time key to the build-time
 * endpoint, and a key typed in Settings to the origin it was typed for. So
 * naming another endpoint never sends either key there.
 */
export function resolveVoicevox(settings: VoicevoxSettings): { endpoint: string; apiKey: string; keySource: KeySource } {
  const custom = endpointError(settings.voicevoxEndpoint) ? '' : normalizeEndpoint(settings.voicevoxEndpoint)
  const fallback = defaultEndpoint()
  const endpoint = custom || fallback
  const origin = endpointOrigin(endpoint)
  const keyOrigin = settings.voicevoxApiKeyOrigin || endpointOrigin(fallback)
  if (settings.voicevoxApiKey && origin && origin === keyOrigin) {
    return { endpoint, apiKey: settings.voicevoxApiKey, keySource: 'settings' }
  }
  const buildKey = import.meta.env.VITE_VOICEVOX_API_KEY_POC ?? ''
  if (buildKey && endpoint && endpoint === fallback) return { endpoint, apiKey: buildKey, keySource: 'build' }
  return { endpoint, apiKey: '', keySource: 'none' }
}

/** Long enough for a Lambda cold start, which takes 10 to 30 seconds. */
const CHECK_TIMEOUT_MS = 40_000

const failure = (message: string) => ({ ok: false, message })

/**
 * The settings screen's connection test. It asks for /speakers, which the AWS
 * stack guards with the API key, unlike /version, so a wrong key fails here
 * instead of at playback. Resolves null when `signal` aborts it.
 */
export async function checkEndpoint(
  endpoint: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; message: string } | null> {
  if (!endpoint) return failure('接続先が設定されていません')
  const timeout = AbortSignal.timeout(CHECK_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const get = (path: string) => fetch(`${endpoint}${path}`, { headers: voicevoxHeaders(apiKey, { json: false }), signal: combined })
  try {
    const res = await get('/speakers')
    if (res.status === 401 || res.status === 403) return failure('API キーが違うか、入力されていません')
    if (!res.ok) return failure(`接続できませんでした（HTTP ${res.status}）`)
    // The version is only for show, so its failure does not fail the test.
    const version: unknown = await get('/version').then((r) => (r.ok ? r.json() : null)).catch(() => null)
    if (signal?.aborted) return null
    return { ok: true, message: typeof version === 'string' ? `接続できました（VOICEVOX ${version}）` : '接続できました' }
  } catch {
    if (signal?.aborted) return null
    if (timeout.aborted) return failure('応答がありませんでした')
    return failure('接続できませんでした。URL、エンジンが起動しているか、CORS の設定を確かめてください')
  }
}
