/** Swipe-to-delete geometry, kept apart from the component so it can be tested directly. */

/** Width of the delete button a short swipe reveals. */
export const ACTION_WIDTH = 80
/** How far a row must be dragged before it stays open. */
export const OPEN_THRESHOLD = 40
/** Share of the row width past which letting go deletes at once. */
export const FULL_SWIPE_RATIO = 0.6
/** Movement below this is still a tap, and it decides between swipe and scroll. */
export const DRAG_SLOP = 8

export type SwipeOutcome = 'delete' | 'open' | 'closed'

/** Rows only move left, and never past their own width. */
export function clampOffset(offset: number, width: number): number {
  return Math.min(0, Math.max(-width, offset))
}

export function swipeOutcome(offset: number, width: number): SwipeOutcome {
  if (-offset >= width * FULL_SWIPE_RATIO) return 'delete'
  if (-offset >= OPEN_THRESHOLD) return 'open'
  return 'closed'
}

/** Null while undecided; afterwards whether the gesture is a horizontal swipe. */
export function isHorizontalSwipe(dx: number, dy: number): boolean | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_SLOP) return null
  return Math.abs(dx) > Math.abs(dy)
}
