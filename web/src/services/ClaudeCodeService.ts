/**
 * ClaudeCodeService — generates sentences through the local API that the
 * launcher (and the Vite dev server) runs next to the app. That API starts the
 * Claude Code CLI on this machine with its Pro/Max login, so no API key is
 * involved. See launcher/lib/api.mjs.
 */
import { GenerationError, readGeneratedContent, type GeneratedContent } from '@/services/OpenAIService'

export const CLAUDE_MODELS = [
  { id: 'sonnet', label: 'Sonnet（おすすめ）' },
  { id: 'haiku', label: 'Haiku（速い・上限に余裕）' },
  { id: 'opus', label: 'Opus（高品質・上限に早く達する）' },
] as const
export type ClaudeModel = typeof CLAUDE_MODELS[number]['id']

/** The command that starts the launcher; shown wherever the local API is missing. */
export const LAUNCHER_COMMAND = 'npx english-learn-app'

export type ClaudeCodeStatus =
  | { kind: 'ready'; plan: string | null }
  /** No local API: the page was not opened from the launcher or the dev server. */
  | { kind: 'no-server' }
  | { kind: 'cli-missing' }
  | { kind: 'logged-out' }

const APP_ID = 'english-learn-app'

const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError'

/** Ask the local API whether generation can run. Never throws except for an abort. */
export async function checkClaudeCode(signal?: AbortSignal): Promise<ClaudeCodeStatus> {
  try {
    const response = await fetch('/api/health?claude=1', { cache: 'no-store', signal })
    if (!response.ok) return { kind: 'no-server' }
    const body = await response.json()
    if (body?.app !== APP_ID || typeof body.claude !== 'object' || body.claude === null) return { kind: 'no-server' }
    if (!body.claude.installed) return { kind: 'cli-missing' }
    if (!body.claude.loggedIn) return { kind: 'logged-out' }
    return { kind: 'ready', plan: typeof body.claude.subscriptionType === 'string' ? body.claude.subscriptionType : null }
  } catch (err) {
    if (isAbort(err)) throw err
    return { kind: 'no-server' }
  }
}

const NO_SERVER_MESSAGE = `この画面では Claude Code で生成できません。ターミナルで \`${LAUNCHER_COMMAND}\` を実行して開いたページで使ってください`

interface Options {
  model: ClaudeModel
  signal?: AbortSignal
}

/** Generate through the local API. Aborting the signal stops the CLI on the server. */
export async function generateWithClaudeCode(word: string, { model, signal }: Options): Promise<GeneratedContent> {
  if (!word.trim()) throw new GenerationError('英単語を入力してください')

  let response: Response
  try {
    response = await fetch('/api/generate-sentences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, model }),
      signal,
    })
  } catch (err) {
    if (isAbort(err)) throw err
    throw new GenerationError(`ローカルの生成サーバーに接続できませんでした。\`${LAUNCHER_COMMAND}\` が動いているか確認してください`)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch (err) {
    if (isAbort(err)) throw err
    body = null
  }
  if (!response.ok) {
    if (response.status === 404 || response.status === 405) throw new GenerationError(NO_SERVER_MESSAGE, 'no-server')
    const { message, error } = (body ?? {}) as { message?: unknown; error?: unknown }
    throw new GenerationError(
      typeof message === 'string' && message ? message : `生成に失敗しました（ステータス ${response.status}）`,
      typeof error === 'string' ? error : undefined,
    )
  }
  const content = readGeneratedContent(body)
  if (!content) throw new GenerationError('例文を生成できませんでした')
  return content
}
