// Build web/ and copy its output into launcher/dist (runs as `prepack`, so
// `npm publish` in launcher/ is the whole release).
//
// It always rebuilds: an existing web/dist may have been built with the
// developer's .env inlined, so it is never packaged as is. Run with Node 20.12+
// (util.parseEnv).
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { checkVersions, expandEnvRefs, findLeakedSecrets, parseEnvFile, scrubbedBuildEnv, valuesToScan } from "./verify-dist.mjs"

const pkgRoot = fileURLToPath(new URL("..", import.meta.url))
const webRoot = join(pkgRoot, "..", "web")
const webDist = join(webRoot, "dist")
const dist = join(pkgRoot, "dist")

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"))
const step = (msg) => console.log(`prepare-dist: ${msg}`)

function fail(lines) {
  rmSync(dist, { recursive: true, force: true })
  console.error(`prepare-dist: ${lines.join("\n  ")}`)
  process.exit(1)
}

function listFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...listFiles(p))
    else out.push(p)
  }
  return out
}

/** Every variable the developer's web/.env* files define (a later file wins on a clash). */
function envFileVars() {
  return Object.assign(
    {},
    ...readdirSync(webRoot)
      .filter((name) => name.startsWith(".env") && name !== ".env.example")
      .map((name) => parseEnvFile(readFileSync(join(webRoot, name), "utf8"))),
  )
}

function main() {
  const version = readJson(join(pkgRoot, "package.json")).version
  const versionProblems = checkVersions(version, readJson(join(webRoot, "package.json")).version)
  if (versionProblems.length) fail(versionProblems)

  const fileVars = envFileVars()
  step("building web/")
  const res = spawnSync("npm", ["run", "build"], {
    cwd: webRoot,
    stdio: "inherit",
    env: scrubbedBuildEnv(process.env, version, Object.keys(fileVars)),
    // npm is npm.cmd on Windows, which Node only starts through a shell.
    shell: process.platform === "win32",
  })
  if (res.status !== 0) fail([`web build failed${res.error ? `: ${res.error.message}` : ""}`])
  if (!existsSync(join(webDist, "index.html"))) fail([`${webDist}/index.html not found — build web/ first`])

  rmSync(dist, { recursive: true, force: true })
  cpSync(webDist, dist, { recursive: true })

  const files = listFiles(dist)
  const textFiles = Object.fromEntries(
    files
      .filter((p) => /\.(html|js|mjs|css|json|map|txt|svg)$/.test(p))
      .map((p) => [relative(pkgRoot, p).split(sep).join("/"), readFileSync(p, "utf8")]),
  )
  const shellVite = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith("VITE_")))
  // Both forms: the raw text, and what Vite inlines after expanding ${VAR}.
  const scanned = [...valuesToScan({ ...shellVite, ...fileVars }), ...valuesToScan(expandEnvRefs(fileVars, process.env))]
  const leaked = findLeakedSecrets(textFiles, [...new Set(scanned)])
  if (leaked.length) fail(["a value from web/.env or a VITE_* variable was found in the build — refusing to package:", ...leaked])
  const dotenv = files.filter((p) => /(^|[\\/])\.env/.test(relative(dist, p)))
  if (dotenv.length) fail(["refusing to package .env files:", ...dotenv])

  step(`dist ready (${files.length} files, version ${version})`)
}

main()
