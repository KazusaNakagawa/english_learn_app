/**
 * SettingsService — persists user settings to localStorage.
 */

export interface AppSettings {
  enVoice: 'default' | 'female' | 'male' | 'zundamon'
  jaVoice: 'zundamon' | 'default'
  voicevoxStyle: string   // speaker ID
  voicevoxApiKey: string
  openAIKey: string
  openAIModel: string
  playPattern: 'bilingual' | 'en-only'
  intervalSec: number
}

const DEFAULTS: AppSettings = {
  enVoice: 'female',
  jaVoice: 'zundamon',
  voicevoxStyle: '22',
  voicevoxApiKey: '',
  openAIKey: '',
  openAIModel: 'gpt-4o-mini',
  playPattern: 'bilingual',
  intervalSec: 1.5,
}

const KEY = 'english_learn_app_settings'

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings: Partial<AppSettings>): void {
  const current = loadSettings()
  localStorage.setItem(KEY, JSON.stringify({ ...current, ...settings }))
}
