/**
 * AudioService — TTS playback with IndexedDB cache.
 *
 * Priority:
 *   1. IndexedDB cache hit → play immediately
 *   2. VOICEVOX Lambda → fetch WAV, cache, play
 *   3. Web Speech API fallback (no cache)
 */

import { getCache, putCache, makeCacheKey, evictCache } from './AudioCacheService'

const VOICEVOX_BASE = import.meta.env.VITE_VOICEVOX_ENDPOINT_POC ?? ''
const CACHE_MAX_BYTES = 50 * 1024 * 1024 // 50 MB

export type VoiceType = 'default' | 'female' | 'male' | 'zundamon'

export interface PlayOptions {
  voice: VoiceType
  speakerId?: string
  apiKey?: string
  lang?: 'en' | 'ja'
  onColdStart?: () => void
  onColdStartEnd?: () => void
}

export type PlaySource = 'cache' | 'voicevox' | 'webspeech' | 'cancelled'

// ---- Web Speech API helpers ----

function loadVoices(signal: AbortSignal): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    const voices = synth.getVoices()
    if (voices.length > 0) { resolve(voices); return }
    // Some browsers never fire voiceschanged, so a stop must also end the wait.
    const finish = () => {
      synth.removeEventListener('voiceschanged', finish)
      signal.removeEventListener('abort', finish)
      resolve(synth.getVoices())
    }
    synth.addEventListener('voiceschanged', finish)
    signal.addEventListener('abort', finish)
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
  const voices = await loadVoices(signal)
  if (signal.aborted) return
  return new Promise((resolve, reject) => {
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = lang === 'en' ? 'en-US' : 'ja-JP'
    if (lang === 'en') {
      const v = pickEnVoice(voices, voice)
      if (v) utt.voice = v
    }
    utt.onend = () => resolve()
    utt.onerror = (e) => reject(new Error(e.error))
    window.speechSynthesis.speak(utt)
  })
}

// ---- VOICEVOX helpers ----

async function fetchVoicevoxWav(
  text: string,
  speakerId: string,
  apiKey: string,
  signal: AbortSignal,
  onColdStart?: () => void,
  onColdStartEnd?: () => void,
): Promise<Blob> {
  const headers = { 'Content-Type': 'application/json', 'x-api-key': apiKey }
  let coldStartTriggered = false
  const coldStartTimer = onColdStart
    ? setTimeout(() => { coldStartTriggered = true; onColdStart() }, 3000)
    : null
  try {
    const qRes = await fetch(
      `${VOICEVOX_BASE}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`,
      { method: 'POST', headers, signal },
    )
    if (!qRes.ok) throw new Error(`audio_query failed: ${qRes.status}`)

    const sRes = await fetch(`${VOICEVOX_BASE}/synthesis?speaker=${speakerId}`, {
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

  const useVoicevox = voice === 'zundamon' && !!VOICEVOX_BASE && !!apiKey

  stopTTS()
  const { signal } = _stopController
  const isStopped = () => signal.aborted

  if (useVoicevox) {
    // crypto.subtle is undefined on non-secure origins such as a LAN dev URL.
    const cacheKey = await makeCacheKey(text, speakerId).catch((err) => {
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
      const blob = await fetchVoicevoxWav(text, speakerId, apiKey, signal, onColdStart, onColdStartEnd)
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
    console.warn('[AudioService] zundamon selected but VOICEVOX_BASE or apiKey missing — falling back')
  }

  // 3. Web Speech API fallback
  if (isStopped()) return 'cancelled'
  try {
    await speakWebSpeech(text, lang, voice, signal)
  } catch (err) {
    // speechSynthesis.cancel() surfaces as an utterance error.
    if (isStopped()) return 'cancelled'
    throw err
  }
  return isStopped() ? 'cancelled' : 'webspeech'
}
