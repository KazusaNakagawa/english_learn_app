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

/** Request headers, with x-api-key only when there is a key to send. */
export function voicevoxHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['x-api-key'] = apiKey
  return headers
}

/** Drops surrounding spaces and trailing slashes, so one endpoint has one spelling. */
export function normalizeEndpoint(url: string): string {
  return url.trim().replace(/\/+$/, '')
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
  try {
    new URL(value)
    return null
  } catch {
    return 'URL の形式が正しくありません'
  }
}

/**
 * The endpoint and key playback should use. The build-time key goes only to
 * the build-time endpoint, so naming another endpoint in the settings never
 * sends it there.
 */
export function resolveVoicevox(settings: { voicevoxEndpoint: string; voicevoxApiKey: string }): {
  endpoint: string
  apiKey: string
} {
  const custom = endpointError(settings.voicevoxEndpoint) ? '' : normalizeEndpoint(settings.voicevoxEndpoint)
  const endpoint = custom || defaultEndpoint()
  const buildKey = endpoint === defaultEndpoint() ? import.meta.env.VITE_VOICEVOX_API_KEY_POC ?? '' : ''
  return { endpoint, apiKey: settings.voicevoxApiKey || buildKey }
}

/** Long enough for a Lambda cold start, which takes 10 to 30 seconds. */
const CHECK_TIMEOUT_MS = 40_000

/** Asks the engine for its version, as the settings screen's connection test. */
export async function checkEndpoint(endpoint: string, apiKey: string): Promise<{ ok: boolean; message: string }> {
  if (!endpoint) return { ok: false, message: '接続先が設定されていません' }
  try {
    const res = await fetch(`${endpoint}/version`, {
      headers: apiKey ? { 'x-api-key': apiKey } : {},
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    })
    if (res.status === 401 || res.status === 403) return { ok: false, message: 'API キーが違うか、入力されていません' }
    if (!res.ok) return { ok: false, message: `接続できませんでした（HTTP ${res.status}）` }
    const version: unknown = await res.json().catch(() => null)
    return { ok: true, message: typeof version === 'string' ? `接続できました（VOICEVOX ${version}）` : '接続できました' }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') return { ok: false, message: '応答がありませんでした' }
    return { ok: false, message: '接続できませんでした。URL、エンジンが起動しているか、CORS の設定を確かめてください' }
  }
}
