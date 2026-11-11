// Runs the Claude Code CLI on this machine with its own subscription login
// (Pro/Max OAuth), following run_claude/build_env in ai-agent-cli.
import { spawn } from "node:child_process"

/** A failure worth showing to the user. `code` picks the HTTP status and the hint. */
export class ClaudeError extends Error {
  /** @param {"cli-missing"|"not-logged-in"|"usage-limit"|"timeout"|"failed"|"bad-request"} code */
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

export const MESSAGES = {
  "cli-missing":
    "Claude Code が見つかりません。ターミナルで `npm install -g @anthropic-ai/claude-code` を実行してインストールし、`claude` を起動してログインしてから、このアプリを起動し直してください。",
  "not-logged-in":
    "Claude Code にログインしていません。ターミナルで `claude` を起動し、Pro または Max プランのアカウントでログインしてから、もう一度生成してください。",
  "usage-limit": "Claude の利用上限に達しました。上限がリセットされてから、もう一度生成してください。",
  timeout: "生成に時間がかかりすぎたため中止しました。もう一度試してください。",
  failed: "例文を生成できませんでした。もう一度試してください。",
}

// These make the CLI bill an API account, a cloud provider, or another
// endpoint instead of the subscription. A network proxy (HTTPS_PROXY) stays.
const NOT_SUBSCRIPTION = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
]

/** The child env for the default `cli` mode: everything that bypasses the subscription removed. */
export function buildClaudeEnv(env) {
  const out = { ...env }
  for (const name of NOT_SUBSCRIPTION) delete out[name]
  return out
}

const abortError = () => Object.assign(new Error("The operation was aborted"), { name: "AbortError" })

// SIGTERM lets the CLI clean up; SIGKILL follows if it does not exit.
const KILL_GRACE_MS = 2000

/**
 * Spawn the CLI and collect its output. Resolves { code, stdout, stderr };
 * rejects with AbortError, or ClaudeError for a missing CLI or a timeout.
 */
function exec(command, args, { env, signal, timeoutMs }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const child = spawn(command, args, { env: buildClaudeEnv(env), stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    let settled = false
    let killTimer
    // Set when we kill the child: the promise rejects with it once the child
    // has actually exited, so a settled call never leaves a CLI running.
    let killedWith = null
    child.stdout.setEncoding("utf8").on("data", (c) => (stdout += c))
    child.stderr.setEncoding("utf8").on("data", (c) => (stderr += c))

    const finish = (fn) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(killTimer)
      signal?.removeEventListener("abort", onAbort)
      fn()
    }
    const kill = (reason) => {
      if (killedWith) return
      killedWith = reason
      child.kill("SIGTERM")
      killTimer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS)
    }
    const onAbort = () => kill(abortError())
    const timer = setTimeout(() => kill(new ClaudeError("timeout", MESSAGES.timeout)), timeoutMs)
    signal?.addEventListener("abort", onAbort, { once: true })

    child.on("error", (err) => {
      finish(() =>
        reject(err.code === "ENOENT" ? new ClaudeError("cli-missing", MESSAGES["cli-missing"]) : new ClaudeError("failed", MESSAGES.failed)),
      )
    })
    child.on("close", (code) => {
      finish(() => (killedWith ? reject(killedWith) : resolve({ code, stdout, stderr })))
    })
  })
}

const LOGGED_OUT = /not logged in|please run \/login|invalid api key|oauth token (has )?expired|authentication/i
const USAGE_LIMIT = /usage limit|hit your limit|limit reached|rate.?limit/i

/** Turn a result record (or its absence) into a ClaudeError. */
function classify(record, stderr) {
  const text = `${typeof record?.result === "string" ? record.result : ""}\n${stderr}`
  if (record?.api_error_status === 429 || USAGE_LIMIT.test(text)) return new ClaudeError("usage-limit", MESSAGES["usage-limit"])
  if (record?.api_error_status === 401 || LOGGED_OUT.test(text)) return new ClaudeError("not-logged-in", MESSAGES["not-logged-in"])
  return new ClaudeError("failed", MESSAGES.failed)
}

export const DEFAULT_TIMEOUT_MS = 180_000

/**
 * One structured-output call: no tools, no slash commands, no MCP servers, no
 * saved session. Resolves with the parsed `structured_output`.
 */
export async function runClaude({
  prompt,
  systemPrompt,
  schema,
  model,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  command = "claude",
  env = process.env,
}) {
  const args = [
    "-p",
    "--output-format", "json",
    "--json-schema", JSON.stringify(schema),
    "--system-prompt", systemPrompt,
    "--tools", "",
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--no-session-persistence",
    // Skip user/project/local settings, so their hooks, env, and model do not
    // run on every generation. The login itself is not a setting and stays.
    "--setting-sources", "",
    ...(model ? ["--model", model] : []),
    "--",
    prompt,
  ]
  const { code, stdout, stderr } = await exec(command, args, { env, signal, timeoutMs })
  let record
  try {
    record = JSON.parse(stdout)
  } catch {
    record = undefined
  }
  if (code !== 0 || !record || record.is_error) throw classify(record, stderr)
  if (typeof record.structured_output !== "object" || record.structured_output === null) {
    throw new ClaudeError("failed", MESSAGES.failed)
  }
  return record.structured_output
}

const STATUS_TIMEOUT_MS = 10_000

/**
 * Whether the CLI is installed and logged in, without starting a model call.
 * Only these three fields leave this function; `auth status` also prints the
 * account's email and organisation.
 */
export async function claudeStatus({ command = "claude", env = process.env } = {}) {
  try {
    const { stdout } = await exec(command, ["auth", "status"], { env, timeoutMs: STATUS_TIMEOUT_MS })
    const parsed = JSON.parse(stdout)
    return {
      installed: true,
      loggedIn: parsed?.loggedIn === true,
      subscriptionType: typeof parsed?.subscriptionType === "string" ? parsed.subscriptionType : null,
    }
  } catch (err) {
    if (err instanceof ClaudeError && err.code === "cli-missing") return { installed: false, loggedIn: false, subscriptionType: null }
    // Installed but its status could not be read (an older CLI, a hang).
    return { installed: true, loggedIn: false, subscriptionType: null }
  }
}
