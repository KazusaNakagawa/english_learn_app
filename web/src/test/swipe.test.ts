import { describe, it, expect } from 'vitest'
import { ACTION_WIDTH, clampOffset, isHorizontalSwipe, OPEN_THRESHOLD, swipeOutcome } from '@/lib/swipe'

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
