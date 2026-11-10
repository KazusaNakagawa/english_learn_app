import assert from "node:assert/strict"
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, test } from "node:test"
import { fileURLToPath } from "node:url"

import { buildClaudeEnv, ClaudeError, claudeStatus, runClaude } from "../lib/claude.mjs"

const FAKE = fileURLToPath(new URL("../fixtures/fake-claude.mjs", import.meta.url))
let dir
let log

before(() => {
  chmodSync(FAKE, 0o755)
  dir = mkdtempSync(join(tmpdir(), "ela-claude-"))
  log = join(dir, "log.json")
})
after(() => rmSync(dir, { recursive: true, force: true }))

const envFor = (mode, extra = {}) => ({ ...process.env, FAKE_CLAUDE_MODE: mode, FAKE_CLAUDE_LOG: log, ...extra })
const readLog = () => JSON.parse(readFileSync(log, "utf8"))
const run = (mode, options = {}) =>
  runClaude({ command: FAKE, env: envFor(mode, options.extraEnv), prompt: "p", systemPrompt: "s", schema: { type: "object" }, ...options })

async function rejectsWith(promise, code) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof ClaudeError, `expected ClaudeError, got ${err}`)
    assert.equal(err.code, code)
    assert.ok(err.message.length > 0)
    return true
  })
}

// --- buildClaudeEnv ---

test("buildClaudeEnv removes API credentials so the CLI uses its subscription login", () => {
  const env = buildClaudeEnv({ PATH: "/bin", HOME: "/h", ANTHROPIC_API_KEY: "sk-ant-x", ANTHROPIC_AUTH_TOKEN: "t" })
  assert.equal("ANTHROPIC_API_KEY" in env, false)
  assert.equal("ANTHROPIC_AUTH_TOKEN" in env, false)
  assert.equal(env.PATH, "/bin")
  assert.equal(env.HOME, "/h")
})

test("buildClaudeEnv does not modify its input", () => {
  const input = { ANTHROPIC_API_KEY: "sk-ant-x" }
  buildClaudeEnv(input)
  assert.equal(input.ANTHROPIC_API_KEY, "sk-ant-x")
})

test("buildClaudeEnv with no credentials set is a plain copy", () => {
  assert.deepEqual(buildClaudeEnv({ A: "1" }), { A: "1" })
})

// --- runClaude ---

test("runClaude returns the structured output", async () => {
  const out = await run("ok")
  assert.equal(out.meaning, "回復力のある")
  assert.equal(out.sentences.length, 2)
})

test("the subprocess gets no ANTHROPIC_API_KEY even when the shell sets one", async () => {
  await run("ok", { env: buildClaudeEnv(envFor("ok", { ANTHROPIC_API_KEY: "sk-ant-from-shell" })) })
  assert.equal("ANTHROPIC_API_KEY" in readLog().env, false)
})

test("runClaude applies buildClaudeEnv itself when given the raw env", async () => {
  await run("ok", { extraEnv: { ANTHROPIC_API_KEY: "sk-ant-from-shell" } })
  assert.equal("ANTHROPIC_API_KEY" in readLog().env, false)
})

test("runClaude passes structured output, no tools, and isolation flags", async () => {
  await run("ok", { model: "sonnet" })
  const { args } = readLog()
  const value = (flag) => args[args.indexOf(flag) + 1]
  assert.ok(args.includes("-p"))
  assert.equal(value("--output-format"), "json")
  assert.deepEqual(JSON.parse(value("--json-schema")), { type: "object" })
  assert.equal(value("--tools"), "")
  assert.equal(value("--system-prompt"), "s")
  assert.equal(value("--model"), "sonnet")
  for (const flag of ["--disable-slash-commands", "--strict-mcp-config", "--no-session-persistence"]) {
    assert.ok(args.includes(flag), flag)
  }
  // The prompt is the last argument, after "--", so a word can never be read as a flag.
  assert.equal(args.at(-2), "--")
  assert.equal(args.at(-1), "p")
})

test("a missing CLI is cli-missing", async () => {
  await rejectsWith(runClaude({ command: join(dir, "no-such-claude"), env: process.env, prompt: "p", systemPrompt: "s", schema: {} }), "cli-missing")
})

test("a logged-out CLI is not-logged-in", async () => {
  await rejectsWith(run("logged-out"), "not-logged-in")
})

test("a usage limit is usage-limit", async () => {
  await rejectsWith(run("usage-limit"), "usage-limit")
})

test("a reply without structured output is failed", async () => {
  await rejectsWith(run("no-structured-output"), "failed")
})

test("unparseable output is failed", async () => {
  await rejectsWith(run("garbage"), "failed")
})

test("a crash is failed", async () => {
  await rejectsWith(run("crash"), "failed")
})

const isAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitForLog() {
  for (let i = 0; i < 100 && !existsSync(log); i++) await new Promise((r) => setTimeout(r, 20))
  return readLog().pid
}

test("aborting kills the subprocess", async () => {
  rmSync(log, { force: true })
  const controller = new AbortController()
  const pending = run("hang", { signal: controller.signal })
  const pid = await waitForLog()
  assert.ok(isAlive(pid))
  controller.abort()
  await assert.rejects(pending, (err) => err.name === "AbortError")
  assert.equal(isAlive(pid), false)
})

test("an already-aborted signal does not start the CLI", async () => {
  rmSync(log, { force: true })
  await assert.rejects(run("ok", { signal: AbortSignal.abort() }), (err) => err.name === "AbortError")
  assert.equal(existsSync(log), false)
})

test("a timeout kills the subprocess and is timeout", async () => {
  rmSync(log, { force: true })
  const pending = run("hang", { timeoutMs: 300 })
  const pid = await waitForLog()
  await rejectsWith(pending, "timeout")
  assert.equal(isAlive(pid), false)
})

// --- claudeStatus ---

test("claudeStatus reports login and plan, and nothing personal", async () => {
  const status = await claudeStatus({ command: FAKE, env: envFor("ok") })
  assert.deepEqual(status, { installed: true, loggedIn: true, subscriptionType: "max" })
})

test("claudeStatus reports a logged-out CLI", async () => {
  const status = await claudeStatus({ command: FAKE, env: envFor("logged-out") })
  assert.equal(status.installed, true)
  assert.equal(status.loggedIn, false)
})

test("claudeStatus reports a missing CLI", async () => {
  assert.deepEqual(await claudeStatus({ command: join(dir, "no-such-claude"), env: process.env }), {
    installed: false,
    loggedIn: false,
    subscriptionType: null,
  })
})

test("claudeStatus checks login without ANTHROPIC_API_KEY", async () => {
  await claudeStatus({ command: FAKE, env: envFor("ok", { ANTHROPIC_API_KEY: "sk-ant-x" }) })
  assert.equal("ANTHROPIC_API_KEY" in readLog().env, false)
})
