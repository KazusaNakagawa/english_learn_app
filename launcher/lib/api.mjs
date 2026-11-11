// The local API: /api/health and POST /api/generate-sentences. Shared by the
// launcher's server and the Vite dev server (web/vite.config.ts).
//
// The generate endpoint spends the user's Claude subscription, so it answers
// only the app's own page: a loopback client, a loopback Host (no DNS
// rebinding), and an Origin equal to that Host. It never sends CORS headers.
import { APP_ID } from "./app-id.mjs"
import { claudeStatus, ClaudeError } from "./claude.mjs"
import { generateSentences } from "./generate.mjs"

/** Model aliases the page may pick; anything else is refused. */
export const MODELS = ["sonnet", "haiku", "opus"]
export const DEFAULT_MODEL = "sonnet"

const MAX_BODY_BYTES = 8 * 1024

const STATUS_BY_CODE = {
  "bad-request": 400,
  "not-logged-in": 401,
  "usage-limit": 429,
  failed: 502,
  "cli-missing": 503,
  timeout: 504,
}

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"])
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])

/**
 * Why a request must be refused, or null when it may proceed.
 * @param {{ headers: Record<string, string|undefined>, socket: { remoteAddress?: string } }} req
 */
export function checkRequest(req, { requireOrigin }) {
  if (!LOOPBACK_ADDRESSES.has(req.socket.remoteAddress ?? "")) return "not a loopback client"
  const host = req.headers.host ?? ""
  const hostname = host.replace(/:\d+$/, "")
  if (!LOOPBACK_HOSTNAMES.has(hostname)) return "not a loopback host"
  if (requireOrigin && req.headers.origin !== `http://${host}`) return "origin does not match the page"
  return null
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers })
  res.end(JSON.stringify(body))
}

const fail = (res, status, error, message, headers) => sendJson(res, status, { error, message }, headers)

/** Read a JSON body up to MAX_BODY_BYTES. Resolves the value, or a [status, message] pair. */
function readJson(req) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    let done = false
    req.on("data", (chunk) => {
      if (done) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        done = true
        resolve([413, "リクエストが大きすぎます"])
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      if (done) return
      done = true
      try {
        resolve({ value: JSON.parse(Buffer.concat(chunks).toString("utf8")) })
      } catch {
        resolve([400, "リクエストの形式が正しくありません"])
      }
    })
    req.on("error", () => {
      if (!done) {
        done = true
        resolve([400, "リクエストを読み取れませんでした"])
      }
    })
  })
}

/**
 * Build the handler. It returns true when it handled the request (any /api/
 * path), false to let the caller serve it.
 */
export function createApiHandler({ version, status = claudeStatus, generate = generateSentences } = {}) {
  // The run in progress, if any. `aborting` marks one the page cancelled: it is
  // still stopping its CLI, so a retry waits for it rather than getting 409.
  let current = null
  // Concurrent status checks (two tabs, a double mount) share one CLI call.
  let statusInFlight = null

  function sharedStatus() {
    statusInFlight ??= Promise.resolve(status()).finally(() => (statusInFlight = null))
    return statusInFlight
  }

  // Plain /api/health only says which app this is, so a second launch can
  // recognise a running copy without waiting for the CLI.
  async function health(req, res, withClaude) {
    sendJson(res, 200, withClaude ? { app: APP_ID, version, claude: await sharedStatus() } : { app: APP_ID, version })
  }

  async function generateHandler(req, res) {
    if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) {
      return fail(res, 415, "bad-request", "Content-Type は application/json にしてください")
    }
    const body = await readJson(req)
    if (Array.isArray(body)) {
      const [code, message] = body
      return fail(res, code, "bad-request", message, code === 413 ? { connection: "close" } : {})
    }
    const { word, model = DEFAULT_MODEL } = body.value ?? {}
    if (typeof word !== "string" || !word.trim()) return fail(res, 400, "bad-request", "英単語を入力してください")
    if (!MODELS.includes(model)) return fail(res, 400, "bad-request", "使えないモデルが指定されました")
    while (current?.aborting) await current.done
    if (current) return fail(res, 409, "busy", "別の生成を実行中です。終わってからもう一度試してください。")

    // The page's 生成を中止 aborts its fetch, which closes this response.
    const controller = new AbortController()
    const run = { aborting: false, done: null }
    const onClose = () => {
      if (res.writableEnded) return
      run.aborting = true
      controller.abort()
    }
    res.on("close", onClose)
    current = run
    run.done = (async () => {
      try {
        const content = await generate({ word, model, signal: controller.signal })
        if (!controller.signal.aborted) sendJson(res, 200, content)
      } catch (err) {
        if (controller.signal.aborted || err?.name === "AbortError") return
        if (err instanceof ClaudeError) return fail(res, STATUS_BY_CODE[err.code] ?? 502, err.code, err.message)
        console.error("[api] generation failed:", err)
        fail(res, 500, "failed", "例文を生成できませんでした。もう一度試してください。")
      } finally {
        current = null
        res.off("close", onClose)
      }
    })()
    await run.done
  }

  return function handle(req, res) {
    const [pathname, query = ""] = (req.url ?? "/").split("?")
    if (!pathname.startsWith("/api/")) return false

    const isGenerate = pathname === "/api/generate-sentences"
    const refused = checkRequest(req, { requireOrigin: isGenerate })
    if (refused) {
      fail(res, 403, "forbidden", "このページからは使えません")
      return true
    }

    if (pathname === "/api/health") {
      if (req.method !== "GET" && req.method !== "HEAD") fail(res, 405, "bad-request", "Method Not Allowed", { allow: "GET, HEAD" })
      else health(req, res, new URLSearchParams(query).get("claude") === "1").catch(() => fail(res, 500, "failed", "状態を確認できませんでした"))
      return true
    }
    if (isGenerate) {
      if (req.method !== "POST") fail(res, 405, "bad-request", "Method Not Allowed", { allow: "POST" })
      else generateHandler(req, res)
      return true
    }
    fail(res, 404, "not-found", "Not Found")
    return true
  }
}
