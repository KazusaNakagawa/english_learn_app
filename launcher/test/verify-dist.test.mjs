import assert from "node:assert/strict"
import { test } from "node:test"

import { checkVersions, findLeakedSecrets, readEnvSecrets, scrubbedBuildEnv } from "../scripts/verify-dist.mjs"

test("checkVersions passes when launcher and web match", () => {
  assert.deepEqual(checkVersions("0.1.0", "0.1.0"), [])
})

test("checkVersions reports a mismatch", () => {
  const problems = checkVersions("0.2.0", "0.1.0")
  assert.equal(problems.length, 1)
  assert.match(problems[0], /0\.2\.0/)
  assert.match(problems[0], /0\.1\.0/)
})

test("readEnvSecrets picks non-empty KEY/SECRET/TOKEN values and skips comments", () => {
  const text = [
    "# VITE_VOICEVOX_API_KEY_POC=commented-out-value",
    "VITE_APP_VERSION=0.1.0",
    "VITE_VOICEVOX_ENDPOINT_POC=https://example.invalid",
    "VITE_VOICEVOX_API_KEY_POC=abcd1234efgh",
    "OTHER_TOKEN = 'quoted-token-value'",
    "EMPTY_KEY=",
  ].join("\n")
  assert.deepEqual(readEnvSecrets(text), ["abcd1234efgh", "quoted-token-value"])
})

test("readEnvSecrets ignores values too short to match safely", () => {
  assert.deepEqual(readEnvSecrets("X_KEY=abc"), [])
})

test("findLeakedSecrets names the file that contains a secret", () => {
  const files = { "assets/index.js": "const k='abcd1234efgh'", "index.html": "<html>" }
  assert.deepEqual(findLeakedSecrets(files, ["abcd1234efgh"]), ["assets/index.js"])
})

test("findLeakedSecrets is empty with no secrets", () => {
  assert.deepEqual(findLeakedSecrets({ "a.js": "x" }, []), [])
})

test("scrubbedBuildEnv blanks VOICEVOX defaults and stamps the version", () => {
  const env = scrubbedBuildEnv({ PATH: "/bin", VITE_VOICEVOX_API_KEY_POC: "secret" }, "1.2.3")
  assert.equal(env.PATH, "/bin")
  assert.equal(env.VITE_VOICEVOX_API_KEY_POC, "")
  assert.equal(env.VITE_VOICEVOX_ENDPOINT_POC, "")
  assert.equal(env.VITE_APP_VERSION, "1.2.3")
  assert.equal(env.VITE_APP_ENV, "launcher")
})
