// Checks for what the published package may contain. Kept free of side effects
// so the tests can call them; prepare-dist.mjs does the file system work.

// Vite reads web/.env during the build and inlines every VITE_* value it
// references. These two are the developer's own VOICEVOX defaults and must not
// ship to npm, so the build overrides them (process env beats .env in Vite).
const BLANKED = ["VITE_VOICEVOX_ENDPOINT_POC", "VITE_VOICEVOX_API_KEY_POC"]

/** The env for the web build: secrets blanked, version stamped. */
export function scrubbedBuildEnv(env, version) {
  const out = { ...env, VITE_APP_VERSION: version, VITE_APP_ENV: "launcher" }
  for (const name of BLANKED) out[name] = ""
  return out
}

export function checkVersions(launcherVersion, webVersion) {
  if (launcherVersion === webVersion) return []
  return [`launcher/package.json is ${launcherVersion} but web/package.json is ${webVersion} — release them with the same version`]
}

// Short values would match by accident (e.g. "poc"), so they are not checked.
const MIN_SECRET_LENGTH = 8

/** Values of KEY/SECRET/TOKEN/PASSWORD variables in a dotenv file. */
export function readEnvSecrets(text) {
  const out = []
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m || !/(KEY|SECRET|TOKEN|PASSWORD)/i.test(m[1])) continue
    const value = m[2].replace(/^(['"])(.*)\1$/, "$2")
    if (value.length >= MIN_SECRET_LENGTH) out.push(value)
  }
  return out
}

/** Paths (keys of files: path → text) whose contents include any secret. */
export function findLeakedSecrets(files, secrets) {
  if (secrets.length === 0) return []
  return Object.entries(files)
    .filter(([, text]) => secrets.some((s) => text.includes(s)))
    .map(([path]) => path)
}
