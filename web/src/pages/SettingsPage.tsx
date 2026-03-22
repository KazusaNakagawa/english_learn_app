import { useNavigate } from 'react-router'
import { ChevronRight, FlaskConical } from 'lucide-react'

export default function SettingsPage() {
  const navigate = useNavigate()

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <header className="sticky top-0 bg-[var(--ios-grouped-bg)] py-3 z-10">
        <h1 className="text-xl font-bold">設定</h1>
      </header>

      <div className="mt-4 space-y-6">
        <p className="text-muted-foreground text-sm">設定項目はここに表示されます。</p>

        {/* Developer Tools */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide px-1 mb-1">Developer Tools</p>
          <div className="bg-white rounded-2xl divide-y divide-border overflow-hidden">
            <button
              onClick={() => navigate('/poc')}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
            >
              <FlaskConical size={18} className="text-[var(--ios-blue)] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Phase 0 Validation</p>
                <p className="text-xs text-muted-foreground">Web Speech API · IndexedDB · VOICEVOX CORS</p>
              </div>
              <ChevronRight size={16} className="text-muted-foreground shrink-0" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
