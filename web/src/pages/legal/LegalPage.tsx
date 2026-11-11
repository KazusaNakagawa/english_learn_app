import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PRIVACY_POLICY, TERMS_OF_SERVICE, type Lang, type LegalDocument } from './legalContent'

const LANGS: { id: Lang; label: string }[] = [
  { id: 'ja', label: '日本語' },
  { id: 'en', label: 'English' },
]

/** One paragraph line; a line that is only a URL becomes a link. */
function TextLine({ line }: { line: string }) {
  if (/^https?:\/\/\S+$/.test(line)) {
    return (
      <a href={line} target="_blank" rel="noreferrer" className="text-[var(--ios-blue)] break-all underline">
        {line}
      </a>
    )
  }
  return <>{line}</>
}

function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{doc.updated}</p>
      {doc.sections.map((section) => (
        <section key={section.title} className="space-y-2">
          <h2 className="text-base font-semibold">{section.title}</h2>
          {section.text && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {section.text.split('\n').map((line, i) => (
                <span key={i} className="block">
                  <TextLine line={line} />
                </span>
              ))}
            </p>
          )}
          {section.items?.map((item) => (
            <div key={item.heading} className="space-y-0.5">
              <p className="text-sm font-semibold">• {item.heading}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

/** A legal document opened from Settings, with a 日本語 / English toggle like iOS. */
function LegalPage({ document }: { document: Record<Lang, LegalDocument> }) {
  const navigate = useNavigate()
  const [lang, setLang] = useState<Lang>('ja')
  const doc = document[lang]

  // Settings is usually scrolled to 法的情報 when this opens; start at the top like iOS does.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <header className="sticky top-0 bg-[var(--ios-grouped-bg)] py-3 z-10 space-y-2">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          aria-label="設定に戻る"
          className="flex items-center gap-0.5 text-sm text-[var(--ios-blue)]"
        >
          <ChevronLeft size={18} />
          設定
        </button>
        <h1 className="text-xl font-bold">{doc.title}</h1>
      </header>

      <div className="flex bg-muted rounded-lg p-0.5 gap-0.5 mb-5">
        {LANGS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={lang === id}
            onClick={() => setLang(id)}
            className={cn(
              'flex-1 text-xs font-medium py-1.5 px-2 rounded-md transition-all',
              lang === id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl px-4 py-5">
        <LegalDocumentView doc={doc} />
      </div>
    </div>
  )
}

export function PrivacyPolicyPage() {
  return <LegalPage document={PRIVACY_POLICY} />
}

export function TermsOfServicePage() {
  return <LegalPage document={TERMS_OF_SERVICE} />
}
