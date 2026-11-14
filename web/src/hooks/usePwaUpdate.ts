import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * Registers the service worker and reports when a new version is waiting.
 * `update` activates it and reloads, so the user is never moved onto a new
 * build without asking.
 */
export function usePwaUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [applyUpdate, setApplyUpdate] = useState<(() => Promise<void>) | null>(null)

  useEffect(() => {
    const update = registerSW({ onNeedRefresh: () => setNeedRefresh(true) })
    setApplyUpdate(() => () => update(true))
  }, [])

  return {
    needRefresh,
    update: () => applyUpdate?.(),
    dismiss: () => setNeedRefresh(false),
  }
}
