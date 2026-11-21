import { describe, it, expect, beforeEach } from 'vitest'
import { loadSettings, saveSettings } from '@/services/SettingsService'

const KEY = 'english_learn_app_settings'
const store = (value: object) => localStorage.setItem(KEY, JSON.stringify(value))
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? '{}')

beforeEach(() => localStorage.clear())

describe('voice defaults', () => {
  it('uses the local voice for both languages on a first visit', () => {
    const s = loadSettings()
    expect(s.enVoice).toBe('kokoro')
    expect(s.jaVoice).toBe('kokoro')
  })

  it('moves settings saved with the old defaults (female / zundamon) to the local voice', () => {
    store({ enVoice: 'female', jaVoice: 'zundamon', intervalSec: 2 })
    const s = loadSettings()
    expect(s.enVoice).toBe('kokoro')
    expect(s.jaVoice).toBe('kokoro')
    expect(s.intervalSec).toBe(2)
  })

  it('keeps an older choice that was not the default', () => {
    store({ enVoice: 'male', jaVoice: 'default' })
    const s = loadSettings()
    expect(s.enVoice).toBe('male')
    expect(s.jaVoice).toBe('default')
  })

  it('keeps female or zundamon picked after the move', () => {
    store({ enVoice: 'female', jaVoice: 'zundamon' })
    saveSettings({ enVoice: 'female', jaVoice: 'zundamon' })
    expect(stored().voiceDefaultsVersion).toBe(2)
    const s = loadSettings()
    expect(s.enVoice).toBe('female')
    expect(s.jaVoice).toBe('zundamon')
  })
})
