import { describe, expect, it } from 'vitest'
import { manifest, NETWORK_ONLY } from '../../pwa-manifest'

describe('PWA manifest', () => {
  it('is installable as a standalone app', () => {
    expect(manifest.name).toBeTruthy()
    expect(manifest.short_name).toBeTruthy()
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBeTruthy()
  })

  it('has the 192 and 512 icons and a maskable one', () => {
    const icons = manifest.icons ?? []
    expect(icons.some((i) => i.sizes === '192x192')).toBe(true)
    expect(icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true)
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true)
  })

  it('keeps the launcher API out of the navigation fallback', () => {
    expect(NETWORK_ONLY.some((re) => re.test('/api/generate-sentences'))).toBe(true)
    expect(NETWORK_ONLY.some((re) => re.test('/'))).toBe(false)
    expect(NETWORK_ONLY.some((re) => re.test('/assets/index-abc.js'))).toBe(false)
  })
})
