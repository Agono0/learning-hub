import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    setupFiles: ['./tests/e2e/helpers/setup.ts'],
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, 'apps/web/src/$1') },
      {
        find: /^@learning-hub\/core\/(.*)$/,
        replacement: path.resolve(__dirname, 'packages/core/src/$1'),
      },
      {
        find: '@learning-hub/core',
        replacement: path.resolve(__dirname, 'packages/core/src/index.ts'),
      },
      {
        find: /^@learning-hub\/db\/(.*)$/,
        replacement: path.resolve(__dirname, 'packages/db/src/$1'),
      },
      {
        find: '@learning-hub/db',
        replacement: path.resolve(__dirname, 'packages/db/src/index.ts'),
      },
      { find: '@learning-hub/web', replacement: path.resolve(__dirname, 'apps/web') },
      { find: '@learning-hub/cli', replacement: path.resolve(__dirname, 'apps/cli/src') },
      { find: '@learning-hub/mcp', replacement: path.resolve(__dirname, 'apps/mcp/src') },
    ],
  },
})
