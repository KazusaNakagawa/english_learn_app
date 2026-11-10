import assert from "node:assert/strict"
import { createServer } from "node:http"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, test } from "node:test"

import { launch, PortInUseError } from "../lib/launch.mjs"
import { APP_ID } from "../lib/static-server.mjs"

let root

before(() => {
  root = join(mkdtempSync(join(tmpdir(), "ela-launch-")), "dist")
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, "index.html"), "<!doctype html>")
})

after(() => rmSync(join(root, ".."), { recursive: true, force: true }))

const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)))
const close = (srv) => new Promise((r) => srv.close(r))

test("starts on 127.0.0.1 and reports the URL", async () => {
  // Port 0 lets the OS pick, so no other process can take it in between.
  const result = await launch({ root, port: 0, version: "1.0.0" })
  try {
    assert.equal(result.status, "started")
    const { port } = result.server.address()
    assert.ok(port > 0)
    assert.equal(result.url, `http://127.0.0.1:${port}/`)
    assert.equal(result.server.address().address, "127.0.0.1")
    const res = await fetch(result.url)
    assert.equal(res.status, 200)
  } finally {
    await close(result.server)
  }
})

test("a busy port held by this app reports already-running instead of failing", async () => {
  const other = createServer((req, res) => {
    res.setHeader("content-type", "application/json")
    res.end(JSON.stringify({ app: APP_ID, version: "0.0.1" }))
  })
  const port = await listen(other)
  try {
    const result = await launch({ root, port, version: "1.0.0" })
    assert.equal(result.status, "already-running")
    assert.equal(result.url, `http://127.0.0.1:${port}/`)
    assert.equal(result.runningVersion, "0.0.1")
  } finally {
    await close(other)
  }
})

test("a busy port held by another program throws PortInUseError", async () => {
  const other = createServer((req, res) => res.end("something else"))
  const port = await listen(other)
  try {
    await assert.rejects(launch({ root, port, version: "1.0.0" }), (err) => {
      assert.ok(err instanceof PortInUseError)
      assert.match(err.message, new RegExp(String(port)))
      assert.match(err.message, /--port/)
      return true
    })
  } finally {
    await close(other)
  }
})

test("a missing dist directory is reported before listening", async () => {
  await assert.rejects(launch({ root: join(root, "nope"), port: 1, version: "1.0.0" }), /index\.html/)
})
