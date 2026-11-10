import { useRef, useState } from 'react'

/**
 * Runs an action on one row of the trash or archive page and drops the row
 * once it succeeds, instead of reloading the list. A row takes one action at
 * a time, so a quick second tap cannot run a conflicting one.
 */
export function useRowActions(tag: string) {
  const [doneIds, setDoneIds] = useState<ReadonlySet<string>>(new Set())
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  const pending = useRef(new Set<string>()) // read synchronously, before a re-render
  const [error, setError] = useState<string | null>(null)

  async function act(id: string, action: (id: string) => Promise<void>): Promise<boolean> {
    if (pending.current.has(id)) return false
    pending.current.add(id)
    setPendingIds(new Set(pending.current))
    setError(null)
    try {
      await action(id)
      setDoneIds((prev) => new Set(prev).add(id))
      return true
    } catch (err) {
      console.error(`[${tag}] action failed:`, err)
      setError('操作に失敗しました')
      return false
    } finally {
      pending.current.delete(id)
      setPendingIds(new Set(pending.current))
    }
  }

  return { doneIds, isPending: (id: string) => pendingIds.has(id), error, act }
}
