// Local Kokoro TTS: runs kokoro_worker.py with `uv run --script` and talks to it
// over stdin/stdout, one JSON object per line (the protocol is described in the
// worker). The worker starts on first use, loads its models once, and then
// answers requests in order until the launcher stops.
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

export const WORKER_SCRIPT = fileURLToPath(new URL("./kokoro_worker.py", import.meta.url))

/** A failure worth showing to the user. `code` picks the HTTP status. */
export class TtsError extends Error {
  /** @param {"uv-missing"|"starting"|"unsupported-text"|"timeout"|"failed"} code */
  constructor(code, message = TTS_MESSAGES[code]) {
    super(message)
    this.code = code
  }
}

export const TTS_MESSAGES = {
  "uv-missing":
    "ローカル音声には uv が必要です。ターミナルで `curl -LsSf https://astral.sh/uv/install.sh | sh` を実行してインストールし、このアプリを起動し直してください。",
  starting: "ローカル音声を準備しています。初回はダウンロードに数分かかります。",
  "unsupported-text": "この文はローカル音声で読めない単語を含んでいます。",
  timeout: "ローカル音声の生成に時間がかかりすぎたため中止しました。",
  failed: "ローカル音声を生成できませんでした。",
}

/** idle: not started yet. The others are what /api/health reports. */
const STATES = ["idle", "uv-missing", "starting", "ready", "failed"]

// The first start installs Python packages and downloads the model (~1.5 GB).
export const DEFAULT_START_TIMEOUT_MS = 20 * 60_000
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000
const KILL_GRACE_MS = 2000
const STDERR_TAIL_LINES = 20

const abortError = () => Object.assign(new Error("The operation was aborted"), { name: "AbortError" })

export function createTts({
  command = "uv",
  args = ["run", "--quiet", "--locked", "--script", WORKER_SCRIPT],
  env = process.env,
  startTimeoutMs = DEFAULT_START_TIMEOUT_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  log = (msg) => console.error(msg),
} = {}) {
  /** @type {typeof STATES[number]} */
  let state = "idle"
  let child = null
  let nextId = 1
  /** @type {Map<number, {resolve: (b: Buffer) => void, reject: (e: Error) => void, timer: NodeJS.Timeout}>} */
  const pending = new Map()
  let stderrTail = []
  let exited = Promise.resolve()

  function rejectAll(err) {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer)
      reject(err)
    }
    pending.clear()
  }

  function kill(proc) {
    if (!proc || proc.exitCode !== null || proc.signalCode !== null) return
    // A spawn that failed (or has not started) has no pid; signalling it could
    // reach pid 0, which is this whole process group.
    if (!(proc.pid > 0)) return
    proc.kill("SIGTERM")
    const t = setTimeout(() => proc.kill("SIGKILL"), KILL_GRACE_MS)
    proc.once("exit", () => clearTimeout(t))
  }

  function onLine(line) {
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    if (msg?.ready === true) {
      if (state === "starting") {
        state = "ready"
        if (msg.espeak === false) log("[tts] espeak-ng not found: sentences with words outside Kokoro's dictionary use the browser voice")
        log("[tts] local voice ready")
      }
      return
    }
    const entry = pending.get(msg?.id)
    if (!entry) return // cancelled or timed out
    pending.delete(msg.id)
    clearTimeout(entry.timer)
    if (typeof msg.wav === "string") entry.resolve(Buffer.from(msg.wav, "base64"))
    else entry.reject(new TtsError(msg.error === "unsupported-text" ? "unsupported-text" : "failed"))
  }

  /**
   * Start the worker if it is not running. Safe to call repeatedly. A missing
   * uv stays missing until the launcher restarts (the message says to restart
   * after installing), so status polling does not respawn it every time.
   */
  function start() {
    if (state === "starting" || state === "ready" || state === "uv-missing") return
    state = "starting"
    stderrTail = []
    log("[tts] starting the local voice (the first start downloads about 1.5 GB)")
    const proc = spawn(command, args, { env, stdio: ["pipe", "pipe", "pipe"] })
    child = proc
    let resolveExit
    exited = new Promise((r) => (resolveExit = r))
    const startTimer = setTimeout(() => {
      if (child === proc && state === "starting") {
        log("[tts] the local voice did not become ready in time")
        state = "failed"
        kill(proc)
      }
    }, startTimeoutMs)

    let buf = ""
    proc.stdout.setEncoding("utf8").on("data", (chunk) => {
      buf += chunk
      let i
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 1)
        if (child === proc) onLine(line)
      }
    })
    proc.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderrTail.push(...chunk.split("\n").filter(Boolean))
      if (stderrTail.length > STDERR_TAIL_LINES) stderrTail = stderrTail.slice(-STDERR_TAIL_LINES)
    })
    // A closed stdin (the worker died) must not crash the launcher.
    proc.stdin.on("error", () => {})
    proc.on("error", (err) => {
      clearTimeout(startTimer)
      // A spawn that fails never emits exit, so stop() waits on this instead.
      resolveExit()
      if (child !== proc) return
      child = null
      state = err.code === "ENOENT" ? "uv-missing" : "failed"
      if (state === "failed") log(`[tts] could not start the local voice: ${err.message}`)
      rejectAll(new TtsError(state))
    })
    proc.on("exit", (code, signal) => {
      clearTimeout(startTimer)
      resolveExit()
      if (child !== proc) return
      child = null
      if (state !== "idle") {
        log(`[tts] the local voice stopped (${signal ?? `exit ${code}`})${stderrTail.length ? `:\n${stderrTail.join("\n")}` : ""}`)
        state = "failed"
      }
      rejectAll(new TtsError("failed"))
    })
  }

  /**
   * Speech for `text` as a WAV buffer. Rejects with TtsError("starting") (and
   * starts the worker) when it is not ready yet, so the caller can fall back.
   * @param {{ text: string, lang: "en" | "ja", signal?: AbortSignal }} req
   */
  function synthesize({ text, lang, signal }) {
    if (signal?.aborted) return Promise.reject(abortError())
    if (state !== "ready") {
      start()
      return Promise.reject(new TtsError(state === "uv-missing" ? "uv-missing" : "starting"))
    }
    const id = nextId++
    return new Promise((resolve, reject) => {
      const done = () => signal?.removeEventListener("abort", onAbort)
      const onAbort = () => {
        const entry = pending.get(id)
        if (!entry) return
        pending.delete(id)
        clearTimeout(entry.timer)
        reject(abortError())
      }
      const timer = setTimeout(() => {
        pending.delete(id)
        done()
        // The worker answers in order, so a stuck request blocks every later one.
        log("[tts] a request timed out; restarting the local voice on next use")
        const proc = child
        child = null
        state = "failed"
        kill(proc)
        rejectAll(new TtsError("failed"))
        reject(new TtsError("timeout"))
      }, requestTimeoutMs)
      pending.set(id, {
        resolve: (b) => (done(), resolve(b)),
        reject: (e) => (done(), reject(e)),
        timer,
      })
      signal?.addEventListener("abort", onAbort, { once: true })
      child.stdin.write(`${JSON.stringify({ id, text, lang })}\n`)
    })
  }

  /** Stop the worker; resolves once it has exited. */
  async function stop() {
    const proc = child
    child = null
    state = "idle"
    rejectAll(new TtsError("failed"))
    if (proc) {
      proc.stdin.end()
      kill(proc)
      await exited
    }
  }

  return { status: () => state, start, synthesize, stop }
}
