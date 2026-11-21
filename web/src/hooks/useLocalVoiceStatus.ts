import { useCallback, useEffect, useRef, useState } from 'react'
import { checkLocalVoice, type LocalVoiceStatus } from '@/services/LocalVoiceService'

export type LocalVoiceState = LocalVoiceStatus | 'checking'

/** How often to ask again while the voice is starting (the first start takes minutes). */
export const LOCAL_VOICE_POLL_MS = 3000

/**
 * The local voice's status, checked on mount while enabled and again every few
 * seconds while it is starting. `recheck` asks again at once.
 */
export function useLocalVoiceStatus(enabled: boolean): { state: LocalVoiceState; recheck: () => void } {
  const [state, setState] = useState<LocalVoiceState>('checking')
  const current = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const check = useCallback((showChecking: boolean) => {
    current.current?.abort()
    if (timer.current) clearTimeout(timer.current)
    const controller = new AbortController()
    current.current = controller
    if (showChecking) setState('checking')
    checkLocalVoice(controller.signal).then(
      (status) => {
        if (current.current !== controller) return
        setState(status)
        if (status === 'starting') timer.current = setTimeout(() => check(false), LOCAL_VOICE_POLL_MS)
      },
      () => {}, // aborted: a newer check or the unmount owns the state
    )
  }, [])

  const recheck = useCallback(() => check(true), [check])

  useEffect(() => {
    if (enabled) check(true)
    return () => {
      current.current?.abort()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [enabled, check])

  return { state, recheck }
}
