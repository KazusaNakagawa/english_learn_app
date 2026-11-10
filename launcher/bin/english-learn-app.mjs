#!/usr/bin/env node
// Entry point for `npx english-learn-app`: serve the built web app on
// 127.0.0.1 and open it in the browser.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { HELP, parseCliArgs, UsageError } from "../lib/args.mjs"
import { launch, openBrowser, PortInUseError } from "../lib/launch.mjs"

const pkgRoot = fileURLToPath(new URL("..", import.meta.url))
const NAME = "english-learn-app"

async function main() {
  let opts
  try {
    opts = parseCliArgs(process.argv.slice(2), process.env)
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`${NAME}: ${err.message}\nTry: ${NAME} --help`)
      return 2
    }
    throw err
  }
  if (opts.help) {
    process.stdout.write(HELP)
    return 0
  }
  const version = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")).version
  if (opts.version) {
    console.log(version)
    return 0
  }

  let result
  try {
    result = await launch({ root: join(pkgRoot, "dist"), port: opts.port, version })
  } catch (err) {
    if (err instanceof PortInUseError) {
      console.error(`${NAME}: ${err.message}`)
      return 1
    }
    throw err
  }

  if (result.status === "already-running") {
    const note = result.runningVersion && result.runningVersion !== version ? ` (version ${result.runningVersion})` : ""
    console.log(`${NAME} is already running${note} at ${result.url}`)
    if (opts.browser) openBrowser(result.url)
    return 0
  }

  console.log(`${NAME} ${version} is running at ${result.url}\nPress Ctrl-C to stop.`)
  if (opts.browser) openBrowser(result.url)

  await new Promise((resolve) => {
    const stop = () => {
      result.server.close(() => resolve())
      // Keep-alive connections from the open tab would otherwise hold close() open.
      result.server.closeAllConnections?.()
    }
    process.once("SIGINT", stop)
    process.once("SIGTERM", stop)
  })
  return 0
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${NAME}: ${err.message}`)
    process.exit(1)
  },
)
