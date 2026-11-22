import { describe, it, expect, beforeEach } from 'vitest'
import { loadSettings, saveSettings } from '@/services/SettingsService'

const KEY = 'english_learn_app_settings'
const store = (value: object) => localStorage.setItem(KEY, JSON.stringify(value))
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? '{}')

beforeEach(() => localStorage.clear())

describe('voice defaults', () => {
  it('uses the local voices (English male, Japanese female) on a first visit', () => {
    const s = loadSettings()
    expect(s.enVoice).toBe('male')
    expect(s.jaVoice).toBe('female')
  })

  it('maps the short-lived kokoro value to English male and Japanese female', () => {
    store({ enVoice: 'kokoro', jaVoice: 'kokoro', voiceDefaultsVersion: 2 })
    const s = loadSettings()
    expect(s.enVoice).toBe('male')
    expect(s.jaVoice).toBe('female')
  })

  it('moves settings saved with the old defaults (English female, Japanese zundamon) to the local voices', () => {
    store({ enVoice: 'female', jaVoice: 'zundamon', intervalSec: 2 })
    const s = loadSettings()
    expect(s.enVoice).toBe('male')
    expect(s.jaVoice).toBe('female')
    expect(s.intervalSec).toBe(2)
  })

  it('keeps an older choice that was not the default', () => {
    store({ enVoice: 'zundamon', jaVoice: 'default' })
    const s = loadSettings()
    expect(s.enVoice).toBe('zundamon')
    expect(s.jaVoice).toBe('default')
  })

  it('keeps English female or Japanese zundamon picked after the move', () => {
    store({ enVoice: 'female', jaVoice: 'zundamon' })
    saveSettings({ enVoice: 'female', jaVoice: 'zundamon' })
    expect(stored().voiceDefaultsVersion).toBe(2)
    const s = loadSettings()
    expect(s.enVoice).toBe('female')
    expect(s.jaVoice).toBe('zundamon')
  })
})
