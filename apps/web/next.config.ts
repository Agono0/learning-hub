import { readFileSync } from 'node:fs'
import type { NextConfig } from 'next'

/**
 * App version baked into the bundle for Settings > Updates (O1-14). Read from
 * `apps/web/package.json` at config time; falls back to `''` (the UI shows a
 * neutral "dev" label) when the file cannot be read.
 */
function appVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version?: string }
    return pkg.version ?? ''
  } catch {
    return ''
  }
}

/**
 * ONE app, two build targets — selected by LEARNING_HUB_TARGET:
 *
 * - `web` (default): `next dev` / `next build` — Node server, app/api/** route
 *   shims serve the handlers on better-sqlite3.
 * - `tauri`: static export (`out/`) bundled into the Tauri shell for Windows +
 *   Android. Route shims (`route.ts`) are excluded via pageExtensions — the
 *   in-webview hub worker (src/hub/worker.ts) serves the SAME handlers on
 *   sqlite-wasm, reached through src/lib/transport.ts. Pages are identical in
 *   both targets, so every UI change ships to desktop and mobile untouched.
 */
const isTauri = process.env.LEARNING_HUB_TARGET === 'tauri'

/**
 * Browser-side aliases (BOTH targets): the hub worker is part of the client
 * bundle in web mode too (transport.ts constructs it lazily; Turbopack still
 * bundles it), and its import graph reaches Node-only branches that must
 * RESOLVE in the browser even though they never execute there. See
 * src/platform/shims/*.
 */
const NODE_BUILTINS = ['node:fs', 'node:fs/promises', 'node:path', 'node:module', 'node:url']
const browserAliases: Record<string, { browser: string }> = {
  'better-sqlite3': { browser: './src/platform/shims/better-sqlite3.ts' },
  '@sqlite.org/sqlite-wasm': { browser: './src/platform/shims/sqlite-wasm.ts' },
  ...Object.fromEntries(
    NODE_BUILTINS.map((m) => [m, { browser: './src/platform/shims/node-builtins.ts' }]),
  ),
}

const nextConfig: NextConfig = {
  // better-sqlite3 is auto-externalized, but be explicit (harmless)
  serverExternalPackages: ['better-sqlite3', 'unpdf'],
  // Transpile the workspace TS packages (no build step needed)
  transpilePackages: ['@learning-hub/core', '@learning-hub/db'],
  devIndicators: false,
  env: {
    NEXT_PUBLIC_LEARNING_HUB_TARGET: isTauri ? 'tauri' : 'web',
    // Build-time update flavor (O1-12): CI sets LH_UPDATE_CHANNEL=play for
    // store builds (self-update off); unset/unknown → 'nightly', self-update
    // on (sideload/dev default). Read once in src/lib/updates.ts.
    LH_UPDATE_CHANNEL: process.env.LH_UPDATE_CHANNEL ?? '',
    // Static base app version from package.json (0.1.0). Dynamic nightly
    // versions (e.g. 20261124-abc1234) are written to a static version.json at
    // export time and resolved dynamically at runtime, avoiding chunk re-hashing
    // on unchanged routes.
    LH_APP_VERSION: appVersion(),
  },
  turbopack: { resolveAlias: browserAliases },
  ...(isTauri
    ? {
        output: 'export' as const,
        // pages/layouts are .tsx; API route shims are .ts → dropped from the export
        pageExtensions: ['tsx'],
        images: { unoptimized: true },
        trailingSlash: true,
        distDir: '.next-tauri',
        // Deterministic build ID for the OTA export. Next's default random
        // buildId is embedded in EVERY prerendered HTML page and RSC payload
        // (`/_next/static/<buildId>/…`), so a fresh build re-hashed the whole
        // HTML surface even for a zero-code change — a docs-only nightly shipped
        // a ~2.3 MB "hot patch" of nothing but buildId churn (docs/updates.md
        // §"Measured hot patch size"). A fixed ID makes unchanged pages hash
        // identically across builds; the A/B slot swap is atomic, so a stable
        // ID is safe here (unlike a normal web deploy that relies on unique IDs
        // for cache-busting). Content-hashed chunk names are already stable.
        generateBuildId: () => 'lh-tauri',
      }
    : {}),
}

export default nextConfig
