import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    // mirror apps/web/tsconfig.json paths so route modules resolve in vitest.
    // Regex aliases first: any @learning-hub/core/<domain> subpath works
    // without listing it here (same rules as vitest.e2e.config.mjs).
    alias: [
      {
        find: /^@learning-hub\/core\/(.*)$/,
        replacement: resolve(here, '../../packages/core/src/$1'),
      },
      {
        find: '@learning-hub/core',
        replacement: resolve(here, '../../packages/core/src/index.ts'),
      },
      { find: /^@learning-hub\/db\/(.*)$/, replacement: resolve(here, '../../packages/db/src/$1') },
      { find: '@learning-hub/db', replacement: resolve(here, '../../packages/db/src/index.ts') },
      { find: /^@\/(.*)$/, replacement: resolve(here, 'src/$1') },
    ],
  },
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
    environment: 'node',
  },
})
