import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

type SupportStatus = { tts: boolean; stt: boolean; isSafari: boolean }
type JudgeLevel = 'PERFECT' | 'CLOSE' | 'RETRY' | null

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [
    i,
    ...Array<number>(n).fill(0),
  ])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
}

function judge(transcript: string, target: string): JudgeLevel {
  const t = normalize(transcript)
  const g = normalize(target)
  if (t === g) return 'PERFECT'
  const dist = levenshtein(t, g)
  const similarity = 1 - dist / Math.max(t.length, g.length, 1)
  return similarity >= 0.7 ? 'CLOSE' : 'RETRY'
}

const JUDGE_STYLE: Record<NonNullable<JudgeLevel>, string> = {
  PERFECT: 'bg-green-100 text-green-800',
  CLOSE: 'bg-yellow-100 text-yellow-800',
  RETRY: 'bg-red-100 text-red-800',
}
const JUDGE_LABEL: Record<NonNullable<JudgeLevel>, string> = {
  PERFECT: '完璧！',
  CLOSE: '惜しい！',
  RETRY: 'もう一度練習しましょう',
}

export default function WebSpeechTab({
  onResult,
}: {
  onResult: (key: string, value: boolean) => void
}) {
  const [support, setSupport] = useState<SupportStatus | null>(null)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voiceIdx, setVoiceIdx] = useState(0)
  const [ttsText, setTtsText] = useState(
    'This is a technical validation for the English Learn App.',
  )
  const [ttsStatus, setTtsStatus] = useState('')

  const [sttStatus, setSttStatus] = useState('')
  const [sttRaw, setSttRaw] = useState('')
  const recRef = useRef<SpeechRecognition | null>(null)

  const [judgeTarget, setJudgeTarget] = useState(
    'The quick brown fox jumps over the lazy dog',
  )
  const [judgeTranscript, setJudgeTranscript] = useState(
    'the quick brown fox jumps over the lazy dog',
  )
  const [judgeResult, setJudgeResult] = useState<{
    level: JudgeLevel
    similarity: string
    dist: number
  } | null>(null)

  useEffect(() => {
    const tts = 'speechSynthesis' in window
    const stt = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    setSupport({ tts, stt, isSafari })
    onResult('tts_support', tts)
    onResult('stt_support', stt)

    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en')))
    }
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
  }, [onResult])

  function speak() {
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(ttsText)
    if (voices[voiceIdx]) utt.voice = voices[voiceIdx]
    utt.onstart = () => setTtsStatus('▶ Speaking…')
    utt.onend = () => setTtsStatus('✓ Finished')
    utt.onerror = (e) => setTtsStatus(`✗ Error: ${e.error}`)
    window.speechSynthesis.speak(utt)
  }

  function startSTT() {
    const SpeechRec = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SpeechRec) {
      setSttStatus('✗ Not supported — use Chrome or Edge')
      return
    }
    const rec = new SpeechRec()
    rec.lang = 'en-US'
    rec.interimResults = true
    rec.onstart = () => setSttStatus('🎤 Listening…')
    rec.onresult = (e) => {
      let text = ''
      for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript
      const isFinal = e.results[e.results.length - 1].isFinal
      setSttStatus((isFinal ? '✓ ' : '⋯ ') + text)
      setSttRaw(
        JSON.stringify(
          { transcript: text, isFinal, confidence: e.results[e.results.length - 1][0].confidence },
          null,
          2,
        ),
      )
    }
    rec.onerror = (e) => setSttStatus(`✗ ${e.error}`)
    rec.start()
    recRef.current = rec
  }

  function stopSTT() {
    recRef.current?.stop()
    recRef.current = null
  }

  function runJudge() {
    const level = judge(judgeTranscript, judgeTarget)
    const t = normalize(judgeTranscript)
    const g = normalize(judgeTarget)
    const dist = levenshtein(t, g)
    const similarity = (1 - dist / Math.max(t.length, g.length, 1)).toFixed(3)
    setJudgeResult({ level, similarity, dist })
  }

  return (
    <div className="space-y-3">
      {/* API Availability */}
      <div className="bg-white rounded-2xl p-4 space-y-2">
        <h3 className="font-semibold text-sm">API Availability</h3>
        {support && (
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b">
                <td className="py-2 pr-4 font-medium">speechSynthesis (TTS)</td>
                <td className="py-2">
                  <Badge variant={support.tts ? 'default' : 'destructive'} className={support.tts ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}>
                    {support.tts ? '✓ Supported' : '✗ Not supported'}
                  </Badge>
                </td>
                <td className="py-2 text-muted-foreground text-xs">All modern browsers</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-medium">SpeechRecognition (STT)</td>
                <td className="py-2">
                  <Badge variant={support.stt ? 'default' : 'destructive'} className={support.stt ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}>
                    {support.stt ? '✓ Supported' : '✗ Not supported'}
                  </Badge>
                </td>
                <td className="py-2 text-muted-foreground text-xs">Chrome / Edge only</td>
              </tr>
            </tbody>
          </table>
        )}
        {support?.isSafari && (
          <p className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded-lg">
            ⚠ Safari detected — STT will not work. Pronunciation check requires Chrome or Edge.
          </p>
        )}
      </div>

      {/* TTS */}
      <div className="bg-white rounded-2xl p-4 space-y-2">
        <h3 className="font-semibold text-sm">TTS — speechSynthesis</h3>
        <Input value={ttsText} onChange={(e) => setTtsText(e.target.value)} />
        <select
          className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white"
          value={voiceIdx}
          onChange={(e) => setVoiceIdx(Number(e.target.value))}
        >
          {voices.map((v, i) => (
            <option key={i} value={i}>
              {v.name} ({v.lang})
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button size="sm" onClick={speak} className="bg-[var(--ios-blue)] hover:bg-[var(--ios-blue)]/90">▶ Speak</Button>
          <Button size="sm" variant="outline" onClick={() => window.speechSynthesis.cancel()}>■ Stop</Button>
        </div>
        {ttsStatus && <p className="text-sm text-foreground bg-muted px-3 py-2 rounded-lg">{ttsStatus}</p>}
      </div>

      {/* STT */}
      <div className="bg-white rounded-2xl p-4 space-y-2">
        <h3 className="font-semibold text-sm">STT — SpeechRecognition (en-US)</h3>
        <p className="text-xs text-muted-foreground">Chrome / Edge only. Safari is not supported.</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={startSTT} className="bg-[var(--ios-blue)] hover:bg-[var(--ios-blue)]/90">🎤 Start</Button>
          <Button size="sm" variant="outline" onClick={stopSTT}>■ Stop</Button>
        </div>
        {sttStatus && (
          <p className="text-sm bg-muted px-3 py-2 rounded-lg whitespace-pre-wrap">{sttStatus}</p>
        )}
        {sttRaw && (
          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--ios-blue)]">Raw event</summary>
            <pre className="mt-1 bg-muted p-2 rounded-lg overflow-x-auto">{sttRaw}</pre>
          </details>
        )}
      </div>

      {/* Judge */}
      <div className="bg-white rounded-2xl p-4 space-y-2">
        <h3 className="font-semibold text-sm">Pronunciation Judgment Logic</h3>
        <label className="text-xs text-muted-foreground">Target text</label>
        <Input value={judgeTarget} onChange={(e) => setJudgeTarget(e.target.value)} />
        <label className="text-xs text-muted-foreground">Transcript (simulated)</label>
        <Input value={judgeTranscript} onChange={(e) => setJudgeTranscript(e.target.value)} />
        <Button size="sm" onClick={runJudge} className="bg-[var(--ios-blue)] hover:bg-[var(--ios-blue)]/90">Judge</Button>
        {judgeResult?.level && (
          <div className={`px-3 py-2 rounded-lg text-sm ${JUDGE_STYLE[judgeResult.level]}`}>
            <span className="font-bold">{judgeResult.level}</span> —{' '}
            {JUDGE_LABEL[judgeResult.level]}
            <span className="ml-2 text-xs opacity-70">
              similarity: {judgeResult.similarity} | distance: {judgeResult.dist}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
