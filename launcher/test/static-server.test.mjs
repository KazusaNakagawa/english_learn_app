import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { request } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, test } from "node:test"

import { APP_ID, createAppServer } from "../lib/static-server.mjs"

let root
let outside
let server
let port

before(async () => {
  const base = mkdtempSync(join(tmpdir(), "ela-static-"))
  root = join(base, "dist")
  outside = join(base, "secret.txt")
  mkdirSync(join(root, "assets"), { recursive: true })
  writeFileSync(join(root, "index.html"), "<!doctype html><title>app</title>")
  writeFileSync(join(root, "assets", "index-abc123.js"), "console.log(1)")
  writeFileSync(join(root, "assets", "index-abc123.css"), "body{}")
  writeFileSync(join(root, "assets", "font.woff2"), "x")
  writeFileSync(join(root, "assets", "blob.unknownext"), "x")
  writeFileSync(outside, "do not serve")
  server = createAppServer({ root, version: "9.9.9" })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  port = server.address().port
})

after(async () => {
  await new Promise((r) => server.close(r))
  rmSync(join(root, ".."), { recursive: true, force: true })
})

// fetch() normalises "../" away, so raw paths go through http.request.
function get(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method }, (res) => {
      let body = ""
      res.setEncoding("utf8")
      res.on("data", (c) => (body += c))
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })
    req.on("error", reject)
    req.end()
  })
}

test("/ serves index.html without caching", async () => {
  const res = await get("/")
  assert.equal(res.status, 200)
  assert.match(res.headers["content-type"], /^text\/html/)
  assert.equal(res.headers["cache-control"], "no-cache")
  assert.match(res.body, /<title>app<\/title>/)
})

test("/index.html is the same page", async () => {
  const res = await get("/index.html")
  assert.equal(res.status, 200)
  assert.match(res.body, /<title>app<\/title>/)
})

test("query strings are ignored", async () => {
  assert.equal((await get("/?x=1")).status, 200)
})

test("hashed assets get a long immutable cache and the right type", async () => {
  const js = await get("/assets/index-abc123.js")
  assert.equal(js.status, 200)
  assert.match(js.headers["content-type"], /^text\/javascript/)
  assert.match(js.headers["cache-control"], /immutable/)
  assert.match((await get("/assets/index-abc123.css")).headers["content-type"], /^text\/css/)
  assert.equal((await get("/assets/font.woff2")).headers["content-type"], "font/woff2")
})

test("unknown extensions fall back to octet-stream", async () => {
  assert.equal((await get("/assets/blob.unknownext")).headers["content-type"], "application/octet-stream")
})

test("every response says nosniff", async () => {
  assert.equal((await get("/")).headers["x-content-type-options"], "nosniff")
  assert.equal((await get("/missing")).headers["x-content-type-options"], "nosniff")
})

test("missing files are 404", async () => {
  assert.equal((await get("/missing.js")).status, 404)
  assert.equal((await get("/assets/")).status, 404)
})

for (const path of ["/../secret.txt", "/assets/../../secret.txt", "/%2e%2e/secret.txt", "/..%2fsecret.txt"]) {
  test(`path traversal ${path} is refused`, async () => {
    const res = await get(path)
    assert.ok([400, 403, 404].includes(res.status), `status ${res.status}`)
    assert.doesNotMatch(res.body, /do not serve/)
  })
}

test("malformed percent-encoding is 400", async () => {
  assert.equal((await get("/%E0%A4%A")).status, 400)
})

test("NUL bytes are 400", async () => {
  assert.equal((await get("/index.html%00.js")).status, 400)
})

test("HEAD returns headers without a body", async () => {
  const res = await get("/", "HEAD")
  assert.equal(res.status, 200)
  assert.equal(res.body, "")
})

test("other methods are 405", async () => {
  const res = await get("/", "POST")
  assert.equal(res.status, 405)
  assert.equal(res.headers.allow, "GET, HEAD")
})

test("/api/health identifies the app and version", async () => {
  const res = await get("/api/health")
  assert.equal(res.status, 200)
  assert.match(res.headers["content-type"], /^application\/json/)
  assert.equal(res.headers["cache-control"], "no-store")
  assert.deepEqual(JSON.parse(res.body), { app: APP_ID, version: "9.9.9" })
})
