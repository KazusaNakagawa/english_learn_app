import { useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ACTION_WIDTH,
  clampOffset,
  FULL_SWIPE_RATIO,
  isHorizontalSwipe,
  swipeOutcome,
} from '@/lib/swipe'

// jsdom has no layout, so a zero width falls back to a phone-sized row.
const FALLBACK_WIDTH = 320
const REMOVE_ANIMATION_MS = 200

interface Drag {
  pointerId: number
  startX: number
  startY: number
  base: number
  /** Null until the gesture is known to be a swipe or a scroll. */
  horizontal: boolean | null
  offset: number
}

interface Props {
  children: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Resolves once the item is gone; a rejection puts the row back. */
  onDelete: () => Promise<void>
  deleteLabel: string
}

/**
 * A row that reveals a delete button when swiped left, as iOS lists do.
 * Swiping far enough deletes on release. Vertical drags stay page scrolls.
 */
export function SwipeToDelete({ children, open, onOpenChange, onDelete, deleteLabel }: Props) {
  const rowRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const swallowClick = useRef(false)
  const [dragOffset, setDragOffset] = useState<number | null>(null)
  const [removing, setRemoving] = useState(false)

  const width = () => rowRef.current?.offsetWidth || FALLBACK_WIDTH
  const offset = removing ? -width() : dragOffset ?? (open ? -ACTION_WIDTH : 0)
  const pastFullSwipe = -offset >= width() * FULL_SWIPE_RATIO

  async function remove() {
    setRemoving(true)
    await new Promise((resolve) => setTimeout(resolve, REMOVE_ANIMATION_MS))
    try {
      await onDelete()
    } catch {
      // The caller reports the failure; the row just slides back.
    }
    setRemoving(false)
    onOpenChange(false)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || removing) return
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      base: open ? -ACTION_WIDTH : 0,
      horizontal: null,
      offset: open ? -ACTION_WIDTH : 0,
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startX
    if (d.horizontal === null) {
      d.horizontal = isHorizontalSwipe(dx, e.clientY - d.startY)
      if (d.horizontal === null) return
      if (!d.horizontal) { drag.current = null; return }
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    d.offset = clampOffset(d.base + dx, width())
    setDragOffset(d.offset)
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    if (!d.horizontal) return
    swallowClick.current = true // the click that ends a drag is not a tap
    setDragOffset(null)
    const outcome = swipeOutcome(d.offset, width())
    if (outcome === 'delete') void remove()
    else onOpenChange(outcome === 'open')
  }

  function onPointerCancel() {
    drag.current = null
    setDragOffset(null)
  }

  function onClickCapture(e: React.MouseEvent) {
    if (swallowClick.current || open) {
      e.preventDefault()
      e.stopPropagation()
      if (!swallowClick.current) onOpenChange(false) // a tap on an open row closes it
    }
    swallowClick.current = false
  }

  return (
    <div ref={rowRef} data-swipe-open={open} className="relative overflow-hidden rounded-2xl">
      {offset < 0 && (
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          aria-label={deleteLabel}
          onClick={() => void remove()}
          style={{ width: Math.max(ACTION_WIDTH, -offset) }}
          className={cn(
            'absolute inset-y-0 right-0 flex flex-col justify-center gap-0.5 bg-[var(--ios-red)] text-white text-[11px] font-medium',
            pastFullSwipe ? 'items-start pl-6' : 'items-center',
            dragOffset === null && 'transition-[width] duration-200 motion-reduce:transition-none',
          )}
        >
          <Trash2 size={18} />
          削除
        </button>
      )}
      {/* Present but out of sight when closed, so screen readers can still delete. */}
      {offset === 0 && (
        <button type="button" tabIndex={-1} aria-label={deleteLabel} onClick={() => void remove()} className="sr-only" />
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
        style={{ transform: `translateX(${offset}px)` }}
        className={cn(
          'relative touch-pan-y',
          dragOffset === null ? 'transition-transform duration-200 motion-reduce:transition-none' : 'select-none',
        )}
      >
        {children}
      </div>
    </div>
  )
}
