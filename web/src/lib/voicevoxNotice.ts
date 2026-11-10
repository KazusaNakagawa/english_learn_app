/**
 * Tells the page, once per browser session, that zundamon was read with the
 * browser voice because a remote VOICEVOX endpoint has no usable API key. That
 * happens quietly after a browser restart, since the endpoint is kept but the
 * key lives in sessionStorage, and only the Settings page would say why.
 */

const SHOWN_KEY = 'english_learn_app_voicevox_key_notice'

/** Returns whether it showed the notice; one that declines leaves it for a later report. */
type Listener = () => boolean
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
  // Counted only once someone shows it, so a report nobody could show is not used up.
  let shown = false
  listeners.forEach((listener) => { if (listener()) shown = true })
  if (shown) markShown()
}

/** Returns the unsubscribe function. */
export function onMissingVoicevoxKey(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
