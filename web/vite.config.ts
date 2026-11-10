import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { createApiHandler } from '../launcher/lib/api.mjs'

/**
 * Serve the launcher's local API (/api/health, /api/generate-sentences) from
 * the dev server too, so `npm run dev` can generate sentences with the Claude
 * Code CLI exactly as `npx english-learn-app` does. Dev server only: a
 * production build is static and gets the API from the launcher.
 */
function localApi(): Plugin {
  const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  return {
    name: 'english-learn-local-api',
    apply: 'serve',
    configureServer(server) {
      const api = createApiHandler({ version })
      server.middlewares.use((req, res, next) => {
        if (!api(req, res)) next()
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    localApi(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
