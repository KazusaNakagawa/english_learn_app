import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const load = () => import('@/lib/voicevoxNotice')

describe('voicevoxNotice', () => {
  beforeEach(() => {
    vi.resetModules()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('tells listeners when a remote endpoint has no key', async () => {
    const { reportMissingVoicevoxKey, onMissingVoicevoxKey } = await load()
    const listener = vi.fn()
    onMissingVoicevoxKey(listener)
    reportMissingVoicevoxKey()
    expect(listener).toHaveBeenCalledOnce()
  })

  it('tells them only once per session', async () => {
    const { reportMissingVoicevoxKey, onMissingVoicevoxKey } = await load()
    const listener = vi.fn()
    onMissingVoicevoxKey(listener)
    reportMissingVoicevoxKey()
    reportMissingVoicevoxKey()
    expect(listener).toHaveBeenCalledOnce()
  })

  it('stays quiet after a reload in the same session', async () => {
    ;(await load()).reportMissingVoicevoxKey()
    vi.resetModules()
    const { reportMissingVoicevoxKey, onMissingVoicevoxKey } = await load()
    const listener = vi.fn()
    onMissingVoicevoxKey(listener)
    reportMissingVoicevoxKey()
    expect(listener).not.toHaveBeenCalled()
  })

  it('tells them again in a new session, as after a browser restart', async () => {
    ;(await load()).reportMissingVoicevoxKey()
    vi.resetModules()
    sessionStorage.clear()
    const { reportMissingVoicevoxKey, onMissingVoicevoxKey } = await load()
    const listener = vi.fn()
    onMissingVoicevoxKey(listener)
    reportMissingVoicevoxKey()
    expect(listener).toHaveBeenCalledOnce()
  })

  it('stops telling a listener that unsubscribed', async () => {
    const { reportMissingVoicevoxKey, onMissingVoicevoxKey } = await load()
    const listener = vi.fn()
    onMissingVoicevoxKey(listener)()
    reportMissingVoicevoxKey()
    expect(listener).not.toHaveBeenCalled()
  })

  it('still tells only once when sessionStorage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    const { reportMissingVoicevoxKey, onMissingVoicevoxKey } = await load()
    const listener = vi.fn()
    onMissingVoicevoxKey(listener)
    reportMissingVoicevoxKey()
    reportMissingVoicevoxKey()
    expect(listener).toHaveBeenCalledOnce()
  })
})
