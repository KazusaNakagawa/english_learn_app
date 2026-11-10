// Checks for what the published package may contain. Kept free of side effects
// so the tests can call them; prepare-dist.mjs does the file system work.
import { parseEnv } from "node:util"

// Vite reads web/.env* during the build and inlines every VITE_* value the
// code references. Those are the developer's own settings (a private VOICEVOX
// endpoint, its API key), so every VITE_* is blanked except these two, which
// the launcher sets itself. An allowlist keeps a variable added later from
// shipping by default.
const STAMPED = { VITE_APP_VERSION: null, VITE_APP_ENV: "launcher" }

const isVite = (name) => name.startsWith("VITE_")
const isStamped = (name) => Object.hasOwn(STAMPED, name)
const looksSecret = (name) => /(KEY|SECRET|TOKEN|PASSWORD)/i.test(name)

/**
 * The env for the web build. Process env beats .env files in Vite, so blanking
 * a name here overrides whatever a file sets for it.
 * @param {Record<string, string|undefined>} env  the current process env
 * @param {string} version  stamped into VITE_APP_VERSION
 * @param {string[]} fileVarNames  names defined in web/.env* files
 */
export function scrubbedBuildEnv(env, version, fileVarNames = []) {
  const out = { ...env }
  for (const name of [...Object.keys(env), ...fileVarNames]) {
    if (isVite(name) && !isStamped(name)) out[name] = ""
  }
  out.VITE_APP_VERSION = version
  out.VITE_APP_ENV = STAMPED.VITE_APP_ENV
  return out
}

export function checkVersions(launcherVersion, webVersion) {
  if (launcherVersion === webVersion) return []
  return [`launcher/package.json is ${launcherVersion} but web/package.json is ${webVersion} — release them with the same version`]
}

/**
 * Parse a dotenv file with Node's own parser, which drops inline `# comments`
 * from unquoted values as Vite's dotenv does, so the scan searches for the
 * value Vite would actually inline.
 */
export function parseEnvFile(text) {
  return parseEnv(text)
}

// Short values would match by accident (e.g. "poc"), so they are not checked.
const MIN_SECRET_LENGTH = 8

/** Values that must not appear in the bundle: every blanked VITE_* and anything secret-named. */
export function valuesToScan(vars) {
  return Object.entries(vars)
    .filter(([name]) => (isVite(name) && !isStamped(name)) || looksSecret(name))
    .map(([, value]) => value)
    .filter((value) => value.length >= MIN_SECRET_LENGTH)
}

/** Paths (keys of files: path → text) whose contents include any secret. */
export function findLeakedSecrets(files, secrets) {
  if (secrets.length === 0) return []
  return Object.entries(files)
    .filter(([, text]) => secrets.some((s) => text.includes(s)))
    .map(([path]) => path)
}
