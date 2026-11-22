#!/usr/bin/env node
// Stands in for kokoro_worker.py in tests. FAKE_TTS_MODE picks the behaviour:
//   ok (default)  ready at once; answers {wav} with the text as the "audio"
//   never-ready   never prints ready
//   crash         exits 3 before ready
//   hang          ready, but never answers
//   die-on-request  ready, then exits 1 on the first request
// Text "unknown" gets an unsupported-text error. FAKE_TTS_PIDFILE records the pid.
import { writeFileSync } from "node:fs"
import { createInterface } from "node:readline"

const mode = process.env.FAKE_TTS_MODE ?? "ok"
if (process.env.FAKE_TTS_PIDFILE) writeFileSync(process.env.FAKE_TTS_PIDFILE, String(process.pid))
const send = (o) => process.stdout.write(`${JSON.stringify(o)}\n`)

if (mode === "crash") {
  process.stderr.write("boom\n")
  process.exit(3)
}
process.stdout.write("noise that is not JSON\n")
if (mode !== "never-ready") send({ ready: true, espeak: true })
if (mode === "never-ready") setInterval(() => {}, 1000)

createInterface({ input: process.stdin }).on("line", (line) => {
  const req = JSON.parse(line)
  if (mode === "hang") return
  if (mode === "die-on-request") process.exit(1)
  if (req.text === "unknown") return send({ id: req.id, error: "unsupported-text", message: "x" })
  send({ id: req.id, wav: Buffer.from(`${req.lang}:${req.text}`).toString("base64") })
})
