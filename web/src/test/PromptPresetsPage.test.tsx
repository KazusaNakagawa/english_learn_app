import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import App from '@/App'
import {
  addPreset,
  BUILT_IN_PRESETS,
  loadPresetState,
  MAX_PRESETS,
  savePresetState,
} from '@/services/PromptPresetService'

vi.mock('@/services/AudioService', () => ({
  playTTS: vi.fn().mockResolvedValue('webspeech'),
  stopTTS: vi.fn(),
}))

vi.mock('@/services/AudioCacheService', () => ({
  getCacheUsage: vi.fn().mockResolvedValue(0),
  clearCache: vi.fn().mockResolvedValue(undefined),
}))

const BUSINESS = BUILT_IN_PRESETS[1]

async function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
  await act(async () => {}) // let the settings page's cache usage request settle
}

describe('prompt presets', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('opens the list from Settings, which names the active preset', async () => {
    await renderAt('/settings')
    const row = screen.getByRole('button', { name: /プリセット管理/ })
    expect(row).toHaveTextContent('一般')
    await userEvent.click(row)

    expect(screen.getByRole('heading', { level: 1, name: '例文生成の条件' })).toBeInTheDocument()
    for (const preset of BUILT_IN_PRESETS) {
      expect(screen.getByRole('button', { name: preset.name })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: '一般' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('makes a preset active when it is chosen, and Settings shows it', async () => {
    await renderAt('/settings/presets')
    await userEvent.click(screen.getByRole('button', { name: 'ビジネス' }))

    expect(screen.getByRole('button', { name: 'ビジネス' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '一般' })).toHaveAttribute('aria-pressed', 'false')
    expect(loadPresetState().activeId).toBe(BUSINESS.id)

    await userEvent.click(screen.getByRole('button', { name: '設定に戻る' }))
    expect(screen.getByRole('button', { name: /プリセット管理/ })).toHaveTextContent('ビジネス')
  })

  it('edits a built-in preset\'s conditions and can reset them', async () => {
    await renderAt('/settings/presets')
    await userEvent.click(screen.getByRole('button', { name: '「ビジネス」を編集' }))

    expect(screen.getByRole('heading', { level: 1, name: 'プリセットを編集' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '名前' })).not.toBeInTheDocument() // built-in names are fixed
    const conditions = screen.getByRole('textbox', { name: '条件' })
    expect(conditions).toHaveValue(BUSINESS.conditions)
    expect(screen.getByRole('button', { name: 'デフォルトに戻す' })).toBeDisabled()

    await userEvent.clear(conditions)
    await userEvent.type(conditions, '条件：メールだけ')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    const business = screen.getByRole('button', { name: 'ビジネス' }).closest('li')!
    expect(within(business).getByText('変更済み')).toBeInTheDocument()
    expect(within(business).getByText('条件：メールだけ')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '「ビジネス」を編集' }))
    await userEvent.click(screen.getByRole('button', { name: 'デフォルトに戻す' }))
    await userEvent.click(screen.getByRole('button', { name: 'リセット' }))
    expect(screen.getByRole('textbox', { name: '条件' })).toHaveValue(BUSINESS.conditions)
    expect(loadPresetState().builtInOverrides).toEqual({})
  })

  it('adds a custom preset, and needs a name and conditions to save', async () => {
    await renderAt('/settings/presets')
    await userEvent.click(screen.getByRole('button', { name: 'プリセットを追加' }))

    expect(screen.getByRole('heading', { level: 1, name: '新しいプリセット' })).toBeInTheDocument()
    const save = screen.getByRole('button', { name: '保存' })
    expect(save).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox', { name: '名前' }), 'IT')
    expect(save).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox', { name: '条件' }), '条件：IT の現場で使う例文')
    await userEvent.click(save)

    const row = screen.getByRole('button', { name: 'IT' }).closest('li')!
    expect(within(row).queryByText('組み込み')).not.toBeInTheDocument()
    expect(loadPresetState().custom.map((p) => p.name)).toEqual(['IT'])
  })

  it('deletes a custom preset after confirming', async () => {
    savePresetState(addPreset(loadPresetState(), { name: 'IT', conditions: 'c' }))
    await renderAt('/settings/presets')
    expect(screen.queryByRole('button', { name: '「一般」を削除' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '「IT」を削除' }))
    expect(screen.getByRole('button', { name: 'IT' })).toBeInTheDocument() // not gone until confirmed
    await userEvent.click(screen.getByRole('button', { name: '削除する' }))

    expect(screen.queryByRole('button', { name: 'IT' })).not.toBeInTheDocument()
    expect(loadPresetState().custom).toEqual([])
  })

  it(`hides the add button at ${MAX_PRESETS} presets`, async () => {
    let state = loadPresetState()
    for (let i = 0; i < MAX_PRESETS - BUILT_IN_PRESETS.length; i++) state = addPreset(state, { name: `p${i}`, conditions: 'c' })
    savePresetState(state)
    await renderAt('/settings/presets')

    expect(screen.queryByRole('button', { name: 'プリセットを追加' })).not.toBeInTheDocument()
  })

  describe('export', () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:presets')
    beforeEach(() => {
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }))
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    })
    afterEach(() => {
      vi.restoreAllMocks()
      createObjectURL.mockClear()
    })

    it('downloads every preset as Markdown', async () => {
      await renderAt('/settings/presets')
      await userEvent.click(screen.getByRole('button', { name: 'プリセットを書き出す' }))

      expect(createObjectURL).toHaveBeenCalledTimes(1)
      const text = await createObjectURL.mock.calls[0][0].text()
      expect(text).toContain('# Prompt Presets')
      expect(text).toContain('## ビジネス (built-in)')
    })
  })
})
