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
