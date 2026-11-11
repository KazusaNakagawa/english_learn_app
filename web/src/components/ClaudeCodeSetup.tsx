import { CheckCircle2, Loader2, RotateCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ClaudeCodeState } from '@/hooks/useClaudeCodeStatus'
import { LAUNCHER_COMMAND } from '@/services/ClaudeCodeService'

const INSTALL_COMMAND = 'npm install -g @anthropic-ai/claude-code'

function Cmd({ children }: { children: string }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-foreground select-all">{children}</code>
}

const PLAN_LABELS: Record<string, string> = { pro: 'Pro', max: 'Max', team: 'Team', enterprise: 'Enterprise' }

interface Props {
  state: ClaudeCodeState
  onRecheck: () => void
  /** Settings shows the ready state and the dev-server note; the word form does not. */
  detailed?: boolean
}

/**
 * What stands between the user and Claude Code generation, and the exact
 * commands that clear it. Renders nothing on the word form once ready.
 */
export function ClaudeCodeSetup({ state, onRecheck, detailed = false }: Props) {
  if (state.kind === 'checking') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
        <Loader2 size={12} className="animate-spin" />Claude Code の状態を確認しています…
      </p>
    )
  }

  if (state.kind === 'ready') {
    if (!detailed) return null
    const plan = state.plan ? PLAN_LABELS[state.plan] ?? state.plan : null
    return (
      <p className="flex items-center gap-1.5 text-xs text-[var(--ios-green)] px-1">
        <CheckCircle2 size={14} />
        {plan ? `Claude Code（${plan} プラン）で生成できます` : 'Claude Code で生成できます'}
      </p>
    )
  }

  const { title, steps } = guidance(state.kind, detailed)
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

function guidance(kind: 'no-server' | 'cli-missing' | 'logged-out', detailed: boolean): { title: string; steps: React.ReactNode[] } {
  switch (kind) {
    case 'no-server':
      return {
        title: 'この画面では Claude Code で生成できません',
        steps: [
          <>ターミナルで <Cmd>{LAUNCHER_COMMAND}</Cmd> を実行し、開いたページで使ってください</>,
          ...(detailed ? [<>開発中は <Cmd>web/</Cmd> で <Cmd>npm run dev</Cmd> を実行したページでも使えます</>] : []),
          <>API キーで生成する場合は、設定の「例文の生成方法」で OpenAI を選んでください</>,
        ],
      }
    case 'cli-missing':
      return {
        title: 'Claude Code がインストールされていません',
        steps: [
          <>ターミナルで <Cmd>{INSTALL_COMMAND}</Cmd> を実行します</>,
          <>続けて <Cmd>claude</Cmd> を起動し、Pro または Max プランのアカウントでログインします</>,
          <>終わったら「再確認」を押してください</>,
        ],
      }
    case 'logged-out':
      return {
        title: 'Claude Code にログインしていません',
        steps: [
          <>ターミナルで <Cmd>claude</Cmd> を起動します</>,
          <>Pro または Max プランのアカウントでログインします</>,
          <>終わったら「再確認」を押してください</>,
        ],
      }
  }
}
