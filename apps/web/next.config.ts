import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // better-sqlite3 is auto-externalized, but be explicit (harmless)
  serverExternalPackages: ['better-sqlite3', 'unpdf'],
  // Transpile the workspace TS packages (no build step needed)
  transpilePackages: ['@learning-hub/core', '@learning-hub/db'],
  // PWA via Serwist comes in the polish phase (requires webpack; Next 16 defaults to Turbopack)
  devIndicators: false,
}

export default nextConfig
