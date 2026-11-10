/// <reference types="vite/client" />

// Web Speech API type declarations (not yet in lib.dom.d.ts for all environments)
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
}
interface SpeechRecognition extends EventTarget {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null
  onend: ((this: SpeechRecognition, ev: Event) => void) | null
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null
  start(): void
  stop(): void
  abort(): void
}
// A global constructor is declared with var, as lib.dom.d.ts does; let and const do not
// add a property to globalThis.
// eslint-disable-next-line no-var
declare var SpeechRecognition: {
  prototype: SpeechRecognition
  new (): SpeechRecognition
}
interface Window {
  SpeechRecognition?: typeof SpeechRecognition
  webkitSpeechRecognition?: typeof SpeechRecognition
}

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string
  readonly VITE_APP_ENV: string
  readonly VITE_VOICEVOX_ENDPOINT_POC: string
  readonly VITE_VOICEVOX_API_KEY_POC: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
