import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { VitePWA } from 'vite-plugin-pwa'
import { manifest, NETWORK_ONLY } from './pwa-manifest'
import { createApiHandler } from '../launcher/lib/api.mjs'

/**
 * Serve the launcher's local API (/api/health, /api/generate-sentences,
 * /api/tts) from the dev server too, so `npm run dev` can generate sentences
 * with the Claude Code CLI and speak with the local voice exactly as
 * `npx english-learn-app` does. Dev server only: a
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
      // Stop the local voice worker with the dev server.
      server.httpServer?.on('close', () => void api.stop())
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    localApi(),
    VitePWA({
      // The user decides when to reload onto a new version (see PwaUpdateNotice).
      registerType: 'prompt',
      manifest,
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // The zundamon art is the developer's own copy (git-ignored). Precaching
        // it would hand it to every visitor even with VITE_ZUNDAMON_AVATAR off.
        globIgnores: ['zundamon/**'],
        // The app uses HashRouter, so the shell is always index.html.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: NETWORK_ONLY,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
