import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const load = () => import('@/lib/voicevoxNotice')
const shows = () => vi.fn(() => true)

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
    const listener = shows()
    onMissingVoicevoxKey(listener)
    reportMissingVoicevoxKey()
    expect(listener).toHaveBeenCalledOnce()
  })

  it('tells them only once per session once shown', async () => {
    const { reportMissingVoicevoxKey, onMissingVoicevoxKey } = await load()
    const listener = shows()
    onMissingVoicevoxKey(listener)
    reportMissingVoicevoxKey()
    reportMissingVoicevoxKey()
    expect(listener).toHaveBeenCalledOnce()
  })

  it('keeps the notice for later when no listener is there to show it', async () => {
    const { reportMissingVoicevoxKey, onMissingVoicevoxKey } = await load()
    reportMissingVoicevoxKey()
    const listener = shows()
    onMissingVoicevoxKey(listener)
    reportMissingVoicevoxKey()
    expect(listener).toHaveBeenCalledOnce()
  })

  it('keeps the notice for later when the listener declines it, as on the Settings page', async () => {
    const { reportMissingVoicevoxKey, onMissingVoicevoxKey } = await load()
    let accept = false
    const listener = vi.fn(() => accept)
    onMissingVoicevoxKey(listener)
    reportMissingVoicevoxKey()
    accept = true
    reportMissingVoicevoxKey()
    reportMissingVoicevoxKey()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('stays quiet after a reload in the same session', async () => {
    const first = await load()
    first.onMissingVoicevoxKey(shows())
    first.reportMissingVoicevoxKey()
    vi.resetModules()
    const { reportMissingVoicevoxKey, onMissingVoicevoxKey } = await load()
    const listener = shows()
    onMissingVoicevoxKey(listener)
    reportMissingVoicevoxKey()
    expect(listener).not.toHaveBeenCalled()
  })

  it('tells them again in a new session, as after a browser restart', async () => {
    const first = await load()
    first.onMissingVoicevoxKey(shows())
    first.reportMissingVoicevoxKey()
    vi.resetModules()
    sessionStorage.clear()
    const { reportMissingVoicevoxKey, onMissingVoicevoxKey } = await load()
    const listener = shows()
    onMissingVoicevoxKey(listener)
    reportMissingVoicevoxKey()
    expect(listener).toHaveBeenCalledOnce()
  })

  it('stops telling a listener that unsubscribed', async () => {
    const { reportMissingVoicevoxKey, onMissingVoicevoxKey } = await load()
    const listener = shows()
    onMissingVoicevoxKey(listener)()
    reportMissingVoicevoxKey()
    expect(listener).not.toHaveBeenCalled()
  })

  it('still tells only once when sessionStorage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    const { reportMissingVoicevoxKey, onMissingVoicevoxKey } = await load()
    const listener = shows()
    onMissingVoicevoxKey(listener)
    reportMissingVoicevoxKey()
    reportMissingVoicevoxKey()
    expect(listener).toHaveBeenCalledOnce()
  })
})
