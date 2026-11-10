import { act, renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useRowActions } from '@/hooks/useRowActions'

describe('useRowActions', () => {
  it('runs one action per row at a time, even when called twice before a render', async () => {
    const { result } = renderHook(() => useRowActions('test'))
    let finish = () => {}
    const first = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    const second = vi.fn(() => Promise.resolve())
    let outcomes: boolean[] = []
    await act(async () => {
      const running = [result.current.act('a', first), result.current.act('a', second)]
      finish()
      outcomes = await Promise.all(running)
    })
    expect(first).toHaveBeenCalledOnce()
    expect(second).not.toHaveBeenCalled()
    expect(outcomes).toEqual([true, false])
    expect(result.current.doneIds.has('a')).toBe(true)
  })

  it('lets another row act at the same time', async () => {
    const { result } = renderHook(() => useRowActions('test'))
    const action = vi.fn(() => Promise.resolve())
    await act(async () => {
      await Promise.all([result.current.act('a', action), result.current.act('b', action)])
    })
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('reports a failure and frees the row for another try', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useRowActions('test'))
    await act(async () => { await result.current.act('a', () => Promise.reject(new Error('x'))) })
    expect(result.current.error).toBe('操作に失敗しました')
    expect(result.current.isPending('a')).toBe(false)
    await act(async () => { await result.current.act('a', () => Promise.resolve()) })
    expect(result.current.error).toBeNull()
    expect(result.current.doneIds.has('a')).toBe(true)
  })
})
