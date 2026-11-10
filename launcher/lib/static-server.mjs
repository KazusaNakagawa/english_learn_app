// Zero-dependency static server for the built web app. The app uses
// HashRouter, so every route is "/" and no SPA fallback is needed.
import { createReadStream, statSync } from "node:fs"
import { createServer } from "node:http"
import { extname, join, resolve, sep } from "node:path"

/** What /api/health reports, so a second launch can recognise a running copy. */
export const APP_ID = "english-learn-app"

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
}

// Vite puts content-hashed files under assets/; a new build gets new names.
const IMMUTABLE = "public, max-age=31536000, immutable"

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", ...headers })
  res.end(body)
}

/** Map a request path to a file under root, or return an HTTP status. */
function resolveFile(root, rawPath) {
  let path
  try {
    path = decodeURIComponent(rawPath)
  } catch {
    return 400
  }
  if (path.includes("\0")) return 400
  if (path === "/" || path === "") path = "/index.html"
  const file = resolve(root, `.${path}`)
  if (file !== root && !file.startsWith(root + sep)) return 403
  return file
}

/**
 * Build (but do not start) the HTTP server.
 * @param {{ root: string, version: string }} options
 */
export function createAppServer({ root, version }) {
  const base = resolve(root)
  return createServer((req, res) => {
    res.setHeader("x-content-type-options", "nosniff")
    const pathname = (req.url ?? "/").split("?")[0]

    if (req.method !== "GET" && req.method !== "HEAD") {
      return send(res, 405, "Method Not Allowed", { allow: "GET, HEAD" })
    }

    if (pathname === "/api/health") {
      return send(res, 200, req.method === "HEAD" ? "" : JSON.stringify({ app: APP_ID, version }), {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      })
    }

    const file = resolveFile(base, pathname)
    if (typeof file === "number") return send(res, file, file === 400 ? "Bad Request" : "Forbidden")

    let stat
    try {
      stat = statSync(file)
    } catch {
      return send(res, 404, "Not Found")
    }
    if (!stat.isFile()) return send(res, 404, "Not Found")

    const inAssets = file.startsWith(join(base, "assets") + sep)
    res.writeHead(200, {
      "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
      "content-length": stat.size,
      "cache-control": inAssets ? IMMUTABLE : "no-cache",
    })
    if (req.method === "HEAD") return res.end()
    createReadStream(file)
      .on("error", () => res.destroy())
      .pipe(res)
  })
}
