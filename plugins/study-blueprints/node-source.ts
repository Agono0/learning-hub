/**
 * Node file source for blueprint files (host side only; never import this
 * from browser code).
 *
 * Safety rules, all enforced here and covered by tests:
 * - the base directory is resolved once and its real path is used for checks;
 * - only plain files named `*.json` directly inside it are listed (no
 *   subdirectories, no symlinks, no devices or sockets);
 * - a file whose real path is not inside the base directory is refused, and
 *   files are opened with O_NOFOLLOW where the platform has it;
 * - reads are bounded: at most `maxBytes` are read, and a file that is larger
 *   is refused instead of truncated.
 */
import { constants, promises as fs } from 'node:fs'
import path from 'node:path'
import type { BlueprintFileSource } from '../../packages/core/src/blueprint'

/** Environment variable that overrides the blueprints directory. */
export const BLUEPRINTS_DIR_ENV = 'LEARNING_HUB_BLUEPRINTS_DIR'

/**
 * Resolve the directory: `LEARNING_HUB_BLUEPRINTS_DIR` (relative values resolve
 * against `cwd`), else `<cwd>/blueprints`. Hosts run from the repo root, the
 * same assumption `loadPlugins(['plugins'])` makes.
 */
export function resolveBlueprintDir(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
): string {
  const raw = env[BLUEPRINTS_DIR_ENV]?.trim()
  return path.resolve(cwd, raw ? raw : 'blueprints')
}

/** True when `child` is inside `base` (both absolute, already resolved). */
export function isInside(base: string, child: string): boolean {
  const rel = path.relative(base, child)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/** Create the file source for a directory. A missing directory lists no files. */
export function createNodeBlueprintSource(
  dir: string = resolveBlueprintDir(),
): BlueprintFileSource {
  const base = path.resolve(dir)
  return {
    label: base,
    async list() {
      let realBase: string
      try {
        realBase = await fs.realpath(base)
      } catch {
        return { files: [], skipped: [] }
      }
      const files: string[] = []
      const skipped: { name: string; reason: string }[] = []
      for (const entry of await fs.readdir(realBase, { withFileTypes: true })) {
        const name = entry.name
        if (!name.toLowerCase().endsWith('.json')) continue
        if (name.includes('/') || name.includes('\\') || name.includes('\0')) {
          skipped.push({ name, reason: 'unsafe file name' })
          continue
        }
        if (entry.isSymbolicLink()) {
          skipped.push({ name, reason: 'symbolic links are not followed' })
          continue
        }
        if (!entry.isFile()) {
          skipped.push({ name, reason: 'not a regular file' })
          continue
        }
        files.push(name)
      }
      return { files: files.sort(), skipped }
    },
    async read(name, maxBytes) {
      if (name !== path.basename(name) || name.includes('\0')) throw new Error('unsafe file name')
      const realBase = await fs.realpath(base)
      const target = path.join(realBase, name)
      const real = await fs.realpath(target)
      if (!isInside(realBase, real) || path.dirname(real) !== realBase)
        throw new Error('path escapes the blueprints directory')
      const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
      const handle = await fs.open(real, flags)
      try {
        const stat = await handle.stat()
        if (!stat.isFile()) throw new Error('not a regular file')
        if (stat.size > maxBytes) throw new Error(`larger than ${maxBytes} bytes`)
        const buf = Buffer.alloc(maxBytes + 1)
        const { bytesRead } = await handle.read(buf, 0, maxBytes + 1, 0)
        if (bytesRead > maxBytes) throw new Error(`larger than ${maxBytes} bytes`)
        return buf.subarray(0, bytesRead).toString('utf8')
      } finally {
        await handle.close()
      }
    },
  }
}
