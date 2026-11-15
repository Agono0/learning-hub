/**
 * Guards the "one codebase, two runtimes" contract: every method exported by
 * an app/api/** route shim (served by Next.js in the browser) must also be
 * registered in the hub worker's static registry (served in-webview under
 * Tauri). A new API route without registry coverage fails here, not on a
 * user's phone.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HUB_METHODS, matchRoute, registeredRoutes } from '@/hub/handlers-registry'

const API_DIR = resolve(__dirname, '../app/api')

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...routeFiles(full))
    else if (entry === 'route.ts') out.push(full)
  }
  return out
}

/** Methods a route shim exports, read from source (no Next runtime needed). */
function exportedMethods(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  return HUB_METHODS.filter((m) =>
    new RegExp(
      `export\\s+(?:const|async\\s+function|function)\\s+${m}\\b|export\\s*\\{[^}]*\\b${m}\\b`,
    ).test(src),
  )
}

describe('hub handler registry', () => {
  const files = routeFiles(API_DIR)

  it('finds the API route tree', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('registers every method of every app/api route', () => {
    const registered = new Set(registeredRoutes().map((r) => `${r.method} ${r.path}`))
    const missing: string[] = []
    for (const file of files) {
      const rel = relative(API_DIR, file).split(sep).slice(0, -1).join('/')
      const path = '/api/' + rel
      for (const method of exportedMethods(file)) {
        if (!registered.has(`${method} ${path}`)) missing.push(`${method} ${path}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('has a Next.js shim for every registered handler method (web target)', () => {
    // The reverse direction: a handler registered for the native hub but with no
    // app/api shim works in Tauri yet 404s in the browser.
    const shimmed = new Set<string>()
    for (const file of files) {
      const rel = relative(API_DIR, file).split(sep).slice(0, -1).join('/')
      for (const method of exportedMethods(file)) shimmed.add(`${method} /api/${rel}`)
    }
    const missing = registeredRoutes()
      .map((r) => `${r.method} ${r.path}`)
      .filter((key) => !shimmed.has(key))
    expect(missing).toEqual([])
  })

  it('prefers literal segments over dynamic ones', () => {
    const literal = matchRoute('POST', '/api/cards/bullet')
    expect(literal?.params).toEqual({})
    const dynamic = matchRoute('GET', '/api/cards/42')
    expect(dynamic?.params).toEqual({ id: '42' })
  })

  it('serves HEAD via GET and rejects non-/api paths', () => {
    expect(matchRoute('HEAD', '/api/decks')).not.toBeNull()
    expect(matchRoute('GET', '/decks')).toBeNull()
    expect(matchRoute('GET', '/api/does-not-exist')).toBeNull()
  })
})
