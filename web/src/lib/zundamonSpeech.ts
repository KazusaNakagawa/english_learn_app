import type { Envelope } from './wavEnvelope'

/**
 * What zundamon is saying right now, for the avatar. AudioService sets it while
 * a zundamon clip plays and clears it when the clip ends or is stopped.
 */
export interface ZundamonSpeech {
  /** The playing VOICEVOX clip; null when the browser voice reads it instead. */
  audio: HTMLAudioElement | null
  /** Null until the clip is analysed, or when it cannot be. */
  envelope: Envelope | null
}

/**
 * Off unless web/.env sets VITE_ZUNDAMON_AVATAR=true. While off, nothing is
 * shown and no clip is analysed. Read on each call, so tests can stub it.
 */
export function isZundamonAvatarEnabled(): boolean {
  return import.meta.env.VITE_ZUNDAMON_AVATAR === 'true'
}

let current: ZundamonSpeech | null = null
const listeners = new Set<() => void>()

export function getZundamonSpeech(): ZundamonSpeech | null {
  return current
}

export function setZundamonSpeech(speech: ZundamonSpeech | null): void {
  if (speech === current) return
  current = speech
  listeners.forEach((l) => l())
}

/** For useSyncExternalStore; returns the unsubscribe function. */
export function subscribeZundamonSpeech(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
