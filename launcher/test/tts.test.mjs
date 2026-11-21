import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, test } from "node:test"
import { fileURLToPath } from "node:url"

import { createTts, TtsError } from "../lib/tts.mjs"

const FAKE = fileURLToPath(new URL("../fixtures/fake-tts-worker.mjs", import.meta.url))
let dir
before(() => (dir = mkdtempSync(join(tmpdir(), "ela-tts-"))))
after(() => rmSync(dir, { recursive: true, force: true }))

const make = (mode, { env, ...opts } = {}) =>
  createTts({
    command: process.execPath,
    args: [FAKE],
    env: { ...process.env, FAKE_TTS_MODE: mode, ...env },
    log: () => {},
    ...opts,
  })

async function until(fn, ms = 3000) {
  const end = Date.now() + ms
  while (!fn()) {
    if (Date.now() > end) throw new Error("condition not met in time")
    await new Promise((r) => setTimeout(r, 10))
  }
}

async function rejectsWith(promise, code) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof TtsError, `expected TtsError, got ${err}`)
    assert.equal(err.code, code)
    assert.ok(err.message.length > 0)
    return true
  })
}

const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test("starts idle and does not spawn until used", () => {
  const tts = make("ok")
  assert.equal(tts.status(), "idle")
})

test("the first request starts the worker and asks the caller to fall back", async () => {
  const tts = make("ok")
  await rejectsWith(tts.synthesize({ text: "hi", lang: "en" }), "starting")
  await until(() => tts.status() === "ready")
  await tts.stop()
})

test("once ready, returns the worker's audio for each request", async () => {
  const tts = make("ok")
  tts.start()
  await until(() => tts.status() === "ready")
  const [en, ja] = await Promise.all([
    tts.synthesize({ text: "hello", lang: "en" }),
    tts.synthesize({ text: "こんにちは", lang: "ja" }),
  ])
  assert.equal(en.toString(), "en:hello")
  assert.equal(ja.toString(), "ja:こんにちは")
  await tts.stop()
})

test("passes on unsupported-text from the worker and keeps serving", async () => {
  const tts = make("ok")
  tts.start()
  await until(() => tts.status() === "ready")
  await rejectsWith(tts.synthesize({ text: "unknown", lang: "en" }), "unsupported-text")
  assert.equal((await tts.synthesize({ text: "ok", lang: "en" })).toString(), "en:ok")
  await tts.stop()
})

test("a missing uv is reported as uv-missing", async () => {
  const tts = createTts({ command: join(dir, "no-such-uv"), log: () => {} })
  await rejectsWith(tts.synthesize({ text: "hi", lang: "en" }), "starting")
  await until(() => tts.status() === "uv-missing")
  await rejectsWith(tts.synthesize({ text: "hi", lang: "en" }), "uv-missing")
  // Polling the status must not respawn it.
  tts.start()
  assert.equal(tts.status(), "uv-missing")
  await tts.stop()
})

test("a worker that exits before ready is failed, and the next use retries", async () => {
  const tts = make("crash")
  tts.start()
  await until(() => tts.status() === "failed")
  await rejectsWith(tts.synthesize({ text: "hi", lang: "en" }), "starting")
  assert.equal(tts.status() === "starting" || tts.status() === "failed", true)
  await tts.stop()
})

test("a worker that never gets ready is killed after the start timeout", async () => {
  const pidfile = join(dir, "never.pid")
  const tts = make("never-ready", { startTimeoutMs: 200, env: { FAKE_TTS_PIDFILE: pidfile } })
  tts.start()
  await until(() => tts.status() === "failed")
  const pid = Number(readFileSync(pidfile, "utf8"))
  await until(() => !alive(pid))
  await tts.stop()
})

test("a request that gets no answer times out and the worker is restarted later", async () => {
  const pidfile = join(dir, "hang.pid")
  const tts = make("hang", { requestTimeoutMs: 200, env: { FAKE_TTS_PIDFILE: pidfile } })
  tts.start()
  await until(() => tts.status() === "ready")
  const pid = Number(readFileSync(pidfile, "utf8"))
  await rejectsWith(tts.synthesize({ text: "hi", lang: "en" }), "timeout")
  assert.equal(tts.status(), "failed")
  await until(() => !alive(pid))
  await tts.stop()
})

test("a worker that dies mid-request fails that request", async () => {
  const tts = make("die-on-request")
  tts.start()
  await until(() => tts.status() === "ready")
  await rejectsWith(tts.synthesize({ text: "hi", lang: "en" }), "failed")
  assert.equal(tts.status(), "failed")
  await tts.stop()
})

test("an aborted request rejects with AbortError and later requests still work", async () => {
  const tts = make("ok")
  tts.start()
  await until(() => tts.status() === "ready")
  const pre = new AbortController()
  pre.abort()
  await assert.rejects(tts.synthesize({ text: "x", lang: "en", signal: pre.signal }), { name: "AbortError" })
  const c = new AbortController()
  const p = tts.synthesize({ text: "y", lang: "en", signal: c.signal })
  c.abort()
  await assert.rejects(p, { name: "AbortError" })
  assert.equal((await tts.synthesize({ text: "z", lang: "en" })).toString(), "en:z")
  await tts.stop()
})

test("stop() ends the worker process", async () => {
  const pidfile = join(dir, "stop.pid")
  const tts = make("ok", { env: { FAKE_TTS_PIDFILE: pidfile } })
  tts.start()
  await until(() => tts.status() === "ready")
  const pid = Number(readFileSync(pidfile, "utf8"))
  await tts.stop()
  assert.equal(alive(pid), false)
  assert.equal(tts.status(), "idle")
})
