import assert from "node:assert/strict"
import { test } from "node:test"

import { DEFAULT_PORT, parseCliArgs, UsageError } from "../lib/args.mjs"

test("defaults", () => {
  const opts = parseCliArgs([], {})
  assert.equal(opts.port, DEFAULT_PORT)
  assert.equal(opts.browser, true)
  assert.equal(opts.help, false)
  assert.equal(opts.version, false)
})

test("--port and --no-browser override defaults", () => {
  const opts = parseCliArgs(["--port", "6000", "--no-browser"], {})
  assert.equal(opts.port, 6000)
  assert.equal(opts.browser, false)
})

test("--port=<n> form", () => {
  assert.equal(parseCliArgs(["--port=6001"], {}).port, 6001)
})

test("CI disables the browser", () => {
  assert.equal(parseCliArgs([], { CI: "true" }).browser, false)
})

test("--help / -h and --version / -v", () => {
  assert.equal(parseCliArgs(["-h"], {}).help, true)
  assert.equal(parseCliArgs(["--help"], {}).help, true)
  assert.equal(parseCliArgs(["-v"], {}).version, true)
  assert.equal(parseCliArgs(["--version"], {}).version, true)
})

for (const bad of ["0", "65536", "abc", "80.5", "", "-1"]) {
  test(`rejects port ${JSON.stringify(bad)}`, () => {
    assert.throws(() => parseCliArgs(["--port", bad], {}), UsageError)
  })
}

test("accepts boundary ports 1 and 65535", () => {
  assert.equal(parseCliArgs(["--port", "1"], {}).port, 1)
  assert.equal(parseCliArgs(["--port", "65535"], {}).port, 65535)
})

test("rejects unknown flags and positionals", () => {
  assert.throws(() => parseCliArgs(["--nope"], {}), UsageError)
  assert.throws(() => parseCliArgs(["extra"], {}), UsageError)
})
