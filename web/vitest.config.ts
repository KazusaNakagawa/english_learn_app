import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  // No .env in this folder, so tests never see the developer's web/.env and
  // pass the same way locally and in CI. Tests stub what they need.
  envDir: fileURLToPath(new URL('./src/test', import.meta.url)),
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
