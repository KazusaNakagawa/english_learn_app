/**
 * AudioService — TTS playback with IndexedDB cache.
 *
 * Priority:
 *   1. IndexedDB cache hit → play immediately
 *   2. VOICEVOX Lambda → fetch WAV, cache, play
 *   3. Web Speech API fallback (no cache)
 */

import { getCache, putCache, makeCacheKey, evictCache } from './AudioCacheService'
import { defaultEndpoint, isLocalEndpoint, normalizeEndpoint, voicevoxHeaders } from '@/lib/voicevox'
import { reportMissingVoicevoxKey } from '@/lib/voicevoxNotice'

const CACHE_MAX_BYTES = 50 * 1024 * 1024 // 50 MB
const VOICE_LOAD_TIMEOUT_MS = 3000
// Generous on purpose: reaching the limit cuts the speech off, and natural
// speech runs well under this even for Japanese.
const UTTERANCE_BASE_TIMEOUT_MS = 10_000
const UTTERANCE_TIMEOUT_PER_CHAR_MS = 300

export type VoiceType = 'default' | 'female' | 'male' | 'zundamon'

export interface PlayOptions {
  voice: VoiceType
  speakerId?: string
  /** The VOICEVOX engine to use; the build-time endpoint when omitted. Pages pass resolveVoicevox(settings). */
  endpoint?: string
  apiKey?: string
  lang?: 'en' | 'ja'
  onColdStart?: () => void
  onColdStartEnd?: () => void
}

export type PlaySource = 'cache' | 'voicevox' | 'webspeech' | 'cancelled'

// ---- Web Speech API helpers ----

let _voiceLoadTimedOut = false

function loadVoices(signal: AbortSignal): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    const voices = synth.getVoices()
    // After one timeout, waiting again would cost every later clip the same delay.
    if (voices.length > 0 || _voiceLoadTimedOut) { resolve(voices); return }
    // Some browsers never fire voiceschanged, so a timeout or a stop also ends
    // the wait. An empty list is fine: the utterance uses the default voice.
    const waiting = new AbortController()
    const finish = () => {
      waiting.abort()
      clearTimeout(timer)
      resolve(synth.getVoices())
    }
    const timer = setTimeout(() => {
      _voiceLoadTimedOut = true
      finish()
    }, VOICE_LOAD_TIMEOUT_MS)
    synth.addEventListener('voiceschanged', finish, { signal: waiting.signal })
    signal.addEventListener('abort', finish, { signal: waiting.signal })
  })
}

function pickEnVoice(voices: SpeechSynthesisVoice[], type: VoiceType): SpeechSynthesisVoice | null {
  const en = voices.filter((v) => v.lang.startsWith('en'))
  if (type === 'female' || type === 'default') {
    return en.find((v) => /female/i.test(v.name)) ?? null
  }
  if (type === 'male') {
    return en.find((v) => /male/i.test(v.name) && !/female/i.test(v.name)) ?? null
  }
  return null
}

async function speakWebSpeech(
  text: string,
  lang: 'en' | 'ja',
  voice: VoiceType,
  signal: AbortSignal,
): Promise<void> {
  // Absent in some embedded browsers. SettingsPage shows this message; the other
  // pages only log it.
  if (!window.speechSynthesis) throw new Error('このブラウザは音声合成に対応していません')
  // Only an English non-zundamon voice reads the list.
  const voices = lang === 'en' && voice !== 'zundamon' ? await loadVoices(signal) : []
  if (signal.aborted) return
  return new Promise((resolve, reject) => {
    // An engine can fire neither end nor error, so the utterance cannot be
    // trusted to settle this. Without the limit, pages that ignore play buttons
    // while something is playing would stay stuck.
    const watchdog = setTimeout(() => {
      window.speechSynthesis.cancel()
      reject(new Error('音声の再生がタイムアウトしました'))
    }, UTTERANCE_BASE_TIMEOUT_MS + text.length * UTTERANCE_TIMEOUT_PER_CHAR_MS)
    const settle = (finish: () => void) => {
      clearTimeout(watchdog)
      finish()
    }
    // stopTTS aborts before cancel(), so a stop settles first and a later
    // utterance error is ignored.
    signal.addEventListener('abort', () => settle(resolve), { once: true })
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = lang === 'en' ? 'en-US' : 'ja-JP'
    if (lang === 'en') {
      const v = pickEnVoice(voices, voice)
      if (v) utt.voice = v
    }
    utt.onend = () => settle(resolve)
    utt.onerror = (e) => settle(() => reject(new Error(e.error)))
    window.speechSynthesis.speak(utt)
  })
}

// ---- VOICEVOX helpers ----

async function fetchVoicevoxWav(
  base: string,
  text: string,
  speakerId: string,
  apiKey: string | undefined,
  signal: AbortSignal,
  onColdStart?: () => void,
  onColdStartEnd?: () => void,
): Promise<Blob> {
  // These POSTs are preflighted either way, since application/json is not a
  // CORS-safelisted type. x-api-key is sent only when there is a key, which a
  // local engine does not need.
  const headers = voicevoxHeaders(apiKey)
  let coldStartTriggered = false
  const coldStartTimer = onColdStart
    ? setTimeout(() => { coldStartTriggered = true; onColdStart() }, 3000)
    : null
  try {
    const qRes = await fetch(
      `${base}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`,
      { method: 'POST', headers, signal },
    )
    if (!qRes.ok) throw new Error(`audio_query failed: ${qRes.status}`)

    const sRes = await fetch(`${base}/synthesis?speaker=${speakerId}`, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify(await qRes.json()),
    })
    if (!sRes.ok) throw new Error(`synthesis failed: ${sRes.status}`)

    return await sRes.blob()
  } finally {
    if (coldStartTimer) clearTimeout(coldStartTimer)
    if (coldStartTriggered) onColdStartEnd?.()
  }
}

