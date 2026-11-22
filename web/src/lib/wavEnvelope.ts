/**
 * Loudness over time of a PCM WAV clip, for lip sync: the avatar looks up the
 * level at the audio element's currentTime instead of routing the sound
 * through Web Audio, which would mute playback whenever its AudioContext is
 * suspended.
 */
export interface Envelope {
  /** Levels per second. */
  rate: number
  /** RMS of each window, scaled so the loudest window is 1. */
  levels: number[]
}

const WINDOW_SEC = 0.04

function chunkId(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3),
  )
}

/** Null for anything but 16-bit PCM WAV; VOICEVOX always returns that. */
export function wavEnvelope(buffer: ArrayBuffer): Envelope | null {
  const view = new DataView(buffer)
  if (view.byteLength < 12 || chunkId(view, 0) !== 'RIFF' || chunkId(view, 8) !== 'WAVE') return null

  let sampleRate = 0
  let channels = 0
  let bits = 0
  let dataStart = -1
  let dataLength = 0
  for (let offset = 12; offset + 8 <= view.byteLength;) {
    const id = chunkId(view, offset)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (id === 'fmt ' && body + 16 <= view.byteLength) {
      if (view.getUint16(body, true) !== 1) return null // not PCM
      channels = view.getUint16(body + 2, true)
      sampleRate = view.getUint32(body + 4, true)
      bits = view.getUint16(body + 14, true)
    } else if (id === 'data') {
      dataStart = body
      dataLength = Math.min(size, view.byteLength - body)
      break
    }
    offset = body + size + (size % 2) // chunks are word-aligned
  }
  if (dataStart < 0 || bits !== 16 || channels < 1 || sampleRate <= 0) return null

  const frameBytes = 2 * channels
  const frames = Math.floor(dataLength / frameBytes)
  const windowFrames = Math.max(1, Math.round(sampleRate * WINDOW_SEC))
  const levels: number[] = []
  for (let start = 0; start < frames; start += windowFrames) {
    const end = Math.min(frames, start + windowFrames)
    let sum = 0
    for (let f = start; f < end; f++) {
      // The first channel is enough to tell speech from silence.
      const s = view.getInt16(dataStart + f * frameBytes, true) / 32768
      sum += s * s
    }
    levels.push(Math.sqrt(sum / (end - start)))
  }
  const peak = Math.max(0, ...levels)
  return { rate: sampleRate / windowFrames, levels: peak > 0 ? levels.map((l) => l / peak) : levels }
}

/** The level at a playback position; 0 outside the clip. */
export function levelAt(envelope: Envelope, timeSec: number): number {
  const i = Math.floor(timeSec * envelope.rate)
  return i >= 0 && i < envelope.levels.length ? envelope.levels[i] : 0
}
