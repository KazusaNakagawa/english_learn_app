import assert from "node:assert/strict"
import { test } from "node:test"

import {
  checkVersions,
  findLeakedSecrets,
  parseEnvFile,
  scrubbedBuildEnv,
  valuesToScan,
} from "../scripts/verify-dist.mjs"

test("checkVersions passes when launcher and web match", () => {
  assert.deepEqual(checkVersions("0.1.0", "0.1.0"), [])
})

test("checkVersions reports a mismatch", () => {
  const problems = checkVersions("0.2.0", "0.1.0")
  assert.equal(problems.length, 1)
  assert.match(problems[0], /0\.2\.0/)
  assert.match(problems[0], /0\.1\.0/)
})

test("parseEnvFile strips inline comments the way Vite's dotenv does", () => {
  const vars = parseEnvFile(
    [
      "# VITE_VOICEVOX_API_KEY_POC=commented-out-value",
      "VITE_X_KEY=sk-abc123456789 # personal",
      "QUOTED_TOKEN='keep # this'",
      "EMPTY_KEY=",
    ].join("\n"),
  )
  assert.equal(vars.VITE_X_KEY, "sk-abc123456789")
  assert.equal(vars.QUOTED_TOKEN, "keep # this")
  assert.equal(vars.EMPTY_KEY, "")
  assert.equal("VITE_VOICEVOX_API_KEY_POC" in vars, false)
})

test("valuesToScan covers every VITE_* value except the stamped ones, whatever its name", () => {
  const values = valuesToScan({
    VITE_APP_VERSION: "0.1.0-long-enough",
    VITE_APP_ENV: "development",
    VITE_VOICEVOX_ENDPOINT_POC: "https://abcdef.execute-api.example.com",
    VITE_SOMETHING_NEW: "private-value-123",
  })
  assert.deepEqual(values.sort(), ["https://abcdef.execute-api.example.com", "private-value-123"])
})

test("valuesToScan covers secret-named variables without the VITE_ prefix", () => {
  assert.deepEqual(valuesToScan({ OPENAI_API_KEY: "sk-abcdefgh", PLAIN: "not-a-secret-value" }), ["sk-abcdefgh"])
})

test("valuesToScan skips values too short to match safely", () => {
  assert.deepEqual(valuesToScan({ VITE_FLAG: "poc", X_KEY: "abc", EMPTY: "" }), [])
})

test("findLeakedSecrets names the file that contains a secret", () => {
  const files = { "assets/index.js": "const k='abcd1234efgh'", "index.html": "<html>" }
  assert.deepEqual(findLeakedSecrets(files, ["abcd1234efgh"]), ["assets/index.js"])
})

test("findLeakedSecrets is empty with no secrets", () => {
  assert.deepEqual(findLeakedSecrets({ "a.js": "x" }, []), [])
})

test("scrubbedBuildEnv blanks every VITE_* from the shell and .env files and stamps the version", () => {
  const env = scrubbedBuildEnv(
    { PATH: "/bin", VITE_VOICEVOX_API_KEY_POC: "secret", VITE_FROM_SHELL: "x" },
    "1.2.3",
    ["VITE_VOICEVOX_ENDPOINT_POC", "VITE_FROM_FILE", "NOT_VITE"],
  )
  assert.equal(env.PATH, "/bin")
  assert.equal(env.VITE_VOICEVOX_API_KEY_POC, "")
  assert.equal(env.VITE_VOICEVOX_ENDPOINT_POC, "")
  assert.equal(env.VITE_FROM_SHELL, "")
  assert.equal(env.VITE_FROM_FILE, "")
  assert.equal("NOT_VITE" in env, false)
  assert.equal(env.VITE_APP_VERSION, "1.2.3")
  assert.equal(env.VITE_APP_ENV, "launcher")
})
