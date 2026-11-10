import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { X } from 'lucide-react'
import { onMissingVoicevoxKey } from '@/lib/voicevoxNotice'

/**
 * A banner above the tab bar saying why zundamon is read with the browser
 * voice. Shown at most once per session; the Settings page explains it there.
 */
export function VoicevoxKeyNotice() {
  const { pathname } = useLocation()
  const [visible, setVisible] = useState(false)

  useEffect(() => onMissingVoicevoxKey(() => setVisible(true)), [])

  if (!visible || pathname === '/settings') return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-16 z-40 mx-auto flex max-w-2xl items-center gap-2 px-4 pb-2"
    >
      <div className="flex flex-1 items-center gap-3 rounded-2xl bg-foreground/90 px-4 py-3 text-xs text-background shadow-lg">
        <p className="flex-1">ずんだもんの接続先に API キーがないため、ブラウザの音声で読んでいます</p>
        <Link to="/settings" onClick={() => setVisible(false)} className="shrink-0 font-semibold text-[var(--ios-blue)]">
          設定を開く
        </Link>
        <button type="button" aria-label="閉じる" onClick={() => setVisible(false)} className="shrink-0 opacity-70 hover:opacity-100">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
