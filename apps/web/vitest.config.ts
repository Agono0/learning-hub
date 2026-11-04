import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      // mirror apps/web/tsconfig.json paths so route modules resolve in vitest
      '@learning-hub/core/media': resolve(here, '../../packages/core/src/media.ts'),
      '@learning-hub/core/ai': resolve(here, '../../packages/core/src/ai.ts'),
      '@learning-hub/core': resolve(here, '../../packages/core/src/index.ts'),
      '@learning-hub/db': resolve(here, '../../packages/db/src/index.ts'),
      '@': resolve(here, 'src'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
    environment: 'node',
  },
})
