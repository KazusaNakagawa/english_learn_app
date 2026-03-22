import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const BASE_URL = import.meta.env.VITE_VOICEVOX_ENDPOINT_POC ?? ''
const API_KEY = import.meta.env.VITE_VOICEVOX_API_KEY_POC ?? ''

// Matches iOS VoicevoxStyle enum (SettingsManager.swift)
const ZUNDAMON_STYLES = [
  { id: '3',  label: 'ノーマル' },
  { id: '1',  label: 'あまあま' },
  { id: '7',  label: 'ツンツン' },
  { id: '5',  label: 'セクシー' },
  { id: '22', label: 'ささやき' },
  { id: '38', label: 'ヒソヒソ' },
]

type Timing = {
  audioQueryMs: number
  synthesisMs: number
  totalMs: number
  wavSizeKB: number
}

const resultStyle: Record<string, string> = {
  ok: 'bg-green-50 text-green-800',
  err: 'bg-red-50 text-red-800',
  warn: 'bg-yellow-50 text-yellow-800',
  '': 'bg-muted text-muted-foreground',
}

export default function VoicevoxTab({
  onResult,
}: {
  onResult: (key: string, value: boolean) => void
}) {
  const [speakerId, setSpeakerId] = useState('3')
  const [text, setText] = useState('こんにちは、ずんだもんです。')
  const [corsResult, setCorsResult] = useState('')
  const [corsType, setCorsType] = useState<'ok' | 'err' | 'warn' | ''>('')
  const [vvResult, setVvResult] = useState('')
  const [vvType, setVvType] = useState<'ok' | 'err' | 'warn' | ''>('')
  const [timing, setTiming] = useState<Timing | null>(null)
  const [versionResult, setVersionResult] = useState('')
  const [versionType, setVersionType] = useState<'ok' | 'err' | ''>('')

  async function checkVersion() {
    if (!BASE_URL) { setVersionResult('⚠ VITE_VOICEVOX_ENDPOINT_POC not set in .env'); setVersionType('err'); return }
    setVersionResult('⋯ Fetching…'); setVersionType('')
    try {
      const t0 = performance.now()
      const res = await fetch(`${BASE_URL}/version`)
      const ms = Math.round(performance.now() - t0)
      const body = await res.text()
      setVersionResult(`✓ ${res.status} OK (${ms} ms)\n${body}`)
      setVersionType('ok')
    } catch (err) {
      setVersionResult(`✗ ${err}\n\nCORS may not be configured on API Gateway.`)
      setVersionType('err')
    }
  }

  async function checkCORS() {
    if (!BASE_URL) { setCorsResult('⚠ VITE_VOICEVOX_ENDPOINT_POC not set in .env'); setCorsType('warn'); return }
    setCorsResult('⋯ Sending OPTIONS preflight…'); setCorsType('')
    try {
      const res = await fetch(`${BASE_URL}/audio_query`, {
        method: 'OPTIONS',
        headers: {
          Origin: location.origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, x-api-key',
        },
      })
      const acao = res.headers.get('access-control-allow-origin')
      const acam = res.headers.get('access-control-allow-methods')
      const acah = res.headers.get('access-control-allow-headers')
      if (acao) {
        setCorsResult(
          `✓ CORS preflight succeeded (${res.status})\nAccess-Control-Allow-Origin: ${acao}\nAccess-Control-Allow-Methods: ${acam}\nAccess-Control-Allow-Headers: ${acah}`,
        )
        setCorsType('ok')
        onResult('cors_ok', true)
      } else {
        setCorsResult(`✗ No CORS headers (${res.status})\nAdd corsPreflight to CDK HttpApi.`)
        setCorsType('err')
        onResult('cors_ok', false)
      }
    } catch (err) {
      setCorsResult(`✗ Preflight blocked: ${err}\nCORS is NOT configured on API Gateway.`)
      setCorsType('err')
      onResult('cors_ok', false)
    }
  }

  async function testVoicevox() {
    if (!BASE_URL || !API_KEY) {
      setVvResult('⚠ VITE_VOICEVOX_ENDPOINT_POC / VITE_VOICEVOX_API_KEY_POC not set in .env')
      setVvType('warn')
      return
    }
    const headers = { 'Content-Type': 'application/json', 'x-api-key': API_KEY }
    setTiming(null)
    setVvResult('⋯ Step 1: POST /audio_query (cold start may take 10–30s)…'); setVvType('')
    try {
      const t0 = performance.now()
      const queryRes = await fetch(
        `${BASE_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`,
        { method: 'POST', headers },
      )
      if (!queryRes.ok) throw new Error(`audio_query failed: ${queryRes.status} ${await queryRes.text()}`)
      const queryJson = await queryRes.json()
      const t1 = performance.now()
      const audioQueryMs = Math.round(t1 - t0)

      setVvResult(`✓ Step 1 done (${audioQueryMs} ms)\n⋯ Step 2: POST /synthesis…`); setVvType('')

      const synthRes = await fetch(`${BASE_URL}/synthesis?speaker=${speakerId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(queryJson),
      })
      if (!synthRes.ok) throw new Error(`synthesis failed: ${synthRes.status}`)
      const wavBlob = await synthRes.blob()
      const t2 = performance.now()
      const synthesisMs = Math.round(t2 - t1)
      const totalMs = Math.round(t2 - t0)
      const wavSizeKB = Math.round(wavBlob.size / 1024)

      const url = URL.createObjectURL(wavBlob)
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play()

      setVvResult(`✓ WAV received and playing (${wavSizeKB} KB)`); setVvType('ok')
      setTiming({ audioQueryMs, synthesisMs, totalMs, wavSizeKB })
      onResult('voicevox_ok', true)
    } catch (err) {
      setVvResult(`✗ ${err}`); setVvType('err')
      onResult('voicevox_ok', false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Version */}
      <div className="bg-white rounded-2xl p-4 space-y-2">
        <h3 className="font-semibold text-sm">Version Endpoint (public, no auth)</h3>
        <Button size="sm" variant="outline" onClick={checkVersion}>GET /version</Button>
        {versionResult && (
          <pre className={`text-xs px-3 py-2 rounded-lg whitespace-pre-wrap ${resultStyle[versionType]}`}>
            {versionResult}
          </pre>
        )}
      </div>

      {/* CORS preflight */}
      <div className="bg-white rounded-2xl p-4 space-y-2">
        <h3 className="font-semibold text-sm">CORS Preflight Check</h3>
        <Button size="sm" variant="outline" onClick={checkCORS}>🔍 OPTIONS /audio_query</Button>
        {corsResult && (
          <pre className={`text-xs px-3 py-2 rounded-lg whitespace-pre-wrap ${resultStyle[corsType]}`}>
            {corsResult}
          </pre>
        )}
      </div>

      {/* Fetch & Play */}
      <div className="bg-white rounded-2xl p-4 space-y-2">
        <h3 className="font-semibold text-sm">End-to-end WAV Fetch &amp; Play</h3>
        <p className="text-xs text-muted-foreground">© VOICEVOX:ずんだもん</p>
        <div className="flex gap-3 items-center">
          <label className="text-xs text-muted-foreground w-16 shrink-0">スタイル</label>
          <select
            className="border rounded-lg px-2 py-1.5 text-sm bg-white flex-1"
            value={speakerId}
            onChange={(e) => setSpeakerId(e.target.value)}
          >
            {ZUNDAMON_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}（ID: {s.id}）
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 items-center">
          <label className="text-xs text-muted-foreground w-16 shrink-0">Text</label>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1"
          />
        </div>
        <Button size="sm" onClick={testVoicevox} className="bg-[var(--ios-blue)] hover:bg-[var(--ios-blue)]/90">
          ▶ Fetch &amp; Play WAV
        </Button>
        {vvResult && (
          <pre className={`text-xs px-3 py-2 rounded-lg whitespace-pre-wrap ${resultStyle[vvType]}`}>
            {vvResult}
          </pre>
        )}
        {timing && (
          <div className="grid grid-cols-4 gap-2 mt-2">
            {[
              { label: 'audio_query', value: `${timing.audioQueryMs} ms` },
              { label: 'synthesis', value: `${timing.synthesisMs} ms` },
              { label: 'total', value: `${timing.totalMs} ms` },
              { label: 'WAV size', value: `${timing.wavSizeKB} KB` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-muted rounded-lg p-2 text-center">
                <div className="text-lg font-bold">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
            {timing.totalMs > 10000 && (
              <p className="col-span-4 text-xs text-yellow-700">⚠ Cold start detected (&gt;10 s) — loading UI required</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
