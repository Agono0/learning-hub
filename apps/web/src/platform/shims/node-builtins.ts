/**
 * Tauri-target stand-in for the Node built-ins (`node:fs`, `node:path`,
 * `node:module`, `node:url`, `node:fs/promises`) that shared packages import
 * for their Node-only code paths (db path resolution, fs image store,
 * filesystem plugin scanning). Under Tauri those paths are never taken — the
 * worker passes explicit paths/drivers and uses the DB-backed image store —
 * so these only need to resolve. Anything that *does* reach them fails loudly
 * instead of silently misbehaving.
 *
 * Aliased in next.config.ts for LEARNING_HUB_TARGET=tauri only.
 */
function unavailable(name: string): never {
  throw new Error(`${name} is not available in the Tauri webview`)
}

// node:fs
export const existsSync = (): boolean => false
export const mkdirSync = (): void => unavailable('fs.mkdirSync')
export const readFileSync = (): never => unavailable('fs.readFileSync')
export const readdirSync = (): never => unavailable('fs.readdirSync')
export const statSync = (): never => unavailable('fs.statSync')
// node:fs/promises
export const mkdir = async (): Promise<never> => unavailable('fs.mkdir')
export const writeFile = async (): Promise<never> => unavailable('fs.writeFile')
export const readFile = async (): Promise<never> => unavailable('fs.readFile')
// node:path (pure string helpers — safe to implement)
export const sep = '/'
export const join = (...parts: string[]): string =>
  parts.filter(Boolean).join('/').replace(/\/+/g, '/')
export const resolve = join
export const dirname = (p: string): string => p.replace(/\/[^/]*$/, '') || '/'
export const basename = (p: string): string => p.split('/').pop() ?? ''
export const extname = (p: string): string => /\.[^./]*$/.exec(p)?.[0] ?? ''
// node:module
export const createRequire = (): never => unavailable('module.createRequire')
// node:url
export const pathToFileURL = (p: string): URL => new URL(`file://${p}`)
export const fileURLToPath = (u: string | URL): string => new URL(u).pathname

export default {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  mkdir,
  writeFile,
  readFile,
  sep,
  join,
  resolve,
  dirname,
  basename,
  extname,
  createRequire,
  pathToFileURL,
  fileURLToPath,
}
