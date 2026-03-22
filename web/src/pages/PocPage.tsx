import { useState, useCallback } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import WebSpeechTab from './poc/WebSpeechTab'
import IndexedDbTab from './poc/IndexedDbTab'
import VoicevoxTab from './poc/VoicevoxTab'
import SummaryTab from './poc/SummaryTab'

export default function PocPage() {
  const [results, setResults] = useState<Record<string, boolean>>({})

  const onResult = useCallback((key: string, value: boolean) => {
    setResults((prev) => ({ ...prev, [key]: value }))
  }, [])

  return (
    <div className="min-h-screen bg-[var(--ios-grouped-bg)]">
      <header className="bg-[var(--ios-blue)] text-white px-6 py-4">
        <h1 className="text-lg font-semibold">EnglishLearnApp Web — Phase 0 PoC</h1>
        <p className="text-sm text-white/70 mt-0.5">
          Validates: Web Speech API · IndexedDB · VOICEVOX CORS
        </p>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4">
        <Tabs defaultValue="speech">
          <TabsList className="w-full grid grid-cols-4 mb-4">
            <TabsTrigger value="speech">1. Speech</TabsTrigger>
            <TabsTrigger value="idb">2. IDB</TabsTrigger>
            <TabsTrigger value="voicevox">3. VOICEVOX</TabsTrigger>
            <TabsTrigger value="summary">4. Summary</TabsTrigger>
          </TabsList>
          <TabsContent value="speech">
            <WebSpeechTab onResult={onResult} />
          </TabsContent>
          <TabsContent value="idb">
            <IndexedDbTab onResult={onResult} />
          </TabsContent>
          <TabsContent value="voicevox">
            <VoicevoxTab onResult={onResult} />
          </TabsContent>
          <TabsContent value="summary">
            <SummaryTab results={results} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
