import { defineConfig } from '@playwright/test'

/**
 * Browser-level smoke suite. Complements the API/CLI/MCP e2e tiers in
 * tests/e2e/ — this one drives real Chromium against `next dev` booted on an
 * isolated DB clone (see tests/ui/setup/with-test-server.mjs).
 *
 * Run: npm run test:ui   (from apps/web)
 */
export default defineConfig({
  testDir: './tests/ui',
  // One worker: the suite shares one server + DB clone, so tests must run in order.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    // Dev machines often run a system proxy (VirtualBox/VPN adapters). Without
    // this, Chromium proxies same-origin fetches to it and every client query
    // hangs — the app looks permanently "loading".
    launchOptions: { args: ['--no-proxy-server'] },
    baseURL: `http://localhost:${process.env.UI_SMOKE_PORT ?? 3100}`,
    // The M18 offline service worker would cache the app shell mid-test and
    // make assertions flaky — block it for determinism.
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'node tests/ui/setup/with-test-server.mjs',
    url: `http://localhost:${process.env.UI_SMOKE_PORT ?? 3100}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
