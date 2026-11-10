#!/usr/bin/env node
// Stand-in for the claude CLI. FAKE_CLAUDE_MODE picks the behaviour and
// FAKE_CLAUDE_LOG (a file) records the argv, env, and pid it ran with.
import { writeFileSync } from "node:fs"

const mode = process.env.FAKE_CLAUDE_MODE ?? "ok"
const args = process.argv.slice(2)
if (process.env.FAKE_CLAUDE_LOG) {
  writeFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ args, env: process.env, pid: process.pid }))
}

const content = {
  meaning: "回復力のある",
  phonetic: "/rɪˈzɪliənt/",
  sentences: [
    { english: "She is resilient.", japanese: "彼女は立ち直りが早い。", category: "日常会話" },
    { english: "Build resilient systems.", japanese: "回復力のあるシステムを作る。", category: "ビジネス" },
  ],
}
const result = (fields) => process.stdout.write(JSON.stringify({ type: "result", subtype: "success", ...fields }))

if (args[0] === "auth" && args[1] === "status") {
  if (mode === "logged-out") {
    process.stdout.write(JSON.stringify({ loggedIn: false, authMethod: "none" }))
    process.exit(1)
  }
  process.stdout.write(
    JSON.stringify({ loggedIn: true, authMethod: "claude.ai", subscriptionType: "max", email: "someone@example.com", orgName: "Org" }),
  )
  process.exit(0)
}
if (args[0] === "--version") {
  process.stdout.write("9.9.9 (Claude Code)\n")
  process.exit(0)
}

switch (mode) {
  case "ok":
    result({ is_error: false, result: JSON.stringify(content), structured_output: content })
    break
  case "logged-out":
    result({ is_error: true, result: "Not logged in · Please run /login" })
    process.exit(1)
    break
  case "usage-limit":
    result({ is_error: true, result: "Claude AI usage limit reached|1767225600", api_error_status: 429 })
    process.exit(1)
    break
  case "no-structured-output":
    result({ is_error: false, result: "I cannot do that" })
    break
  case "garbage":
    process.stdout.write("not json at all")
    break
  case "crash":
    process.stderr.write("boom\n")
    process.exit(3)
    break
  case "hang":
    setInterval(() => {}, 1000)
    break
}
