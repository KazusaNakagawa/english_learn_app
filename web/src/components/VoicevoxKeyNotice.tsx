import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { X } from 'lucide-react'
import { onMissingVoicevoxKey } from '@/lib/voicevoxNotice'

/** Long enough to read, short enough not to keep covering the bottom of the page. */
export const NOTICE_MS = 8000

const SETTINGS_PATH = '/settings'

/**
 * A banner above the tab bar saying why zundamon is read with the browser
 * voice. Shown at most once per session, and never on the Settings page,
 * which explains the key itself.
 */
export function VoicevoxKeyNotice() {
  const { pathname } = useLocation()
  const [visible, setVisible] = useState(false)
  const onSettings = useRef(pathname === SETTINGS_PATH)
  onSettings.current = pathname === SETTINGS_PATH

  // Declined on Settings, so the notice is kept for a report elsewhere.
  useEffect(() => onMissingVoicevoxKey(() => {
    if (onSettings.current) return false
    setVisible(true)
    return true
  }), [])

  // Settings is where the user fixes the key, so having been there settles it.
  if (visible && pathname === SETTINGS_PATH) setVisible(false)

  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => setVisible(false), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [visible])

  if (!visible) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-16 z-40 mx-auto flex max-w-2xl items-center gap-2 px-4 pb-2"
    >
      <div className="flex flex-1 items-center gap-3 rounded-2xl bg-foreground/90 px-4 py-3 text-xs text-background shadow-lg">
        <p className="flex-1">ずんだもんの接続先で使える API キーがないため、ブラウザの音声で読んでいます</p>
        <Link to={SETTINGS_PATH} onClick={() => setVisible(false)} className="shrink-0 font-semibold text-[var(--ios-blue)]">
          設定を開く
        </Link>
        <button type="button" aria-label="閉じる" onClick={() => setVisible(false)} className="shrink-0 opacity-70 hover:opacity-100">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
