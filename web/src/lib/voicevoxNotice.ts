/**
 * Tells the page, once per browser session, that zundamon was read with the
 * browser voice because a remote VOICEVOX endpoint has no API key. That
 * happens quietly after a browser restart, since the endpoint is kept but the
 * key lives in sessionStorage, and only the Settings page would say why.
 */

const SHOWN_KEY = 'english_learn_app_voicevox_key_notice'

type Listener = () => void
const listeners = new Set<Listener>()
// Covers a browser where sessionStorage throws, so the notice still shows once.
let shownInMemory = false

function alreadyShown(): boolean {
  if (shownInMemory) return true
  try {
    return sessionStorage.getItem(SHOWN_KEY) === '1'
  } catch {
    return false
  }
}

function markShown(): void {
  shownInMemory = true
  try {
    sessionStorage.setItem(SHOWN_KEY, '1')
  } catch {
    // Remembered in memory only.
  }
}

export function reportMissingVoicevoxKey(): void {
  if (alreadyShown()) return
  markShown()
  listeners.forEach((listener) => listener())
}

/** Returns the unsubscribe function. */
export function onMissingVoicevoxKey(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
