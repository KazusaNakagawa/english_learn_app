import { describe, it, expect } from 'vitest'
import { ACTION_WIDTH, clampOffset, fullSwipeDistance, isHorizontalSwipe, OPEN_THRESHOLD, swipeOutcome } from '@/lib/swipe'

describe('swipeOutcome', () => {
  const width = 300

  it.each([
    ['no movement', 0, 'closed'],
    ['just short of the open threshold', -(OPEN_THRESHOLD - 1), 'closed'],
    ['exactly the open threshold', -OPEN_THRESHOLD, 'open'],
    ['the action width', -ACTION_WIDTH, 'open'],
    ['just short of a full swipe', -(width * 0.6 - 1), 'open'],
    ['exactly a full swipe', -(width * 0.6), 'delete'],
    ['the whole row', -width, 'delete'],
  ])('%s gives %s', (_, offset, outcome) => {
    expect(swipeOutcome(offset as number, width)).toBe(outcome)
  })
})

describe('swipeOutcome with two buttons', () => {
  const open = 2 * ACTION_WIDTH

  it('rests open at the width of both buttons', () => {
    expect(swipeOutcome(-open, 320, open)).toBe('open')
  })

  it('deletes at 60% of a wide row', () => {
    expect(swipeOutcome(-239, 400, open)).toBe('open')
    expect(swipeOutcome(-240, 400, open)).toBe('delete')
  })

  it('keeps a narrow row from deleting at its open position', () => {
    expect(swipeOutcome(-open, 240, open)).toBe('open')
    expect(fullSwipeDistance(240, open)).toBe(open + OPEN_THRESHOLD)
    expect(swipeOutcome(-(open + OPEN_THRESHOLD), 240, open)).toBe('delete')
  })

  it('still deletes on a row too narrow for the usual distance, by dragging all the way', () => {
    expect(fullSwipeDistance(180, open)).toBe(180)
    expect(swipeOutcome(-179, 180, open)).toBe('open')
    expect(swipeOutcome(-180, 180, open)).toBe('delete')
  })
})

describe('clampOffset', () => {
  it('does not move right of the resting position', () => {
    expect(clampOffset(25, 300)).toBe(0)
  })

  it('does not move past the row width', () => {
    expect(clampOffset(-400, 300)).toBe(-300)
  })

  it('passes values in between through', () => {
    expect(clampOffset(-120, 300)).toBe(-120)
  })
})

describe('isHorizontalSwipe', () => {
  it('waits while the movement is within the slop', () => {
    expect(isHorizontalSwipe(5, 3)).toBeNull()
  })

  it('treats a mostly horizontal drag as a swipe', () => {
    expect(isHorizontalSwipe(-20, 5)).toBe(true)
  })

  it('leaves a mostly vertical drag to page scrolling', () => {
    expect(isHorizontalSwipe(-6, 30)).toBe(false)
  })

  it('treats an exact diagonal as a scroll', () => {
    expect(isHorizontalSwipe(-10, 10)).toBe(false)
  })
})
