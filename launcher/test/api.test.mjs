import assert from "node:assert/strict"
import { createServer, request } from "node:http"
import { after, before, beforeEach, test } from "node:test"

import { checkRequest, createApiHandler } from "../lib/api.mjs"
import { ClaudeError } from "../lib/claude.mjs"

let server
let port
let origin
let generateImpl
let calls
let statusCalls = 0

const CONTENT = { meaning: "m", phonetic: "p", sentences: [{ english: "E.", japanese: "J。", category: "c" }] }

before(async () => {
  const api = createApiHandler({
    version: "1.2.3",
    status: async () => {
      statusCalls++
      await new Promise((r) => setTimeout(r, 20))
      return { installed: true, loggedIn: true, subscriptionType: "pro" }
    },
    generate: (options) => {
      calls.push(options)
      return generateImpl(options)
    },
  })
  server = createServer((req, res) => {
    if (!api(req, res)) {
      res.statusCode = 404
      res.end("static")
    }
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  port = server.address().port
  origin = `http://127.0.0.1:${port}`
})

after(() => new Promise((r) => server.close(r)))

beforeEach(() => {
  calls = []
  generateImpl = async () => CONTENT
})

function send(path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers }, (res) => {
      let text = ""
      res.setEncoding("utf8")
      res.on("data", (c) => (text += c))
      res.on("end", () => {
        let json
        try {
          json = JSON.parse(text)
        } catch {
          json = undefined
        }
        resolve({ status: res.statusCode, headers: res.headers, text, json })
      })
    })
    req.on("error", reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

const post = (body, headers = {}) =>
  send("/api/generate-sentences", {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

// --- health ---

test("GET /api/health answers the app and version without starting the CLI", async () => {
  statusCalls = 0
  const res = await send("/api/health")
  assert.equal(res.status, 200)
  assert.equal(res.headers["cache-control"], "no-store")
  assert.deepEqual(res.json, { app: "english-learn-app", version: "1.2.3" })
  assert.equal(statusCalls, 0)
})

test("GET /api/health?claude=1 adds the CLI status", async () => {
  const res = await send("/api/health?claude=1")
  assert.deepEqual(res.json, {
    app: "english-learn-app",
    version: "1.2.3",
    claude: { installed: true, loggedIn: true, subscriptionType: "pro" },
  })
})

test("concurrent status checks share one CLI call", async () => {
  statusCalls = 0
  await Promise.all([send("/api/health?claude=1"), send("/api/health?claude=1"), send("/api/health?claude=1")])
  assert.equal(statusCalls, 1)
})

test("health from a foreign Host (DNS rebinding) is 403", async () => {
  assert.equal((await send("/api/health", { headers: { host: "evil.example:80" } })).status, 403)
})

// --- generate: success ---

test("POST /api/generate-sentences returns the generated content", async () => {
  const res = await post({ word: "resilient" })
  assert.equal(res.status, 200)
  assert.deepEqual(res.json, CONTENT)
  assert.equal(calls[0].word, "resilient")
  assert.equal(calls[0].model, "sonnet")
})

test("an allowed model is passed through", async () => {
  await post({ word: "x", model: "haiku" })
  assert.equal(calls[0].model, "haiku")
})

test("an unknown model is 400 and does not run", async () => {
  const res = await post({ word: "x", model: "claude-opus-4-1; rm -rf /" })
  assert.equal(res.status, 400)
  assert.equal(calls.length, 0)
})

// --- generate: rejected requests ---

test("a request from another origin is 403 and does not run", async () => {
  const res = await post({ word: "x" }, { origin: "https://evil.example" })
  assert.equal(res.status, 403)
  assert.equal(calls.length, 0)
  assert.equal(res.headers["access-control-allow-origin"], undefined)
})

test("a request with no Origin is 403", async () => {
  const res = await send("/api/generate-sentences", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ word: "x" }),
  })
  assert.equal(res.status, 403)
})

test("the same port on localhost is a different origin and is 403", async () => {
  assert.equal((await post({ word: "x" }, { origin: `http://localhost:${port}` })).status, 403)
})

test("a non-JSON content type is 415", async () => {
  assert.equal((await post("word=x", { "content-type": "application/x-www-form-urlencoded" })).status, 415)
})

test("malformed JSON is 400", async () => {
  assert.equal((await post("{nope")).status, 400)
})

test("a missing or blank word is 400", async () => {
  assert.equal((await post({})).status, 400)
  assert.equal((await post({ word: 5 })).status, 400)
})

test("an oversized body is 413", async () => {
  assert.equal((await post({ word: "x".repeat(20_000) })).status, 413)
  assert.equal(calls.length, 0)
})

test("GET on the generate endpoint is 405", async () => {
  const res = await send("/api/generate-sentences", { headers: { origin } })
  assert.equal(res.status, 405)
  assert.equal(res.headers.allow, "POST")
})

test("unknown /api paths are 404 JSON; other paths fall through", async () => {
  const res = await send("/api/nope")
  assert.equal(res.status, 404)
  assert.ok(res.json?.message)
  assert.equal((await send("/index.html")).text, "static")
})

// --- generate: CLI errors ---

for (const [code, status] of [
  ["cli-missing", 503],
  ["not-logged-in", 401],
  ["usage-limit", 429],
  ["timeout", 504],
  ["failed", 502],
  ["bad-request", 400],
]) {
  test(`a ${code} error is ${status} with a readable message`, async () => {
    generateImpl = async () => {
      throw new ClaudeError(code, `message for ${code}`)
    }
    const res = await post({ word: "x" })
    assert.equal(res.status, status)
    assert.deepEqual(res.json, { error: code, message: `message for ${code}` })
  })
}

test("an unexpected error is 500 without internals", async () => {
  generateImpl = async () => {
    throw new Error("secret stack detail")
  }
  const res = await post({ word: "x" })
  assert.equal(res.status, 500)
  assert.doesNotMatch(res.text, /secret stack detail/)
})

// --- one at a time, and cancel ---

test("a second generation while one runs is 409", async () => {
  let release
  generateImpl = () => new Promise((r) => (release = () => r(CONTENT)))
  const first = post({ word: "a" })
  while (!release) await new Promise((r) => setTimeout(r, 5))
  const second = await post({ word: "b" })
  assert.equal(second.status, 409)
  release()
  assert.equal((await first).status, 200)
  generateImpl = async () => CONTENT
  assert.equal((await post({ word: "c" })).status, 200)
})

test("a retry right after cancelling waits for the cancelled run instead of 409", async () => {
  let finishCancelled
  let started
  const startedP = new Promise((r) => (started = r))
  generateImpl = ({ signal }) =>
    new Promise((resolve, reject) => {
      started()
      // Like the CLI: the run settles only once the killed child has exited.
      signal.addEventListener("abort", () => {
        finishCancelled = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
      })
    })
  const req = request({
    host: "127.0.0.1",
    port,
    path: "/api/generate-sentences",
    method: "POST",
    headers: { origin, "content-type": "application/json" },
  })
  req.on("error", () => {})
  req.end(JSON.stringify({ word: "x" }))
  await startedP
  req.destroy()
  while (!finishCancelled) await new Promise((r) => setTimeout(r, 5))
  generateImpl = async () => CONTENT
  const retry = post({ word: "y" })
  await new Promise((r) => setTimeout(r, 30))
  finishCancelled()
  const res = await retry
  assert.equal(res.status, 200)
  assert.deepEqual(res.json, CONTENT)
})

test("closing the request aborts the generation", async () => {
  let aborted = false
  let started
  const startedP = new Promise((r) => (started = r))
  generateImpl = ({ signal }) =>
    new Promise((resolve, reject) => {
      started()
      signal.addEventListener("abort", () => {
        aborted = true
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
      })
    })
  const req = request({
    host: "127.0.0.1",
    port,
    path: "/api/generate-sentences",
    method: "POST",
    headers: { origin, "content-type": "application/json" },
  })
  req.on("error", () => {})
  req.end(JSON.stringify({ word: "x" }))
  await startedP
  req.destroy()
  for (let i = 0; i < 100 && !aborted; i++) await new Promise((r) => setTimeout(r, 10))
  assert.equal(aborted, true)
  // The slot is free again.
  generateImpl = async () => CONTENT
  for (let i = 0; i < 50; i++) {
    const res = await post({ word: "y" })
    if (res.status !== 409) return assert.equal(res.status, 200)
    await new Promise((r) => setTimeout(r, 10))
  }
  assert.fail("slot never freed")
})

// --- checkRequest (pure) ---

const req = ({ host = "127.0.0.1:5280", origin: o, remote = "127.0.0.1" } = {}) => ({
  headers: { host, ...(o === undefined ? {} : { origin: o }) },
  socket: { remoteAddress: remote },
})

test("checkRequest accepts loopback hosts with a matching origin", () => {
  assert.equal(checkRequest(req({ origin: "http://127.0.0.1:5280" }), { requireOrigin: true }), null)
  assert.equal(checkRequest(req({ host: "localhost:5173", origin: "http://localhost:5173" }), { requireOrigin: true }), null)
  assert.equal(checkRequest(req({ host: "[::1]:5280", origin: "http://[::1]:5280", remote: "::1" }), { requireOrigin: true }), null)
  assert.equal(checkRequest(req({ remote: "::ffff:127.0.0.1" }), { requireOrigin: false }), null)
})

test("checkRequest rejects a non-loopback client", () => {
  assert.ok(checkRequest(req({ remote: "192.168.1.20", origin: "http://127.0.0.1:5280" }), { requireOrigin: true }))
})

test("checkRequest rejects a foreign host and a mismatched origin", () => {
  assert.ok(checkRequest(req({ host: "evil.example" }), { requireOrigin: false }))
  assert.ok(checkRequest(req({ origin: "http://127.0.0.1:9999" }), { requireOrigin: true }))
  assert.ok(checkRequest(req({ origin: "null" }), { requireOrigin: true }))
  assert.ok(checkRequest(req({}), { requireOrigin: true }))
})
