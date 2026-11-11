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
  /** Empty means the build-time endpoint. Resolve with resolveVoicevox before use. */
  voicevoxEndpoint: string
  voicevoxApiKey: string
  /** The origin voicevoxApiKey was typed for; it is sent nowhere else. Empty means the build-time endpoint. */
  voicevoxApiKeyOrigin: string
  openAIKey: string
  openAIModel: string
  /** Who generates sentences: the Claude Code CLI through the local API, or OpenAI with a key. */
  aiProvider: 'claude-code' | 'openai'
  claudeModel: 'sonnet' | 'haiku' | 'opus'
  playPattern: 'bilingual' | 'en-only'
  intervalSec: number
}

const DEFAULTS: AppSettings = {
  enVoice: 'female',
  jaVoice: 'zundamon',
  voicevoxStyle: '22',
  voicevoxEndpoint: '',
  voicevoxApiKey: '',
  voicevoxApiKeyOrigin: '',
  openAIKey: '',
  openAIModel: 'gpt-4o-mini',
  // No key to enter: the path a first-time user can take without any setup in the app.
  aiProvider: 'claude-code',
  claudeModel: 'sonnet',
  playPattern: 'bilingual',
  intervalSec: 1.5,
}

const SETTINGS_KEY = 'english_learn_app_settings'
const API_KEYS_KEY  = 'english_learn_app_api_keys'

const INTERVAL_MIN = 0.5
const INTERVAL_MAX = 5.0

type ApiKeys = Pick<AppSettings, 'voicevoxApiKey' | 'voicevoxApiKeyOrigin' | 'openAIKey'>
const API_KEY_FIELDS = ['voicevoxApiKey', 'voicevoxApiKeyOrigin', 'openAIKey'] as const
const NO_API_KEYS: ApiKeys = { voicevoxApiKey: '', voicevoxApiKeyOrigin: '', openAIKey: '' }

function loadApiKeys(): ApiKeys {
  try {
    const raw = sessionStorage.getItem(API_KEYS_KEY)
    if (!raw) return { ...NO_API_KEYS }
    const parsed = JSON.parse(raw)
    const keys = { ...NO_API_KEYS }
    for (const field of API_KEY_FIELDS) if (typeof parsed[field] === 'string') keys[field] = parsed[field]
    return keys
  } catch {
    return { ...NO_API_KEYS }
  }
}

function saveApiKeys(keys: Partial<ApiKeys>): void {
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
    const voicevoxEndpoint = typeof parsed.voicevoxEndpoint === 'string' ? parsed.voicevoxEndpoint : DEFAULTS.voicevoxEndpoint
    const apiKeys = loadApiKeys()
    // Someone who set up OpenAI before this setting existed keeps OpenAI.
    const aiProvider = parsed.aiProvider === 'openai' || parsed.aiProvider === 'claude-code'
      ? parsed.aiProvider
      : apiKeys.openAIKey ? 'openai' : 'claude-code'
    const claudeModel = parsed.claudeModel === 'haiku' || parsed.claudeModel === 'opus' ? parsed.claudeModel : 'sonnet'
    return { ...DEFAULTS, ...parsed, intervalSec, voicevoxEndpoint, aiProvider, claudeModel, ...apiKeys }
  } catch {
    return { ...DEFAULTS, ...loadApiKeys() }
  }
}

export function saveSettings(settings: Partial<AppSettings>): void {
  const { voicevoxApiKey, voicevoxApiKeyOrigin, openAIKey, ...otherSettings } = settings
  const keys = Object.fromEntries(
    Object.entries({ voicevoxApiKey, voicevoxApiKeyOrigin, openAIKey }).filter(([, value]) => value !== undefined),
  ) as Partial<ApiKeys>
  if (Object.keys(keys).length > 0) saveApiKeys(keys)

  if (Object.keys(otherSettings).length > 0) {
    const current = loadSettings()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { voicevoxApiKey: _vv, voicevoxApiKeyOrigin: _vo, openAIKey: _oa, ...persistedSettings } = current
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...persistedSettings, ...otherSettings }))
  }
}
