import { describe, it, expect } from 'vitest'
import { levelAt, wavEnvelope } from '@/lib/wavEnvelope'

/** A mono 16-bit PCM WAV with an extra chunk before `data`, as some encoders write. */
function wav(samples: number[], sampleRate = 1000, extraChunk = true): ArrayBuffer {
  const extra = extraChunk ? 8 + 3 + 1 : 0 // odd-sized LIST chunk plus its pad byte
  const buffer = new ArrayBuffer(12 + 24 + extra + 8 + samples.length * 2)
  const v = new DataView(buffer)
  const id = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  id(0, 'RIFF'); v.setUint32(4, buffer.byteLength - 8, true); id(8, 'WAVE')
  id(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  let o = 36
  if (extraChunk) { id(o, 'LIST'); v.setUint32(o + 4, 3, true); o += 12 }
  id(o, 'data'); v.setUint32(o + 4, samples.length * 2, true)
  samples.forEach((s, i) => v.setInt16(o + 8 + i * 2, s, true))
  return buffer
}

describe('wavEnvelope', () => {
  it('measures each 40 ms window, scaled to the loudest', () => {
    // 1000 Hz: 40 samples per window. Silence, loud, half as loud.
    const samples = [...Array(40).fill(0), ...Array(40).fill(16000), ...Array(40).fill(8000)]
    const env = wavEnvelope(wav(samples))!
    expect(env.rate).toBe(25)
    expect(env.levels).toHaveLength(3)
    expect(env.levels[0]).toBe(0)
    expect(env.levels[1]).toBeCloseTo(1)
    expect(env.levels[2]).toBeCloseTo(0.5)
  })

  it('looks a level up by playback time, 0 past either end', () => {
    const env = wavEnvelope(wav([...Array(40).fill(0), ...Array(40).fill(16000)]))!
    expect(levelAt(env, 0.01)).toBe(0)
    expect(levelAt(env, 0.05)).toBeCloseTo(1)
    expect(levelAt(env, 5)).toBe(0)
    expect(levelAt(env, -1)).toBe(0)
  })

  it('returns null for anything but 16-bit PCM WAV', () => {
    expect(wavEnvelope(new TextEncoder().encode('not a wav file').buffer)).toBeNull()
    const float = wav([1, 2, 3], 1000, false)
    new DataView(float).setUint16(20, 3, true) // IEEE float
    expect(wavEnvelope(float)).toBeNull()
  })

  it('keeps an all-silent clip at 0 instead of dividing by zero', () => {
    expect(wavEnvelope(wav(Array(80).fill(0)))!.levels).toEqual([0, 0])
  })
})
