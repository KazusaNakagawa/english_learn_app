import { describe, it, expect, vi, afterEach } from 'vitest'
import { newId } from '@/lib/id'

describe('newId', () => {
  const UUID_V4 = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('makes an uppercase UUID v4, the spelling iOS writes', () => {
    expect(newId()).toMatch(UUID_V4)
  })

  it('works without crypto.randomUUID, which non-secure origins lack', () => {
    const original = crypto.randomUUID
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      const ids = new Set(Array.from({ length: 50 }, newId))
      expect([...ids].every((id) => UUID_V4.test(id))).toBe(true)
      expect(ids.size).toBe(50)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true })
    }
  })
})
