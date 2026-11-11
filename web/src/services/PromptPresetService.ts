/**
 * PromptPresetService — named sets of conditions appended to the
 * sentence-generation prompt. A port of the iOS PromptPreset model and the
 * preset management in SettingsManager.
 *
 * Built-in presets are fixed in code; only their conditions can be edited,
 * stored as overrides. Custom presets are stored whole. Everything persists
 * to localStorage. The functions are pure: they take a state and return a
 * new one, and the caller saves it.
 */
import { newId } from '@/lib/id'

export interface PromptPreset {
  id: string
  name: string
  conditions: string
  isBuiltIn: boolean
}

export interface PresetState {
  custom: PromptPreset[]
  /** Edited conditions of built-in presets, keyed by preset id. */
  builtInOverrides: Record<string, string>
  activeId: string
}

/** Built-in plus custom, as on iOS. */
export const MAX_PRESETS = 10

const STORAGE_KEY = 'english_learn_app_prompt_presets'

/** The five iOS built-ins. The ids are shared with iOS and must never change. */
export const BUILT_IN_PRESETS: readonly PromptPreset[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: '一般',
    conditions: `条件：
- 日常会話、ビジネス、学習など多様なシーンの例文を含めてください
- カテゴリは「日常会話」「ビジネス」「学習・教育」「趣味・娯楽」「旅行」などから適切なものを選んでください
- 自然で実用的な例文にしてください
- 日本語訳は自然な日本語にしてください`,
    isBuiltIn: true,
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'ビジネス',
    conditions: `条件：
- ビジネスシーンで使える例文を生成してください
- カテゴリは「会議」「メール」「プレゼン」「交渉」「報告」などから適切なものを選んでください
- フォーマルで丁寧な表現を使ってください
- 日本語訳は自然なビジネス日本語にしてください`,
    isBuiltIn: true,
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    name: '旅行',
    conditions: `条件：
- 旅行シーンで使える例文を生成してください
- カテゴリは「空港」「ホテル」「レストラン」「観光」「交通」などから適切なものを選んでください
- 実際に旅行先で使える実用的な表現を使ってください
- 日本語訳は自然な日本語にしてください`,
    isBuiltIn: true,
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    name: '学術',
    conditions: `条件：
- 学術・教育シーンで使える例文を生成してください
- カテゴリは「論文」「講義」「研究」「議論」「発表」などから適切なものを選んでください
- アカデミックな文体で書いてください
- 日本語訳は自然な学術日本語にしてください`,
    isBuiltIn: true,
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    name: 'カジュアル',
    conditions: `条件：
- 友人や家族との日常会話で使える例文を生成してください
- カテゴリは「友人との会話」「SNS」「趣味」「娯楽」「食事」などから適切なものを選んでください
- くだけた自然な表現を使ってください
- 日本語訳は自然な口語日本語にしてください`,
    isBuiltIn: true,
  },
]

export const GENERAL_PRESET = BUILT_IN_PRESETS[0]

const builtInById = new Map(BUILT_IN_PRESETS.map((p) => [p.id, p]))

const isText = (v: unknown): v is string => typeof v === 'string'
const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key)

function defaultState(): PresetState {
  return { custom: [], builtInOverrides: {}, activeId: GENERAL_PRESET.id }
}

/** Reads the saved presets, keeping only well-formed entries. */
export function loadPresetState(): PresetState {
  let parsed: unknown
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    parsed = JSON.parse(raw)
  } catch {
    return defaultState()
  }
  const fields = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>

  const custom = (Array.isArray(fields.custom) ? fields.custom : [])
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    .filter((p) => isText(p.id) && isText(p.name) && isText(p.conditions) && !builtInById.has(p.id))
    .map((p) => ({ id: p.id as string, name: p.name as string, conditions: p.conditions as string, isBuiltIn: false }))
    .slice(0, MAX_PRESETS - BUILT_IN_PRESETS.length)

  const rawOverrides = (typeof fields.builtInOverrides === 'object' && fields.builtInOverrides !== null
    ? fields.builtInOverrides : {}) as Record<string, unknown>
  const builtInOverrides = Object.fromEntries(
    Object.entries(rawOverrides).filter(([id, conditions]) => builtInById.has(id) && isText(conditions)),
  ) as Record<string, string>

  const state: PresetState = { custom, builtInOverrides, activeId: GENERAL_PRESET.id }
  const activeId = isText(fields.activeId) ? fields.activeId : ''
  if (allPresets(state).some((p) => p.id === activeId)) state.activeId = activeId
  return state
}

export function savePresetState(state: PresetState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

/** Built-ins (with any edits applied) first, then custom presets. */
export function allPresets(state: PresetState): PromptPreset[] {
  const builtIns = BUILT_IN_PRESETS.map((p) =>
    hasOwn(state.builtInOverrides, p.id) ? { ...p, conditions: state.builtInOverrides[p.id] } : p,
  )
  return [...builtIns, ...state.custom]
}

/** The active preset, falling back to 一般. */
export function activePreset(state: PresetState): PromptPreset {
  return findPreset(state, state.activeId) ?? GENERAL_PRESET
}

export function findPreset(state: PresetState, id: string): PromptPreset | undefined {
  return allPresets(state).find((p) => p.id === id)
}

export function isPresetModified(state: PresetState, id: string): boolean {
  return hasOwn(state.builtInOverrides, id)
}

export function canAddPreset(state: PresetState): boolean {
  return allPresets(state).length < MAX_PRESETS
}

/** Adds a custom preset; does nothing once MAX_PRESETS is reached. */
export function addPreset(
  state: PresetState,
  { name, conditions }: { name: string; conditions: string },
  id: string = newId(),
): PresetState {
  if (!canAddPreset(state)) return state
  return { ...state, custom: [...state.custom, { id, name, conditions, isBuiltIn: false }] }
}

/** Updates a preset. A built-in keeps its name; its text is stored only while it differs from the original. */
export function updatePreset(state: PresetState, preset: PromptPreset): PresetState {
  const original = builtInById.get(preset.id)
  if (original) {
    const builtInOverrides = { ...state.builtInOverrides }
    if (preset.conditions === original.conditions) delete builtInOverrides[preset.id]
    else builtInOverrides[preset.id] = preset.conditions
    return { ...state, builtInOverrides }
  }
  return {
    ...state,
    custom: state.custom.map((p) => (p.id === preset.id ? { ...p, name: preset.name, conditions: preset.conditions } : p)),
  }
}

/** Restores a built-in preset's original conditions. */
export function resetPreset(state: PresetState, id: string): PresetState {
  const original = builtInById.get(id)
  return original ? updatePreset(state, original) : state
}

/** Deletes a custom preset; built-ins cannot be deleted. Falls back to 一般 if it was active. */
export function deletePreset(state: PresetState, id: string): PresetState {
  if (builtInById.has(id)) return state
  return {
    ...state,
    custom: state.custom.filter((p) => p.id !== id),
    activeId: state.activeId === id ? GENERAL_PRESET.id : state.activeId,
  }
}

export function setActivePreset(state: PresetState, id: string): PresetState {
  return findPreset(state, id) ? { ...state, activeId: id } : state
}

/** Every preset as Markdown, in the same layout as the iOS export. */
export function exportMarkdown(state: PresetState): string {
  const lines = ['# Prompt Presets', '']
  for (const preset of allPresets(state)) {
    lines.push(preset.isBuiltIn ? `## ${preset.name} (built-in)` : `## ${preset.name}`, '', preset.conditions, '', '---', '')
  }
  return lines.join('\n')
}
