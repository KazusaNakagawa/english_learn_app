// Stand-in for the virtual module vite-plugin-pwa generates. Tests that care
// about registration mock 'virtual:pwa-register' themselves.
export function registerSW() {
  return async () => {}
}
