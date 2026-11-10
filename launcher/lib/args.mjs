import { parseArgs } from "node:util"

export class UsageError extends Error {}

// The word list lives in IndexedDB/localStorage, which the browser keys by
// origin (scheme + host + port). Changing the port opens an empty app, so the
// default must stay fixed across releases.
export const DEFAULT_PORT = 5280

export const HELP = `Usage: english-learn-app [options]

Serve the English Learn App web version on this machine and open it in the browser.

Options:
  --port <n>       Port to listen on (default: ${DEFAULT_PORT})
                   Your words are stored per port: a different port starts empty.
  --no-browser     Do not open the browser (also skipped when $CI is set)
  -v, --version    Print the version and exit
  -h, --help       Show this help and exit
`

function parsePort(raw) {
  if (!/^\d+$/.test(raw ?? "")) throw new UsageError(`--port must be an integer, got ${JSON.stringify(raw)}`)
  const n = Number(raw)
  if (n < 1 || n > 65535) throw new UsageError(`--port must be between 1 and 65535, got ${n}`)
  return n
}

/** Parse argv (without node and script) into launcher options. */
export function parseCliArgs(argv, env) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: false,
      strict: true,
      options: {
        port: { type: "string" },
        "no-browser": { type: "boolean", default: false },
        version: { type: "boolean", short: "v", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    })
  } catch (err) {
    throw new UsageError(err.message)
  }
  const v = parsed.values
  return {
    port: parsePort(v.port ?? String(DEFAULT_PORT)),
    browser: !v["no-browser"] && !env.CI,
    version: v.version,
    help: v.help,
  }
}
