import { useCallback, useEffect, useRef, useState } from 'react'
import { checkClaudeCode, type ClaudeCodeStatus } from '@/services/ClaudeCodeService'

export type ClaudeCodeState = ClaudeCodeStatus | { kind: 'checking' }

/**
 * The local Claude Code API's status, checked on mount while enabled.
 * `recheck` asks again, for after the user installs or logs in.
 */
export function useClaudeCodeStatus(enabled: boolean): { state: ClaudeCodeState; recheck: () => void } {
  const [state, setState] = useState<ClaudeCodeState>({ kind: 'checking' })
  const current = useRef<AbortController | null>(null)

  const recheck = useCallback(() => {
    current.current?.abort()
    const controller = new AbortController()
    current.current = controller
    setState({ kind: 'checking' })
    checkClaudeCode(controller.signal).then(
      (status) => { if (current.current === controller) setState(status) },
      () => {}, // aborted: a newer check or the unmount owns the state
    )
  }, [])

  useEffect(() => {
    if (enabled) recheck()
    return () => current.current?.abort()
  }, [enabled, recheck])

  return { state, recheck }
}
