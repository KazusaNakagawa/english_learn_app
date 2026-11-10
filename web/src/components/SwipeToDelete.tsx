import { useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ACTION_WIDTH,
  clampOffset,
  fullSwipeDistance,
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

/** A button shown to the left of delete, such as archive. */
export interface SwipeAction {
  label: string
  ariaLabel: string
  icon: React.ReactNode
  /** Tailwind classes for the button's tint and text color. */
  className: string
  /** Resolves once the item is gone; a rejection puts the row back. */
  onAction: () => Promise<void>
}

interface Props {
  children: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Resolves once the item is gone; a rejection puts the row back. */
  onDelete: () => Promise<void>
  deleteLabel: string
  secondaryAction?: SwipeAction
}

/**
 * A row that reveals a delete button when swiped left, as iOS lists do, with
 * an optional second button beside it. Swiping far enough deletes on release.
 * Vertical drags stay page scrolls.
 */
export function SwipeToDelete({ children, open, onOpenChange, onDelete, deleteLabel, secondaryAction }: Props) {
  const rowRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const swallowClick = useRef(false)
  const [dragOffset, setDragOffset] = useState<number | null>(null)
  // Which button is taking the row away. Set synchronously too, so a second tap cannot start another removal.
  const [removing, setRemoving] = useState<'delete' | 'secondary' | null>(null)
  const removingRef = useRef(false)

  const width = () => rowRef.current?.offsetWidth || FALLBACK_WIDTH
  // A row narrower than its buttons opens only as far as it is wide.
  const openWidth = Math.min(ACTION_WIDTH * (secondaryAction ? 2 : 1), width())
  const offset = removing ? -width() : dragOffset ?? (open ? -openWidth : 0)
  const pastFullSwipe = removing === 'delete' || (!removing && -offset >= fullSwipeDistance(width(), openWidth))
  // The button doing the removal covers the row, so an archive does not look like a delete.
  const showSecondary = !!secondaryAction && !pastFullSwipe
  const showDelete = removing !== 'secondary'
  const secondaryWidth = removing === 'secondary' ? -offset : ACTION_WIDTH
  // Delete takes whatever the secondary button does not, and all of it past a full swipe.
  const deleteWidth = Math.max(ACTION_WIDTH, -offset - (showSecondary ? ACTION_WIDTH : 0))

  async function remove(which: 'delete' | 'secondary' = 'delete') {
    if (removingRef.current) return
    removingRef.current = true
    setRemoving(which)
    await new Promise((resolve) => setTimeout(resolve, REMOVE_ANIMATION_MS))
    try {
      await (which === 'secondary' && secondaryAction ? secondaryAction.onAction() : onDelete())
    } catch {
      // The caller reports the failure; the row just slides back.
    }
    removingRef.current = false
    setRemoving(null)
    onOpenChange(false)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || removing) return
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      base: open ? -openWidth : 0,
      horizontal: null,
      offset: open ? -openWidth : 0,
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
    const outcome = swipeOutcome(d.offset, width(), openWidth)
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
      {offset < 0 && showSecondary && secondaryAction && (
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          aria-label={secondaryAction.ariaLabel}
          disabled={!!removing}
          onClick={() => void remove('secondary')}
          style={{ width: secondaryWidth, right: showDelete ? deleteWidth : 0 }}
          className={cn(
            'absolute inset-y-0 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
            secondaryAction.className,
            dragOffset === null && 'transition-[right,width] duration-200 motion-reduce:transition-none',
          )}
        >
          {secondaryAction.icon}
          {secondaryAction.label}
        </button>
      )}
      {offset < 0 && showDelete && (
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          aria-label={deleteLabel}
          disabled={!!removing}
          onClick={() => void remove()}
          style={{ width: deleteWidth }}
          className={cn(
            'absolute inset-y-0 right-0 flex flex-col justify-center gap-0.5 text-[var(--ios-red)] text-[11px] font-medium',
            // A soft tint, a little stronger once letting go would delete.
            pastFullSwipe ? 'items-start pl-6 bg-[var(--ios-red)]/25' : 'items-center bg-[var(--ios-red)]/12',
            dragOffset === null && 'transition-[width,background-color] duration-200 motion-reduce:transition-none',
          )}
        >
          <Trash2 size={18} />
          削除
        </button>
      )}
      {/* Present but out of sight when closed, so screen readers can still delete. */}
      {offset === 0 && (
        <>
          {secondaryAction && (
            <button
              type="button" tabIndex={-1} aria-label={secondaryAction.ariaLabel}
              onClick={() => void remove('secondary')} className="sr-only"
            />
          )}
          <button type="button" tabIndex={-1} aria-label={deleteLabel} onClick={() => void remove()} className="sr-only" />
        </>
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
