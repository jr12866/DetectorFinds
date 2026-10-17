/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  name: string
  version: string
  description: string
}

/**
 * GitHub Pages serves a project site from a subpath, so every URL the app uses —
 * `base`, the manifest's `start_url`, `scope` and icon `src` values — has to live
 * under it. Local dev and `vite preview` stay at the root.
 */
const PAGES_REPO = 'DetectorFinds'
const isPagesBuild = process.env.GITHUB_PAGES === 'true'
const base = isPagesBuild ? `/${PAGES_REPO}/` : '/'

const icon = (file: string, size: number, purpose: string) => ({
  src: `${base}icons/${file}`,
  sizes: `${size}x${size}`,
  type: 'image/png',
  purpose,
})

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      strategies: 'generateSW',
      // R-UPDATE-1: the user decides when a new version is applied.
      registerType: 'prompt',
      pwaAssets: { disabled: true },
      manifest: {
        name: 'DetectorFinds',
        short_name: 'Finds',
        description: pkg.description,
        // start_url and scope default to `base`, which is what we want; spelled out
        // here because installing fails silently when they drift off the subpath.
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#0f1e2b',
        icons: [
          icon('icon-192.png', 192, 'any'),
          icon('icon-512.png', 512, 'any'),
          icon('maskable-icon-512.png', 512, 'maskable'),
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        // Hash routing means every navigation lands on the same document, so the
        // offline fallback is always index.html.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      // No service worker in `vite dev`: the phone checks go against a deployed build.
      devOptions: { enabled: false },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(String(pkg.version)),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: { host: true },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
})
