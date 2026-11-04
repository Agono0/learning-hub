import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Resolve the SQLite database path.
 * Priority: $LEARNING_HUB_DB env var → walk up from cwd to find the repo root
 * (the package.json containing "workspaces") → <repo>/data/learning-hub.db
 */
export function resolveDbPath(): string {
  if (process.env.LEARNING_HUB_DB) return process.env.LEARNING_HUB_DB
  let dir = process.cwd()
  for (let i = 0; i < 10; i++) {
    const pkg = join(dir, 'package.json')
    if (existsSync(pkg)) {
      try {
        const content = readFileSync(pkg, 'utf8')
        if (content.includes('"workspaces"')) return join(dir, 'data', 'learning-hub.db')
      } catch {
        /* fall through */
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return join(process.cwd(), 'data', 'learning-hub.db')
}

/** Directory where uploaded images live. */
export function resolveImagesDir(): string {
  return join(dirname(resolveDbPath()), 'images')
}

