import { useState, useCallback } from 'react'
import WebSpeechTab from './poc/WebSpeechTab'
import IndexedDbTab from './poc/IndexedDbTab'
import VoicevoxTab from './poc/VoicevoxTab'
import SummaryTab from './poc/SummaryTab'

const TABS = [
  { id: 'speech', label: '1. Web Speech API' },
  { id: 'idb', label: '2. IndexedDB' },
  { id: 'voicevox', label: '3. VOICEVOX / CORS' },
  { id: 'summary', label: '4. Summary' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function PocPage() {
  const [active, setActive] = useState<TabId>('speech')
  const [results, setResults] = useState<Record<string, boolean>>({})

  const onResult = useCallback((key: string, value: boolean) => {
    setResults((prev) => ({ ...prev, [key]: value }))
  }, [])

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-600 text-white px-6 py-4">
        <h1 className="text-lg font-semibold">EnglishLearnApp Web — Phase 0 PoC</h1>
        <p className="text-sm text-blue-200 mt-0.5">
          Validates: Web Speech API · IndexedDB · VOICEVOX CORS
        </p>
      </header>

      <nav className="bg-white border-b border-blue-200 flex">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              active === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="max-w-2xl mx-auto p-4">
        {active === 'speech' && <WebSpeechTab onResult={onResult} />}
        {active === 'idb' && <IndexedDbTab onResult={onResult} />}
        {active === 'voicevox' && <VoicevoxTab onResult={onResult} />}
        {active === 'summary' && <SummaryTab results={results} />}
      </main>
    </div>
  )
}
