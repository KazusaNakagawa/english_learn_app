import type { VoiceType } from '@/services/AudioService'

// Browsers do not say a voice's gender, so known local voice names are matched,
// best sounding first. The old macOS synthesizer voices (Albert, Fred, Ralph,
// Junior, Kathy) and the novelty ones are left out on purpose: they sound
// robotic or hoarse, so unmatched means the browser's own default voice.
// Daniel is left out too: macOS lists it (en-GB) but reads in the Japanese
// default voice on the machine this was checked on (Reed en-US was the one that sounded right).
// Network voices ("Google UK English Male") say the gender in the name; those
// only count when no local English voice exists.
const FEMALE_NAMES = ['samantha', 'ava', 'allison', 'susan', 'zoe', 'victoria', 'karen', 'moira', 'tessa', 'flo', 'shelley', 'sandy', 'grandma']
const MALE_NAMES = ['reed', 'eddy', 'rocko', 'grandpa', 'alex', 'aaron', 'evan', 'nathan', 'tom']

/** "Flo (英語(アメリカ合衆国))" -> "flo": the name before any locale suffix. */
const baseName = (name: string) => name.split(/[\s(]/)[0].toLowerCase()

/** Lower is better; Infinity when the voice is not one of the gender's known names. */
function rank(voice: SpeechSynthesisVoice, type: VoiceType): number {
  const names = type === 'male' ? MALE_NAMES : FEMALE_NAMES
  const known = names.indexOf(baseName(voice.name))
  if (known >= 0) return known
  // Network voices state the gender in the name.
  const female = /female/i.test(voice.name)
  const named = type === 'male' ? /male/i.test(voice.name) && !female : female
  return named ? names.length : Infinity
}

/**
 * Choose the English voice for a gender, or null to let the browser pick by
 * lang. Local voices come first because a network voice cannot speak offline
 * and the browser then falls back to its default voice, often Japanese.
 */
export function pickEnVoice(voices: SpeechSynthesisVoice[], type: VoiceType): SpeechSynthesisVoice | null {
  if (type === 'zundamon') return null
  const en = voices.filter((v) => v.lang.startsWith('en'))
  const local = en.filter((v) => v.localService)
  // With local voices present, an unmatched gender is the browser's call, never a network voice.
  const pool = local.length > 0 ? local : en
  const ranked = pool
    .map((voice) => ({ voice, score: rank(voice, type) }))
    .filter(({ score }) => score !== Infinity)
    // Best name first; among the same name (e.g. Eddy en-US / en-GB) en-US, which the utterance asks for.
    .sort((a, b) => a.score - b.score || Number(b.voice.lang === 'en-US') - Number(a.voice.lang === 'en-US'))
  return ranked[0]?.voice ?? null
}
