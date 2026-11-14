import { describe, expect, it } from 'vitest'
import { pickEnVoice } from '@/lib/enVoice'

type V = Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'localService'>
const v = (name: string, lang = 'en-US', localService = true): SpeechSynthesisVoice =>
  ({ name, lang, localService }) as V as SpeechSynthesisVoice

const googleMale = v('Google UK English Male', 'en-GB', false)
const googleFemale = v('Google UK English Female', 'en-GB', false)
const googleUs = v('Google US English', 'en-US', false)
const samantha = v('Samantha')
const reed = v('Reed (英語(アメリカ合衆国))')
const albert = v('Albert')
const fred = v('Fred')
const novelty = v('Bad News')
const japanese = v('Kyoko', 'ja-JP')

describe('pickEnVoice', () => {
  describe('offline-safe (local voices first)', () => {
    const voices = [googleMale, googleFemale, googleUs, albert, novelty, fred, reed, samantha, japanese]

    it('picks a known local female voice over a network one', () => {
      expect(pickEnVoice(voices, 'female')).toBe(samantha)
      expect(pickEnVoice(voices, 'default')).toBe(samantha)
    })

    it('picks a known local male voice over a network one', () => {
      expect(pickEnVoice(voices, 'male')).toBe(reed)
    })

    it('matches a voice whose name carries a locale suffix', () => {
      const flo = v('Flo (英語(アメリカ合衆国))')
      expect(pickEnVoice([googleFemale, flo], 'female')).toBe(flo)
    })

    it('prefers the better sounding name over list order', () => {
      expect(pickEnVoice([albert, fred, reed], 'male')).toBe(reed)
      expect(pickEnVoice([v('Flo'), v('Karen', 'en-AU'), samantha], 'female')).toBe(samantha)
    })

    it('never picks the old synthesizer voices; the browser default is used instead', () => {
      expect(pickEnVoice([albert, fred, v('Ralph'), v('Junior'), v('Kathy')], 'male')).toBeNull()
      expect(pickEnVoice([albert, fred, v('Ralph'), v('Junior'), v('Kathy')], 'female')).toBeNull()
    })

    it('prefers en-US when the same name exists in several variants', () => {
      const eddyGb = v('Eddy', 'en-GB')
      const eddyUs = v('Eddy')
      expect(pickEnVoice([eddyGb, eddyUs], 'male')).toBe(eddyUs)
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
