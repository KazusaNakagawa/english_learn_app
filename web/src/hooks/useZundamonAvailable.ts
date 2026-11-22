import { useEffect, useState } from 'react'
import { isLocalEndpoint, probeLocalEngine, voicevoxUsable } from '@/lib/voicevox'

const NOT_CONFIGURED = 'ずんだもんは、VOICEVOX の接続先と API キーを設定すると選べます。それまではブラウザの音声で読みます'
const ENGINE_DOWN = 'VOICEVOX のエンジンに接続できないため、ずんだもんは選べません。エンジンを起動してこの画面に戻ってください。それまではブラウザの音声で読みます'
const OFFLINE = 'オフラインのため、ずんだもんは選べません。ブラウザの音声で読みます'

/**
 * Whether zundamon can be chosen right now, and if not, why.
 * - no endpoint, or a remote one without a key: not configured
 * - a local engine: it must answer (checked on open and whenever the window regains focus)
 * - a remote endpoint: the network must be up; it is not probed, since a request
 *   can cold start Lambda and count toward the API's alarms
 */
export function useZundamonAvailable({ endpoint, apiKey }: { endpoint: string; apiKey: string }): { available: boolean; reason: string | null } {
  const configured = voicevoxUsable({ endpoint, apiKey })
  const local = configured && isLocalEndpoint(endpoint)
  const [online, setOnline] = useState(() => navigator.onLine)
  // null until the first answer, so a running engine does not flash as disabled.
  const [engineUp, setEngineUp] = useState<boolean | null>(null)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    if (!local) return
    const run = new AbortController()
    const check = () => { void probeLocalEngine(endpoint, run.signal).then((up) => { if (!run.signal.aborted) setEngineUp(up) }) }
    check()
    window.addEventListener('focus', check)
    return () => {
      run.abort()
      window.removeEventListener('focus', check)
      setEngineUp(null)
    }
  }, [local, endpoint])

  if (!configured) return { available: false, reason: NOT_CONFIGURED }
  if (local) return engineUp === false ? { available: false, reason: ENGINE_DOWN } : { available: true, reason: null }
  return online ? { available: true, reason: null } : { available: false, reason: OFFLINE }
}
