import type { ManifestOptions } from 'vite-plugin-pwa'

/** Web App Manifest for the installable build. Kept apart from vite.config.ts so a test can read it. */
export const manifest: Partial<ManifestOptions> = {
  name: 'English Learn App',
  short_name: 'EnglishLearn',
  description: 'Learn English words with example sentences, spoken aloud.',
  display: 'standalone',
  start_url: '.',
  scope: '.',
  theme_color: '#ffffff',
  background_color: '#ffffff',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}

/**
 * Requests the service worker must leave to the network: the launcher API and
 * the speech / generation services. Offline, the app's own error handling
 * reports them.
 */
export const NETWORK_ONLY = [/^\/api\//]
