import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { evictCache, getCache, makeCacheKey, putCache } from '@/services/AudioCacheService'

type Handler = (() => void) | null

class FakeRequest {
  result: unknown = undefined
  error: DOMException | null = null
  onsuccess: Handler = null
  onerror: Handler = null

  succeed(result?: unknown) {
    this.result = result
    this.onsuccess?.()
  }
}

class FakeTransaction {
  oncomplete: Handler = null
  onabort: Handler = null
  error: DOMException | null = null
  requests: FakeRequest[] = []
  puts: unknown[] = []
  deletes: string[] = []

  private track() {
    const request = new FakeRequest()
    this.requests.push(request)
    return request
  }

  objectStore() {
    return {
      get: () => this.track(),
      put: (record: unknown) => { this.puts.push(record); return this.track() },
      delete: (id: string) => { this.deletes.push(id); return this.track() },
      index: () => ({ getAll: () => this.track() }),
    }
  }

  complete() {
    this.oncomplete?.()
  }

  // Per the IndexedDB spec, aborting clears the result of every request.
  abort(error: DOMException) {
    this.error = error
    for (const request of this.requests) request.result = undefined
    this.onabort?.()
  }
}

const quotaError = () => new DOMException('quota exceeded', 'QuotaExceededError')
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const record = (id: string, size: number, accessedAt: string) => ({
  id,
  size_bytes: size,
  last_accessed_at: accessedAt,
})

describe('AudioCacheService when a transaction ends', () => {
  let transactions: FakeTransaction[]

  const openedTransaction = async () => {
    await vi.waitFor(() => expect(transactions).toHaveLength(1))
    return transactions[0]
  }

  beforeEach(() => {
    transactions = []
    const db = {
      transaction: () => {
        const tx = new FakeTransaction()
        transactions.push(tx)
        return tx
      },
    }
    vi.stubGlobal('indexedDB', {
      open: () => {
        const request = new FakeRequest()
        queueMicrotask(() => request.succeed(db))
        return request
      },
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('getCache', () => {
    it('returns the record and writes the LRU touch once the transaction commits', async () => {
      const result = getCache('key')
      const tx = await openedTransaction()
      tx.requests[0].succeed(record('key', 1, '2020-01-01T00:00:00.000Z'))
      expect(tx.puts).toHaveLength(1)
      tx.complete()
      const found = await result
      expect(found?.id).toBe('key')
      expect(found?.last_accessed_at).not.toBe('2020-01-01T00:00:00.000Z')
    })

    it('returns null for a missing record without an LRU write', async () => {
      const result = getCache('key')
      const tx = await openedTransaction()
      tx.requests[0].succeed(undefined)
      tx.complete()
      await expect(result).resolves.toBeNull()
      expect(tx.puts).toHaveLength(0)
    })

    it('still returns the record when only the LRU touch aborts', async () => {
      const result = getCache('key')
      const tx = await openedTransaction()
      tx.requests[0].succeed(record('key', 1, '2020-01-01T00:00:00.000Z'))
      tx.abort(quotaError())
      await expect(result).resolves.toMatchObject({ id: 'key' })
    })

    it('rejects when the transaction aborts before the read succeeds', async () => {
      const result = getCache('key')
      const tx = await openedTransaction()
      tx.abort(quotaError())
      await expect(result).rejects.toThrow('quota exceeded')
    })
  })

  describe('putCache', () => {
    const put = () => putCache('key', 'text', '3', new Blob(['wav']))

    it('stays pending until the transaction commits', async () => {
      let settled = false
      const result = put().finally(() => { settled = true })
      const tx = await openedTransaction()
      tx.requests[0].succeed()
      await flush()
      expect(settled).toBe(false)
      tx.complete()
      await expect(result).resolves.toBeUndefined()
    })

    it('rejects when the commit aborts after the request succeeded', async () => {
      const result = put()
      const tx = await openedTransaction()
      tx.requests[0].succeed()
      tx.abort(quotaError())
      await expect(result).rejects.toThrow('quota exceeded')
    })

    it('rejects with an error even when the abort carries none', async () => {
      const result = put()
      const tx = await openedTransaction()
      tx.onabort?.()
      await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    })
  })

  describe('evictCache', () => {
    const oversized = [
      record('old', 60, '2020-01-01T00:00:00.000Z'),
      record('new', 60, '2021-01-01T00:00:00.000Z'),
    ]

    it('deletes the oldest records and resolves on commit', async () => {
      const result = evictCache(100)
      const tx = await openedTransaction()
      tx.requests[0].succeed(oversized)
      await vi.waitFor(() => expect(tx.deletes).toEqual(['old']))
      tx.complete()
      await expect(result).resolves.toBeUndefined()
    })

    it('rejects when the delete transaction aborts', async () => {
      const result = evictCache(100)
      const tx = await openedTransaction()
      tx.requests[0].succeed(oversized)
      await vi.waitFor(() => expect(tx.deletes).toEqual(['old']))
      tx.abort(quotaError())
      await expect(result).rejects.toThrow('quota exceeded')
    })

    it('resolves without deleting when the total is exactly at the limit', async () => {
      const result = evictCache(120)
      const tx = await openedTransaction()
      tx.requests[0].succeed(oversized)
      await expect(result).resolves.toBeUndefined()
      expect(tx.deletes).toHaveLength(0)
    })
  })
})

describe('makeCacheKey', () => {
  it('differs by endpoint, so engines do not share clips', async () => {
    const local = await makeCacheKey('hello', '3', 'http://127.0.0.1:50021')
    const remote = await makeCacheKey('hello', '3', 'https://voicevox.example')
    expect(local).not.toBe(remote)
    expect(local).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is stable for the same text, speaker, and endpoint', async () => {
    expect(await makeCacheKey('hello', '3', 'x')).toBe(await makeCacheKey('hello', '3', 'x'))
  })
})
