import type { NextConfig } from 'next'

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
 * Browser-side aliases for the Tauri bundle: the hub worker imports the same
 * handlers/packages as the Node server, whose Node-only branches must resolve
 * (but are never executed) inside the webview. See src/platform/shims/*.
 */
const NODE_BUILTINS = ['node:fs', 'node:fs/promises', 'node:path', 'node:module', 'node:url']
const tauriAliases: Record<string, { browser: string }> = {
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
  env: { NEXT_PUBLIC_LEARNING_HUB_TARGET: isTauri ? 'tauri' : 'web' },
  ...(isTauri
    ? {
        output: 'export' as const,
        // pages/layouts are .tsx; API route shims are .ts → dropped from the export
        pageExtensions: ['tsx'],
        images: { unoptimized: true },
        trailingSlash: true,
        distDir: '.next-tauri',
        turbopack: { resolveAlias: tauriAliases },
      }
    : {}),
}

export default nextConfig
