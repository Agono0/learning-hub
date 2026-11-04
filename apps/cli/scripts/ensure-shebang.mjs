/**
 * Ensures the emitted CLI entry point carries the `#!/usr/bin/env node` shebang
 * required by the `bin` field on Unix. tsc preserves a shebang that exists in the
 * source; apps/cli/src/index.ts currently starts with a JSDoc comment instead,
 * so this step adds one to dist/index.js if (and only if) the output lacks it.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const entry = new URL('../dist/index.js', import.meta.url)
const source = readFileSync(entry, 'utf8')
if (!source.startsWith('#!')) {
  writeFileSync(entry, `#!/usr/bin/env node\n${source}`)
  console.log('cli: shebang added to dist/index.js')
} else {
  console.log('cli: shebang preserved from source')
}
