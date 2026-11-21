import { CheckCircle2, Loader2, RotateCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { LocalVoiceState } from '@/hooks/useLocalVoiceStatus'
import { LAUNCHER_COMMAND } from '@/services/ClaudeCodeService'

const UV_INSTALL_COMMAND = 'curl -LsSf https://astral.sh/uv/install.sh | sh'

function Cmd({ children }: { children: string }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-foreground select-all break-all">{children}</code>
}

interface Props {
  state: LocalVoiceState
  onRecheck: () => void
}

/**
 * Whether the ナチュラル voice (Kokoro on this machine) is in use, and the
 * exact steps when it is not. Until it is ready, speech uses the browser voice.
 */
export function LocalVoiceSetup({ state, onRecheck }: Props) {
  if (state === 'checking') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
        <Loader2 size={12} className="animate-spin" />ナチュラル音声の状態を確認しています…
      </p>
    )
  }

  if (state === 'ready') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-[var(--ios-green)] px-1">
        <CheckCircle2 size={14} />ナチュラル音声で読み上げます
      </p>
    )
  }

  if (state === 'starting') {
    return (
      <div role="status" className="space-y-1 px-1">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <Loader2 size={12} className="animate-spin shrink-0" />ナチュラル音声を準備しています
        </p>
        <p className="text-xs text-muted-foreground">
          初回は約 1.5GB のダウンロードがあり、数分かかります。準備ができるまではブラウザの音声で読みます。
        </p>
      </div>
    )
  }

  const { title, steps } = guidance(state)
  return (
    <div role="status" className="rounded-xl bg-[var(--ios-orange)]/10 px-3 py-2.5 space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <TriangleAlert size={14} className="shrink-0 text-[var(--ios-orange)]" />{title}
      </p>
      <ol className="list-decimal pl-5 space-y-1 text-xs text-muted-foreground">
        {steps.map((step, i) => <li key={i}>{step}</li>)}
      </ol>
      <Button type="button" variant="ghost" size="sm" onClick={onRecheck} className="h-7 px-2 text-xs text-[var(--ios-blue)]">
        <RotateCw size={12} className="mr-1" />再確認
      </Button>
    </div>
  )
}

function guidance(state: 'no-server' | 'uv-missing' | 'failed'): { title: string; steps: React.ReactNode[] } {
  switch (state) {
    case 'no-server':
      return {
        title: 'この画面ではナチュラル音声を使えません（ブラウザの音声で読みます）',
        steps: [
          <>ターミナルで <Cmd>{LAUNCHER_COMMAND}</Cmd> を実行し、開いたページで使ってください</>,
          <>開発中は <Cmd>web/</Cmd> で <Cmd>npm run dev</Cmd> を実行したページでも使えます</>,
        ],
      }
    case 'uv-missing':
      return {
        title: 'ナチュラル音声には uv が必要です（今はブラウザの音声で読みます）',
        steps: [
          <>ターミナルで <Cmd>{UV_INSTALL_COMMAND}</Cmd> を実行します</>,
          <>アプリを起動したターミナルで Ctrl-C を押して止め、もう一度起動します</>,
          <>開き直したページで「再確認」を押してください</>,
        ],
      }
    case 'failed':
      return {
        title: 'ナチュラル音声を起動できませんでした（今はブラウザの音声で読みます）',
        steps: [
          <>アプリを起動したターミナルに出ている <Cmd>[tts]</Cmd> のメッセージを確認してください</>,
          <>「再確認」を押すと、もう一度起動します</>,
        ],
      }
  }
}
