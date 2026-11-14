import type { VoiceType } from '@/services/AudioService'

// Browsers do not say a voice's gender, so known local voice names are matched.
// Network voices ("Google UK English Male") say it in the name; those only
// count when no local English voice exists.
const FEMALE_NAMES = ['samantha', 'kathy', 'flo', 'shelley', 'sandy', 'grandma', 'karen', 'moira', 'tessa', 'victoria', 'allison', 'ava', 'susan', 'zoe']
const MALE_NAMES = ['alex', 'fred', 'ralph', 'albert', 'reed', 'eddy', 'grandpa', 'daniel', 'rocko', 'junior', 'rishi', 'aaron', 'tom', 'evan', 'nathan']

/** "Flo (英語(アメリカ合衆国))" -> "flo": the name before any locale suffix. */
const baseName = (name: string) => name.split(/[\s(]/)[0].toLowerCase()

const isFemaleName = (name: string) => /female/i.test(name) || FEMALE_NAMES.includes(baseName(name))
const isMaleName = (name: string) => (/male/i.test(name) && !/female/i.test(name)) || MALE_NAMES.includes(baseName(name))

/** en-US first: the utterance asks for it, so the other English variants are second choice. */
const enUsFirst = (a: SpeechSynthesisVoice, b: SpeechSynthesisVoice) => Number(b.lang === 'en-US') - Number(a.lang === 'en-US')

/**
 * Choose the English voice for a gender, or null to let the browser pick by
 * lang. Local voices come first because a network voice cannot speak offline
 * and the browser then falls back to its default voice, often Japanese.
 */
export function pickEnVoice(voices: SpeechSynthesisVoice[], type: VoiceType): SpeechSynthesisVoice | null {
  if (type === 'zundamon') return null
  const matches = type === 'male' ? isMaleName : isFemaleName
  const en = voices.filter((v) => v.lang.startsWith('en'))
  const local = en.filter((v) => v.localService)
  // With local voices present, an unmatched gender is the browser's call, never a network voice.
  const pool = local.length > 0 ? local : en
  return pool.filter((v) => matches(v.name)).sort(enUsFirst)[0] ?? null
}
