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
