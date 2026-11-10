import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

import { APP_ID, createAppServer } from "./static-server.mjs"

// Loopback only: the app holds the user's data and keys in the browser, and
// nothing outside this machine needs to reach it. 127.0.0.1 rather than
// localhost, so the origin (and the stored data) does not depend on whether
// localhost resolves to IPv4 or IPv6.
export const HOST = "127.0.0.1"

export class PortInUseError extends Error {}

const urlFor = (port) => `http://${HOST}:${port}/`

/** Ask whatever holds the port whether it is this app. Returns its version, or null. */
async function probeRunningApp(port) {
  try {
    const res = await fetch(`${urlFor(port)}api/health`, { signal: AbortSignal.timeout(1500) })
    const body = await res.json()
    return body?.app === APP_ID ? String(body.version ?? "") : null
  } catch {
    return null
  }
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, HOST, () => {
      server.off("error", reject)
      resolve()
    })
  })
}

/**
 * Start serving root on HOST:port.
 *
 * A busy port is not an error when the holder is another copy of this app:
 * running the command twice should just reopen the browser. Any other holder
 * is reported, since moving to a different port would show an empty app.
 *
 * @returns {Promise<{status: "started", url: string, server: import("node:http").Server}
 *   | {status: "already-running", url: string, runningVersion: string}>}
 */
export async function launch({ root, port, version }) {
  if (!existsSync(join(root, "index.html"))) {
    throw new Error(`${join(root, "index.html")} not found — the package was published without its built app`)
  }
  const server = createAppServer({ root, version })
  try {
    await listen(server, port)
  } catch (err) {
    if (err.code !== "EADDRINUSE") throw err
    const runningVersion = await probeRunningApp(port)
    if (runningVersion !== null) return { status: "already-running", url: urlFor(port), runningVersion }
    throw new PortInUseError(
      `port ${port} is already in use by another program. Stop that program, or run with --port <n> ` +
        `(a different port starts with an empty word list, because the browser stores data per port).`,
    )
  }
  return { status: "started", url: urlFor(port), server }
}

export function openBrowser(url) {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]]
  const child = spawn(cmd, args, { stdio: "ignore", detached: true })
  child.on("error", () => {}) // best effort: no opener installed is fine
  child.unref()
}
