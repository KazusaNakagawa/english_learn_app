/**
 * SettingsService — persists user settings to localStorage.
 *
 * Security note: API keys are stored in sessionStorage (cleared on tab close)
 * rather than localStorage to reduce exposure to browser profile access.
 * Other settings remain in localStorage for persistence across sessions.
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

const SETTINGS_KEY = 'english_learn_app_settings'
const API_KEYS_KEY  = 'english_learn_app_api_keys'

const INTERVAL_MIN = 0.5
const INTERVAL_MAX = 5.0

function loadApiKeys(): Pick<AppSettings, 'voicevoxApiKey' | 'openAIKey'> {
  try {
    const raw = sessionStorage.getItem(API_KEYS_KEY)
    if (!raw) return { voicevoxApiKey: '', openAIKey: '' }
    const parsed = JSON.parse(raw)
    return {
      voicevoxApiKey: typeof parsed.voicevoxApiKey === 'string' ? parsed.voicevoxApiKey : '',
      openAIKey:      typeof parsed.openAIKey      === 'string' ? parsed.openAIKey      : '',
    }
  } catch {
    return { voicevoxApiKey: '', openAIKey: '' }
  }
}

function saveApiKeys(keys: Partial<Pick<AppSettings, 'voicevoxApiKey' | 'openAIKey'>>): void {
  const current = loadApiKeys()
  sessionStorage.setItem(API_KEYS_KEY, JSON.stringify({ ...current, ...keys }))
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    const parsed: Partial<AppSettings> = raw ? JSON.parse(raw) : {}
    const rawInterval = Number(parsed.intervalSec)
    const intervalSec = isFinite(rawInterval)
      ? Math.min(INTERVAL_MAX, Math.max(INTERVAL_MIN, rawInterval))
      : DEFAULTS.intervalSec
    return { ...DEFAULTS, ...parsed, intervalSec, ...loadApiKeys() }
  } catch {
    return { ...DEFAULTS, ...loadApiKeys() }
  }
}

export function saveSettings(settings: Partial<AppSettings>): void {
  const { voicevoxApiKey, openAIKey, ...otherSettings } = settings

  if (voicevoxApiKey !== undefined || openAIKey !== undefined) {
    saveApiKeys({ ...(voicevoxApiKey !== undefined ? { voicevoxApiKey } : {}), ...(openAIKey !== undefined ? { openAIKey } : {}) })
  }

  if (Object.keys(otherSettings).length > 0) {
    const current = loadSettings()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { voicevoxApiKey: _vv, openAIKey: _oa, ...persistedSettings } = current
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...persistedSettings, ...otherSettings }))
  }
}
