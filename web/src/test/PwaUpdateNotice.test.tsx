import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PwaUpdateNotice } from '@/components/PwaUpdateNotice'

type Options = { onNeedRefresh?: () => void }
const state = vi.hoisted(() => ({ options: undefined as Options | undefined, update: undefined as unknown }))

vi.mock('virtual:pwa-register', () => ({
  registerSW: (options: Options) => {
    state.options = options
    state.update = vi.fn().mockResolvedValue(undefined)
    return state.update
  },
}))

describe('PwaUpdateNotice', () => {
  beforeEach(() => {
    state.options = undefined
  })

  it('shows nothing until a new version is waiting', () => {
    render(<PwaUpdateNotice />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('offers the update once a new version is waiting', () => {
    render(<PwaUpdateNotice />)
    act(() => state.options?.onNeedRefresh?.())
    expect(screen.getByText('新しいバージョンがあります')).toBeInTheDocument()
  })

  it('activates the new version and reloads when the user accepts', async () => {
    render(<PwaUpdateNotice />)
    act(() => state.options?.onNeedRefresh?.())
    await userEvent.click(screen.getByRole('button', { name: '更新する' }))
    expect(state.update).toHaveBeenCalledWith(true)
  })

  it('hides the banner without updating when the user chooses later', async () => {
    render(<PwaUpdateNotice />)
    act(() => state.options?.onNeedRefresh?.())
    await userEvent.click(screen.getByRole('button', { name: 'あとで' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(state.update).not.toHaveBeenCalled()
  })
})
