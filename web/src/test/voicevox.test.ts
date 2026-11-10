import { describe, it, expect } from 'vitest'
import { isLocalEndpoint, voicevoxHeaders } from '@/lib/voicevox'

describe('isLocalEndpoint', () => {
  it.each([
    ['http://127.0.0.1:50021', true],
    ['http://localhost:50021', true],
    ['http://localhost', true],
    ['http://[::1]:50021', true],
    ['https://abc123.execute-api.ap-northeast-1.amazonaws.com', false],
    ['http://localhost.example.com', false],
    ['http://192.168.1.10:50021', false],
    ['', false],
    ['not a url', false],
  ])('%s is local: %s', (url, local) => {
    expect(isLocalEndpoint(url)).toBe(local)
  })
})

describe('voicevoxHeaders', () => {
  it('adds x-api-key only when a key is given', () => {
    expect(voicevoxHeaders('k')).toEqual({ 'Content-Type': 'application/json', 'x-api-key': 'k' })
    expect(voicevoxHeaders('')).toEqual({ 'Content-Type': 'application/json' })
    expect(voicevoxHeaders()).toEqual({ 'Content-Type': 'application/json' })
  })
})
