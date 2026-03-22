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
  speakerId?: string   // VOICEVOX speaker ID (used when voice === 'zundamon')
  apiKey?: string      // VOICEVOX x-api-key
  lang?: 'en' | 'ja'
  onColdStart?: () => void   // called when VOICEVOX takes > 3s
  onColdStartEnd?: () => void
}

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

  const coldStartTimer = onColdStart
    ? setTimeout(() => onColdStart(), 3000)
    : null

  try {
    const qRes = await fetch(
      `${VOICEVOX_BASE}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`,
      { method: 'POST', headers },
    )
    if (!qRes.ok) throw new Error(`audio_query ${qRes.status}`)

    const sRes = await fetch(`${VOICEVOX_BASE}/synthesis?speaker=${speakerId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(await qRes.json()),
    })
    if (!sRes.ok) throw new Error(`synthesis ${sRes.status}`)

    return await sRes.blob()
  } finally {
    if (coldStartTimer) clearTimeout(coldStartTimer)
    onColdStartEnd?.()
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
 * Play TTS audio. Tries cache → VOICEVOX → Web Speech API in that order.
 * Returns 'cache' | 'voicevox' | 'webspeech' indicating which source was used.
 */
export async function playTTS(
  text: string,
  options: PlayOptions,
): Promise<'cache' | 'voicevox' | 'webspeech'> {
  const { voice, speakerId = '3', apiKey, lang = 'en', onColdStart, onColdStartEnd } = options

  // 1. Cache check (VOICEVOX only)
  if (voice === 'zundamon' && VOICEVOX_BASE) {
    const cacheKey = await makeCacheKey(text, speakerId)
    const cached = await getCache(cacheKey)
    if (cached) {
      await playBlob(cached.audio_data)
      return 'cache'
    }
  }

  // 2. VOICEVOX fetch
  if (voice === 'zundamon' && VOICEVOX_BASE && apiKey) {
    try {
      const blob = await fetchVoicevoxWav(text, speakerId, apiKey, onColdStart, onColdStartEnd)
      const cacheKey = await makeCacheKey(text, speakerId)
      await putCache(cacheKey, text, speakerId, blob)
      await evictCache(CACHE_MAX_BYTES)
      await playBlob(blob)
      return 'voicevox'
    } catch {
      // fall through to Web Speech API
    }
  }

  // 3. Web Speech API fallback
  await speakWebSpeech(text, lang, voice)
  return 'webspeech'
}
