import { useEffect, useState, useSyncExternalStore } from 'react'
import { levelAt } from '@/lib/wavEnvelope'
import { getZundamonSpeech, subscribeZundamonSpeech } from '@/lib/zundamonSpeech'

/**
 * Kept up between the clips of one sentence run, which pauses for the interval
 * setting between them, so the avatar does not flicker in and out.
 */
export const LINGER_MS = 1500
/** Above this share of the clip's peak loudness the mouth is open. */
const OPEN_LEVEL = 0.25
/** Mouth rhythm when there is no clip to analyse (browser voice, or before analysis). */
const FLAP_MS = 160

/**
 * Not in the repository: the art is the user's to obtain under the character's
 * guidelines (see docs/). Until both files exist, a placeholder is drawn.
 */
export const IMAGE_DIR = `${import.meta.env.BASE_URL}zundamon/`

function Placeholder({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 120 150" className="h-full w-full drop-shadow-md">
      <ellipse cx="60" cy="140" rx="34" ry="6" fill="rgb(0 0 0 / 0.12)" />
      <path d="M28 138 Q30 92 60 92 Q90 92 92 138 Z" fill="#f5f2e8" stroke="#7fbf4d" strokeWidth="3" />
      <circle cx="60" cy="62" r="40" fill="#a5d76e" />
      <circle cx="60" cy="68" r="31" fill="#fde8d7" />
      <circle cx="48" cy="64" r="4" fill="#333" />
      <circle cx="72" cy="64" r="4" fill="#333" />
      {open
        ? <ellipse cx="60" cy="81" rx="6" ry="5" fill="#c0392b" />
        : <path d="M54 80 Q60 84 66 80" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />}
    </svg>
  )
}

/**
 * Zundamon at the bottom right while speaking: bobbing, with the mouth following the voice.
 * z-30 keeps it under the notices above the tab bar (VoicevoxKeyNotice and
 * PwaUpdateNotice, z-40): the key notice can appear while zundamon speaks, and
 * it is what tells the user how to fix a missing key.
 */
export function ZundamonAvatar() {
  const speech = useSyncExternalStore(subscribeZundamonSpeech, getZundamonSpeech)
  const speaking = speech !== null
  const [visible, setVisible] = useState(false)
  const [open, setOpen] = useState(false)
  // Per image, not a count of load events: the images remount each time the
  // avatar returns and may fire load again. A failed image is marked unloaded.
  const [loaded, setLoaded] = useState({ closed: false, open: false })
  const [failed, setFailed] = useState(false)

  if (speaking && !visible) {
    setVisible(true)
    // A failed load (offline, a service worker update) gets another try on each
    // return instead of the placeholder lasting until a reload.
    setFailed(false)
  }

  useEffect(() => {
    if (speaking || !visible) return
    const timer = setTimeout(() => setVisible(false), LINGER_MS)
    return () => clearTimeout(timer)
  }, [speaking, visible])

  useEffect(() => {
    if (!speech) { setOpen(false); return }
    let frame = 0
    const tick = (now: number) => {
      const { audio, envelope } = speech
      setOpen(audio && envelope
        ? levelAt(envelope, audio.currentTime) > OPEN_LEVEL
        : Math.floor(now / FLAP_MS) % 2 === 1)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [speech])

  if (!visible) return null

  const useImages = !failed && loaded.closed && loaded.open
  return (
    <div
      aria-hidden="true"
      data-testid="zundamon-avatar"
      data-speaking={speaking}
      data-mouth={open ? 'open' : 'closed'}
      className="pointer-events-none fixed right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 h-40 w-32 animate-in fade-in slide-in-from-bottom-4 duration-300 sm:h-52 sm:w-40"
    >
      <div className={speaking ? 'h-full w-full motion-safe:animate-[zunda-bob_0.6s_ease-in-out_infinite]' : 'h-full w-full'}>
        {/* Both images stay mounted, so switching the mouth never waits on a load. */}
        {!failed && (['closed', 'open'] as const).map((mouth) => (
          <img
            key={mouth}
            src={`${IMAGE_DIR}mouth-${mouth}.png`}
            alt=""
            onLoad={() => setLoaded((l) => (l[mouth] ? l : { ...l, [mouth]: true }))}
            onError={() => {
              setFailed(true)
              setLoaded((l) => ({ ...l, [mouth]: false }))
            }}
            className="absolute inset-0 h-full w-full object-contain object-bottom drop-shadow-md"
            style={{ visibility: useImages && open === (mouth === 'open') ? 'visible' : 'hidden' }}
          />
        ))}
        {!useImages && <Placeholder open={open} />}
      </div>
    </div>
  )
}
