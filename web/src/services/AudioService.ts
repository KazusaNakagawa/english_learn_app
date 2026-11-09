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

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) { resolve(voices); return }
    window.speechSynthesis.addEventListener(
      'voiceschanged',
      () => resolve(window.speechSynthesis.getVoices()),
      { once: true },
    )
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
  isStopped: () => boolean,
): Promise<void> {
  const voices = await loadVoices()
  if (isStopped()) return
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
      { method: 'POST', headers },
    )
    if (!qRes.ok) throw new Error(`audio_query failed: ${qRes.status}`)

    const sRes = await fetch(`${VOICEVOX_BASE}/synthesis?speaker=${speakerId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(await qRes.json()),
    })
    if (!sRes.ok) throw new Error(`synthesis failed: ${sRes.status}`)

    return await sRes.blob()
  } finally {
    if (coldStartTimer) clearTimeout(coldStartTimer)
    if (coldStartTriggered) onColdStartEnd?.()
  }
}

let _currentPlayback: { stop: () => void } | null = null
let _stopCount = 0

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
 * Stop TTS immediately. Any playTTS call already in progress, including one
 * still fetching audio, resolves with 'cancelled' and produces no more sound.
 */
export function stopTTS(): void {
  _stopCount++
  window.speechSynthesis.cancel()
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
  const stopCountAtStart = _stopCount
  const isStopped = () => _stopCount !== stopCountAtStart

  if (useVoicevox) {
    const cacheKey = await makeCacheKey(text, speakerId)

    // 1. Cache hit
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
    if (isStopped()) return 'cancelled'

    // 2. VOICEVOX fetch
    try {
      console.debug('[AudioService] fetching from VOICEVOX, speaker:', speakerId)
      const blob = await fetchVoicevoxWav(text, speakerId, apiKey, onColdStart, onColdStartEnd)
      await putCache(cacheKey, text, speakerId, blob)
      await evictCache(CACHE_MAX_BYTES)
      if (isStopped()) return 'cancelled'
      console.debug('[AudioService] cached and playing, size:', blob.size)
      await playBlob(blob)
      return isStopped() ? 'cancelled' : 'voicevox'
    } catch (err) {
      console.error('[AudioService] VOICEVOX failed, falling back to Web Speech:', err)
    }
  } else if (voice === 'zundamon') {
    console.warn('[AudioService] zundamon selected but VOICEVOX_BASE or apiKey missing — falling back')
  }

  // 3. Web Speech API fallback
  if (isStopped()) return 'cancelled'
  try {
    await speakWebSpeech(text, lang, voice, isStopped)
  } catch (err) {
    // speechSynthesis.cancel() surfaces as an utterance error.
    if (isStopped()) return 'cancelled'
    throw err
  }
  return isStopped() ? 'cancelled' : 'webspeech'
}