/**
 * Best effort and never rejects, so callers start it without awaiting: a clip
 * that was fetched must play even if it cannot be stored or storing is slow.
 */
async function storeInCache(cacheKey: string, text: string, speakerId: string, blob: Blob): Promise<void> {
  try {
    await putCache(cacheKey, text, speakerId, blob)
    await evictCache(CACHE_MAX_BYTES)
  } catch (err) {
    console.warn('[AudioService] cache write failed:', err)
  }
}

let _currentPlayback: { stop: () => void } | null = null
let _stopController = new AbortController()

function playBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    let settled = false
    const settle = (finish: () => void) => {
      if (settled) return
      settled = true
      audio.onended = null
      audio.onerror = null
      if (_currentPlayback === playback) _currentPlayback = null
      URL.revokeObjectURL(url)
      finish()
    }
    // Pausing rejects a pending play() and clearing src fires `error`. Settling
    // first keeps both from being mistaken for a playback failure, which
    // playTTS would answer by falling back to the next engine.
    const playback = {
      stop: () => settle(() => {
        audio.pause()
        audio.src = ''
        resolve()
      }),
    }
    _currentPlayback = playback
    audio.onended = () => settle(resolve)
    audio.onerror = () => settle(() => reject(new Error('Audio playback failed')))
    audio.play().catch((err) => settle(() => reject(err)))
  })
}

/**
 * Stop TTS immediately. Any playTTS call already in progress resolves with
 * 'cancelled' and produces no more sound. A VOICEVOX request still in flight is
 * aborted, so that clip is not cached.
 */
export function stopTTS(): void {
  _stopController.abort()
  _stopController = new AbortController()
  // Absent in some embedded browsers. Pages call this on unmount, where a throw
  // would take down the whole React tree.
  window.speechSynthesis?.cancel()
  _currentPlayback?.stop()
}

// ---- Public API ----

/**
 * Play TTS audio. Tries cache → VOICEVOX → Web Speech API in order.
 * Starting a call supersedes any call still in progress, so only one clip can
 * be playing and stopTTS can always reach it.
 * Returns which source was used, or 'cancelled' if stopped or superseded first.
 */
export async function playTTS(
  text: string,
  options: PlayOptions,
): Promise<PlaySource> {
  const { voice, speakerId = '3', apiKey, lang = 'en', onColdStart, onColdStartEnd } = options
  const base = options.endpoint === undefined ? defaultEndpoint() : normalizeEndpoint(options.endpoint)

  // A local engine needs no key. The AWS endpoint does: a request without one
  // gets 401 and counts toward the API's 4xx alarm, so it is never sent.
  const useVoicevox = voice === 'zundamon' && !!base && (!!apiKey || isLocalEndpoint(base))

  stopTTS()
  const { signal } = _stopController
  const isStopped = () => signal.aborted

  if (useVoicevox) {
    // crypto.subtle is undefined on non-secure origins such as a LAN dev URL.
    // Keyed by endpoint too, so switching engines does not replay another engine's clip.
    const cacheKey = await makeCacheKey(text, speakerId, base).catch((err) => {
      console.warn('[AudioService] cache unavailable:', err)
      return null
    })

    // 1. Cache hit
    if (cacheKey) {
      try {
        const cached = await getCache(cacheKey)
        if (isStopped()) return 'cancelled'
        if (cached) {
          console.debug('[AudioService] cache hit:', cacheKey)
          await playBlob(cached.audio_data)
          return isStopped() ? 'cancelled' : 'cache'
        }
      } catch (err) {
        console.warn('[AudioService] cache read failed:', err)
      }
    }
    if (isStopped()) return 'cancelled'

    // 2. VOICEVOX fetch
    try {
      console.debug('[AudioService] fetching from VOICEVOX, speaker:', speakerId)
      const blob = await fetchVoicevoxWav(base, text, speakerId, apiKey, signal, onColdStart, onColdStartEnd)
      if (isStopped()) return 'cancelled'
      if (cacheKey) void storeInCache(cacheKey, text, speakerId, blob)
      console.debug('[AudioService] playing fetched clip, size:', blob.size)
      await playBlob(blob)
      return isStopped() ? 'cancelled' : 'voicevox'
    } catch (err) {
      if (isStopped()) return 'cancelled'
      console.error('[AudioService] VOICEVOX failed, falling back to Web Speech:', err)
    }
  } else if (voice === 'zundamon') {
    console.warn('[AudioService] zundamon selected but there is no VOICEVOX endpoint, or no API key for a remote one — falling back')
    // No endpoint means the browser voice is the choice; an endpoint without its key is worth telling.
    if (base) reportMissingVoicevoxKey()
  }

  // 3. Web Speech API fallback
  if (isStopped()) return 'cancelled'
  await speakWebSpeech(text, lang, voice, signal)
  return isStopped() ? 'cancelled' : 'webspeech'
}
