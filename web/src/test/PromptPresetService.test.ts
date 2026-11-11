import { describe, it, expect, beforeEach } from 'vitest'
import {
  activePreset,
  addPreset,
  allPresets,
  BUILT_IN_PRESETS,
  deletePreset,
  exportMarkdown,
  GENERAL_PRESET,
  isPresetModified,
  loadPresetState,
  MAX_PRESETS,
  resetPreset,
  savePresetState,
  setActivePreset,
  updatePreset,
  type PresetState,
} from '@/services/PromptPresetService'

const STORAGE_KEY = 'english_learn_app_prompt_presets'
const BUSINESS = BUILT_IN_PRESETS[1]

describe('PromptPresetService', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('built-in presets', () => {
    it('ships the five iOS presets with their fixed ids', () => {
      expect(BUILT_IN_PRESETS.map((p) => [p.id, p.name])).toEqual([
        ['00000000-0000-0000-0000-000000000001', '一般'],
        ['00000000-0000-0000-0000-000000000002', 'ビジネス'],
        ['00000000-0000-0000-0000-000000000003', '旅行'],
        ['00000000-0000-0000-0000-000000000004', '学術'],
        ['00000000-0000-0000-0000-000000000005', 'カジュアル'],
      ])
      expect(BUILT_IN_PRESETS.every((p) => p.isBuiltIn && p.conditions.startsWith('条件：'))).toBe(true)
    })
  })

  describe('loading', () => {
    it('starts with the built-ins and 一般 active', () => {
      const state = loadPresetState()
      expect(allPresets(state)).toEqual(BUILT_IN_PRESETS)
      expect(activePreset(state)).toEqual(GENERAL_PRESET)
    })

    it('round-trips through localStorage', () => {
      let state = addPreset(loadPresetState(), { name: 'mine', conditions: '条件：自由' })
      state = setActivePreset(state, state.custom[0].id)
      savePresetState(state)
      expect(loadPresetState()).toEqual(state)
    })

    it('falls back to the defaults when the stored value is broken', () => {
      localStorage.setItem(STORAGE_KEY, '{not json')
      expect(loadPresetState()).toEqual({ custom: [], builtInOverrides: {}, activeId: GENERAL_PRESET.id })
    })

    it('drops malformed custom entries and an unknown active id', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        custom: [{ id: 'a', name: 'ok', conditions: 'x' }, { id: 'b', name: 3 }, null],
        builtInOverrides: { [BUSINESS.id]: 'edited', other: 'ignored', [GENERAL_PRESET.id]: 5 },
        activeId: 'missing',
      }))
      const state = loadPresetState()
      expect(state.custom).toEqual([{ id: 'a', name: 'ok', conditions: 'x', isBuiltIn: false }])
      expect(state.builtInOverrides).toEqual({ [BUSINESS.id]: 'edited' })
      expect(activePreset(state)).toEqual(GENERAL_PRESET)
    })
  })

  describe('editing', () => {
    it('adds a custom preset after the built-ins', () => {
      const state = addPreset(loadPresetState(), { name: 'mine', conditions: '条件：自由' }, 'ID-1')
      expect(allPresets(state)[allPresets(state).length - 1]).toEqual({ id: 'ID-1', name: 'mine', conditions: '条件：自由', isBuiltIn: false })
    })

    it(`stops adding at ${MAX_PRESETS} presets in total`, () => {
      let state = loadPresetState()
      for (let i = 0; i < 8; i++) state = addPreset(state, { name: `p${i}`, conditions: 'c' })
      expect(allPresets(state)).toHaveLength(MAX_PRESETS)
      expect(state.custom).toHaveLength(MAX_PRESETS - BUILT_IN_PRESETS.length)
    })

    it('edits a built-in preset\'s conditions but keeps its name', () => {
      const state = updatePreset(loadPresetState(), { ...BUSINESS, name: 'renamed', conditions: 'edited' })
      const business = allPresets(state)[1]
      expect(business).toEqual({ ...BUSINESS, conditions: 'edited' })
      expect(isPresetModified(state, BUSINESS.id)).toBe(true)
    })

    it('forgets the override when a built-in is edited back to its original text', () => {
      let state = updatePreset(loadPresetState(), { ...BUSINESS, conditions: 'edited' })
      state = updatePreset(state, BUSINESS)
      expect(state.builtInOverrides).toEqual({})
      expect(isPresetModified(state, BUSINESS.id)).toBe(false)
    })

    it('resets a built-in preset to its original conditions', () => {
      let state = updatePreset(loadPresetState(), { ...BUSINESS, conditions: 'edited' })
      state = resetPreset(state, BUSINESS.id)
      expect(allPresets(state)[1]).toEqual(BUSINESS)
    })

    it('edits a custom preset\'s name and conditions', () => {
      let state = addPreset(loadPresetState(), { name: 'mine', conditions: 'old' }, 'ID-1')
      state = updatePreset(state, { id: 'ID-1', name: 'renamed', conditions: 'new', isBuiltIn: false })
      expect(state.custom).toEqual([{ id: 'ID-1', name: 'renamed', conditions: 'new', isBuiltIn: false }])
    })

    it('deletes a custom preset and falls back to 一般 when it was active', () => {
      let state = addPreset(loadPresetState(), { name: 'mine', conditions: 'c' }, 'ID-1')
      state = setActivePreset(state, 'ID-1')
      state = deletePreset(state, 'ID-1')
      expect(state.custom).toEqual([])
      expect(state.activeId).toBe(GENERAL_PRESET.id)
    })

    it('never deletes a built-in preset', () => {
      const state = deletePreset(loadPresetState(), BUSINESS.id)
      expect(allPresets(state)).toEqual(BUILT_IN_PRESETS)
    })

    it('uses the edited conditions of the active built-in', () => {
      let state: PresetState = updatePreset(loadPresetState(), { ...BUSINESS, conditions: 'edited' })
      state = setActivePreset(state, BUSINESS.id)
      expect(activePreset(state).conditions).toBe('edited')
    })
  })

  it('exports every preset as Markdown, marking the built-ins', () => {
    const state = addPreset(loadPresetState(), { name: 'mine', conditions: '条件：自由' })
    const md = exportMarkdown(state)
    expect(md.startsWith('# Prompt Presets\n')).toBe(true)
    expect(md).toContain('## 一般 (built-in)\n')
    expect(md).toContain('## mine\n\n条件：自由\n')
  })
})
