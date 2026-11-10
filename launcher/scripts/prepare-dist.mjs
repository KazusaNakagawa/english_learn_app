// Build web/ and copy its output into launcher/dist (runs as `prepack`, so
// `npm publish` in launcher/ is the whole release).
//
//   node scripts/prepare-dist.mjs                   # build web, then copy
//   node scripts/prepare-dist.mjs --skip-web-build  # copy the existing web/dist
//
// --skip-web-build trusts web/dist as it is, including whatever .env it was
// built with; the secret scan below still runs.
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { checkVersions, findLeakedSecrets, readEnvSecrets, scrubbedBuildEnv } from "./verify-dist.mjs"

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

function envSecrets() {
  return readdirSync(webRoot)
    .filter((name) => name.startsWith(".env") && name !== ".env.example")
    .flatMap((name) => readEnvSecrets(readFileSync(join(webRoot, name), "utf8")))
}

function main() {
  const version = readJson(join(pkgRoot, "package.json")).version
  const versionProblems = checkVersions(version, readJson(join(webRoot, "package.json")).version)
  if (versionProblems.length) fail(versionProblems)

  if (!process.argv.includes("--skip-web-build")) {
    step("building web/")
    const res = spawnSync("npm", ["run", "build"], {
      cwd: webRoot,
      stdio: "inherit",
      env: scrubbedBuildEnv(process.env, version),
    })
    if (res.status !== 0) fail(["web build failed"])
  }
  if (!existsSync(join(webDist, "index.html"))) fail([`${webDist}/index.html not found — build web/ first`])

  rmSync(dist, { recursive: true, force: true })
  cpSync(webDist, dist, { recursive: true })

  const files = listFiles(dist)
  const textFiles = Object.fromEntries(
    files
      .filter((p) => /\.(html|js|mjs|css|json|map|txt|svg)$/.test(p))
      .map((p) => [relative(pkgRoot, p).split(sep).join("/"), readFileSync(p, "utf8")]),
  )
  const leaked = findLeakedSecrets(textFiles, envSecrets())
  if (leaked.length) fail(["a secret from web/.env was found in the build — refusing to package:", ...leaked])
  const dotenv = files.filter((p) => /(^|[\\/])\.env/.test(relative(dist, p)))
  if (dotenv.length) fail(["refusing to package .env files:", ...dotenv])

  step(`dist ready (${files.length} files, version ${version})`)
}

main()
