/**
 * LocalVoiceService — natural speech from Kokoro running on this machine,
 * through the local API that the launcher (and the Vite dev server) serves next
 * to the app. Free and keyless; see launcher/lib/tts.mjs and
 * docs/web/local-tts-kokoro.md.
 */

/** The Kokoro voice the launcher uses for each language. */
export const KOKORO_VOICES = { en: 'am_echo', ja: 'jf_alpha' } as const

export type LocalVoiceStatus =
  | 'ready'
  /** Installing or loading; the first start downloads about 1.5 GB. */
  | 'starting'
  | 'uv-missing'
  | 'failed'
  /** No local API: the page was not opened from the launcher or the dev server. */
  | 'no-server'

export type LocalVoiceErrorCode = LocalVoiceStatus | 'unsupported-text'

export class LocalVoiceError extends Error {
  constructor(public readonly code: Exclude<LocalVoiceErrorCode, 'ready'>, message = code) {
    super(message)
    this.name = 'LocalVoiceError'
  }
}

const APP_ID = 'english-learn-app'
const STATUSES: readonly LocalVoiceStatus[] = ['ready', 'starting', 'uv-missing', 'failed']

// Neither changes until the launcher restarts, so playback stops asking.
let _unavailable: 'no-server' | 'uv-missing' | null = null

/** False once the local API turned out to be missing or unable to run. */
export function isLocalVoiceAvailable(): boolean {
  return _unavailable === null
}

/** For tests. */
export function resetLocalVoiceAvailability(): void {
  _unavailable = null
}

const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError'

/**
 * Ask the local API for the voice's status. This also starts the voice when it
 * is not running, so calling it early makes the first clip natural too.
 * Never throws except for an abort.
 */
export async function checkLocalVoice(signal?: AbortSignal): Promise<LocalVoiceStatus> {
  let status: LocalVoiceStatus
  try {
    const response = await fetch('/api/health?tts=1', { cache: 'no-store', signal })
    const body = response.ok ? await response.json() : null
    const reported = body?.app === APP_ID ? body?.tts?.status : undefined
    // An older launcher answers without `tts`; "idle" is the moment before start.
    status = reported === 'idle' ? 'starting' : STATUSES.includes(reported) ? reported : 'no-server'
  } catch (err) {
    if (isAbort(err)) throw err
    status = 'no-server'
  }
  _unavailable = status === 'no-server' || status === 'uv-missing' ? status : null
  return status
}

/**
 * Speech for `text` as a WAV blob. Rejects with LocalVoiceError when the voice
 * cannot read it now, so the caller can fall back; rethrows an abort.
 */
export async function fetchLocalVoice(text: string, lang: 'en' | 'ja', signal?: AbortSignal): Promise<Blob> {
  if (_unavailable) throw new LocalVoiceError(_unavailable)
  let response: Response
  try {
    response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, lang }),
      signal,
    })
  } catch (err) {
    if (isAbort(err)) throw err
    _unavailable = 'no-server'
    throw new LocalVoiceError('no-server')
  }
  if (response.ok && response.headers.get('content-type')?.startsWith('audio/')) return response.blob()

  const body = await response.json().catch(() => null)
  const code = body?.error
  const message = typeof body?.message === 'string' ? body.message : undefined
  if (code === 'uv-missing') {
    _unavailable = 'uv-missing'
    throw new LocalVoiceError('uv-missing', message)
  }
  if (code === 'starting' || code === 'unsupported-text') throw new LocalVoiceError(code, message)
  // A static host answers 404 (or its index page) for an API it does not have.
  if (response.status === 404 || response.status === 405 || response.ok) {
    _unavailable = 'no-server'
    throw new LocalVoiceError('no-server')
  }
  throw new LocalVoiceError('failed', message)
}
