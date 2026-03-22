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

export type PlaySource = 'cache' | 'voicevox' | 'webspeech'

// ---- Web Speech API helpers ----

function getEnVoice(type: VoiceType): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'))
  if (type === 'female' || type === 'default') {
    return voices.find((v) => /female/i.test(v.name)) ?? null
  }
  if (type === 'male') {
    return voices.find((v) => /male/i.test(v.name) && !/female/i.test(v.name)) ?? null
  }
  return null
}

function speakWebSpeech(text: string, lang: 'en' | 'ja', voice: VoiceType): Promise<void> {
  return new Promise((resolve, reject) => {
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = lang === 'en' ? 'en-US' : 'ja-JP'
    if (lang === 'en') {
      const v = getEnVoice(voice)
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

function playBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.onended = () => { URL.revokeObjectURL(url); resolve() }
    audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Audio playback failed')) }
    audio.play().catch(reject)
  })
}

// ---- Public API ----

/**
 * Play TTS audio. Tries cache → VOICEVOX → Web Speech API in order.
 * Returns which source was used.
 */
export async function playTTS(
  text: string,
  options: PlayOptions,
): Promise<PlaySource> {
  const { voice, speakerId = '3', apiKey, lang = 'en', onColdStart, onColdStartEnd } = options

  const useVoicevox = voice === 'zundamon' && !!VOICEVOX_BASE && !!apiKey

  if (useVoicevox) {
    const cacheKey = await makeCacheKey(text, speakerId)

    // 1. Cache hit
    try {
      const cached = await getCache(cacheKey)
      if (cached) {
        console.debug('[AudioService] cache hit:', cacheKey)
        await playBlob(cached.audio_data)
        return 'cache'
      }
    } catch (err) {
      console.warn('[AudioService] cache read failed:', err)
    }

    // 2. VOICEVOX fetch
    try {
      console.debug('[AudioService] fetching from VOICEVOX, speaker:', speakerId)
      const blob = await fetchVoicevoxWav(text, speakerId, apiKey, onColdStart, onColdStartEnd)
      await putCache(cacheKey, text, speakerId, blob)
      await evictCache(CACHE_MAX_BYTES)
      console.debug('[AudioService] cached and playing, size:', blob.size)
      await playBlob(blob)
      return 'voicevox'
    } catch (err) {
      console.error('[AudioService] VOICEVOX failed, falling back to Web Speech:', err)
    }
  } else if (voice === 'zundamon') {
    console.warn('[AudioService] zundamon selected but VOICEVOX_BASE or apiKey missing — falling back')
  }

  // 3. Web Speech API fallback
  await speakWebSpeech(text, lang, voice)
  return 'webspeech'
}
