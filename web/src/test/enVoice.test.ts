import { describe, expect, it } from 'vitest'
import { pickEnVoice } from '@/lib/enVoice'

type V = Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'localService'>
const v = (name: string, lang = 'en-US', localService = true): SpeechSynthesisVoice =>
  ({ name, lang, localService }) as V as SpeechSynthesisVoice

const googleMale = v('Google UK English Male', 'en-GB', false)
const googleFemale = v('Google UK English Female', 'en-GB', false)
const googleUs = v('Google US English', 'en-US', false)
const samantha = v('Samantha')
const fred = v('Fred')
const novelty = v('Bad News')
const japanese = v('Kyoko', 'ja-JP')

describe('pickEnVoice', () => {
  describe('offline-safe (local voices first)', () => {
    const voices = [googleMale, googleFemale, googleUs, novelty, fred, samantha, japanese]

    it('picks a known local female voice over a network one', () => {
      expect(pickEnVoice(voices, 'female')).toBe(samantha)
      expect(pickEnVoice(voices, 'default')).toBe(samantha)
    })

    it('picks a known local male voice over a network one', () => {
      expect(pickEnVoice(voices, 'male')).toBe(fred)
    })

    it('matches a voice whose name carries a locale suffix', () => {
      const flo = v('Flo (英語(アメリカ合衆国))')
      expect(pickEnVoice([googleFemale, flo], 'female')).toBe(flo)
    })

    it('prefers en-US among the matching local voices', () => {
      const karen = v('Karen', 'en-AU')
      expect(pickEnVoice([karen, samantha], 'female')).toBe(samantha)
    })

    it('never returns a network voice while a local English voice exists', () => {
      // No known name: leave the choice to the browser (lang en-US) instead of a network voice.
      expect(pickEnVoice([googleMale, googleFemale, novelty], 'male')).toBeNull()
    })
  })

  describe('no local English voice', () => {
    it('falls back to the network voice named for the gender', () => {
      expect(pickEnVoice([googleMale, googleFemale, japanese], 'male')).toBe(googleMale)
      expect(pickEnVoice([googleMale, googleFemale, japanese], 'female')).toBe(googleFemale)
      expect(pickEnVoice([googleMale, googleFemale], 'default')).toBe(googleFemale)
    })

    it('returns null when no network voice matches the gender', () => {
      expect(pickEnVoice([googleUs], 'male')).toBeNull()
    })
  })

  describe('boundaries', () => {
    it('returns null for an empty list', () => {
      expect(pickEnVoice([], 'female')).toBeNull()
    })

    it('returns null when there is no English voice at all', () => {
      expect(pickEnVoice([japanese], 'female')).toBeNull()
    })

    it('returns null for zundamon', () => {
      expect(pickEnVoice([samantha], 'zundamon')).toBeNull()
    })

    it('does not treat "female" as a male name', () => {
      expect(pickEnVoice([v('Some Female Voice', 'en-US', true)], 'male')).toBeNull()
    })
  })
})
