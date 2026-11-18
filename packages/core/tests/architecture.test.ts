/**
 * Core Architecture Guard
 *
 * Mechanically enforces the structural invariants ARCHITECTURE.md promises
 * for `packages/core`, so they cannot rot silently:
 *
 * 1. The runtime import graph of `packages/core/src` is ACYCLIC. Cycles make
 *    initialization order accidental (TDZ hazards, "works by hoisting luck")
 *    and every host imports this barrel — a cycle here is a cycle for
 *    everyone. Type-only edges (`import type` / `export type`) are erased at
 *    runtime and deliberately not counted.
 * 2. `core` imports no workspace package (`@learning-hub/db`,
 *    `@learning-hub/ai-adapters`, `@learning-hub/web`, …) and no AI SDK
 *    module (`ai`, `@ai-sdk/*`) — core is the bottom of the dependency graph.
 *
 * The same pattern as `packages/db/tests/rules-guard.test.ts` (F-24): walk
 * the source, assert the invariant, fail with a readable counterexample.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const srcDir = join(__dirname, '../src')

function walkFiles(dir: string): string[] {
  const results: string[] = []
  const list = readdirSync(dir)
  for (const file of list) {
    const fullPath = join(dir, file)
    if (statSync(fullPath).isDirectory()) {
      results.push(...walkFiles(fullPath))
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      results.push(fullPath)
    }
  }
  return results
}

/**
 * Strip type-only import/export statements (`import type … from`,
 * `export type … from`) — they are erased at runtime and never create an
 * edge. Non-greedy to the closing specifier keeps multi-line statements whole.
 */
function stripTypeOnlyStatements(content: string): string {
  return content.replace(
    /(?:^|\n)\s*(?:import|export)\s+type\b[\s\S]*?from\s*['"][^'"]*['"]/g,
    '\n',
  )
}

/**
 * Runtime import edges (relative specifiers only) after type stripping:
 * default/namespace/named imports, re-exports (`export {…} from`,
 * `export * from`) and dynamic `import('…')` calls.
 */
function runtimeRelativeEdges(content: string): { line: number; spec: string }[] {
  const stripped = stripTypeOnlyStatements(content)

  // Mark line starts so each match can be attributed a 1-based line number.
  const lineStarts: number[] = [0]
  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i] === '\n') lineStarts.push(i + 1)
  }
  const lineOf = (pos: number): number => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid]! <= pos) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }

  const edges: { line: number; spec: string }[] = []
  const forms: RegExp[] = [
    /\bimport\s+(?:\w+|\*\s+as\s+\w+)\s+from\s*['"]([^'"]+)['"]/g, // default / namespace
    /\bimport\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/g, // named (braces may span lines)
    /\bimport\s*['"]([^'"]+)['"]/g, // bare side-effect import
    /\bexport\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/g, // named re-export
    /\bexport\s*\*\s*(?:as\s+\w+\s*)?from\s*['"]([^'"]+)['"]/g, // star re-export
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g, // dynamic import (runtime by definition)
  ]
  for (const re of forms) {
    for (const m of stripped.matchAll(re)) {
      const spec = m[1]!
      if (!spec.startsWith('.')) continue
      edges.push({ line: lineOf(m.index ?? 0), spec })
    }
  }
  return edges
}

/** Resolve a relative specifier to a module id (src-relative, no extension). */
function resolveSpec(fromFile: string, spec: string): string | null {
  const target = resolve(dirname(fromFile), spec)
  const candidates = [
    target.endsWith('.js') ? target.replace(/\.js$/, '.ts') : `${target}.ts`,
    join(target, 'index.ts'),
  ]
  for (const c of candidates) {
    try {
      statSync(c)
      return relative(srcDir, c)
    } catch {
      // try next candidate
    }
  }
  return null
}

function buildEdges(): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>()
  for (const f of walkFiles(srcDir)) {
    const id = relative(srcDir, f)
    for (const { spec } of runtimeRelativeEdges(readFileSync(f, 'utf8'))) {
      const to = resolveSpec(f, spec)
      if (!to) continue // unresolvable (shouldn't happen — typecheck catches it)
      if (!edges.has(id)) edges.set(id, new Set())
      edges.get(id)!.add(to)
    }
  }
  return edges
}

/** Find one cycle via DFS (white/gray/black), or null. */
function findCycle(edges: Map<string, Set<string>>): string[] | null {
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  const parent = new Map<string, string | null>()

  const dfs = (node: string): string[] | null => {
    color.set(node, GRAY)
    for (const next of edges.get(node) ?? []) {
      const state = color.get(next) ?? WHITE
      if (state === GRAY) {
        // Reconstruct the cycle path via the parent chain back to `next`.
        const cycle = [next, node]
        let cur = node
        while (parent.get(cur) !== null && parent.get(cur) !== undefined && parent.get(cur) !== next) {
          cur = parent.get(cur)!
          cycle.unshift(cur)
        }
        return cycle
      }
      if (state === WHITE) {
        parent.set(next, node)
        const found = dfs(next)
        if (found) return found
      }
    }
    color.set(node, BLACK)
    return null
  }

  for (const node of edges.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      parent.set(node, null)
      const found = dfs(node)
      if (found) return found
    }
  }
  return null
}

describe('Core architecture guard', () => {
  it('runtime import graph of packages/core/src is acyclic', () => {
    const edges = buildEdges()
    const cycle = findCycle(edges)
    expect(
      cycle,
      `Runtime import cycle detected: ${cycle?.join(' -> ')}. Break it by moving the shared ` +
        `definitions into a leaf module (see generation/shared.ts), or by re-exporting a ` +
        `sibling through src/index.ts instead of from the importing module.`,
    ).toBeNull()
  })

  it('core imports no workspace package and no AI SDK (bottom of the dependency graph)', () => {
    const forbidden = [/^@learning-hub\//, /^ai$/, /^ai\//, /^@ai-sdk\//]
    const violations: string[] = []
    for (const f of walkFiles(srcDir)) {
      const specs = [...readFileSync(f, 'utf8').matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)].map(
        (m) => m[1]!,
      )
      for (const spec of specs) {
        if (forbidden.some((re) => re.test(spec))) {
          violations.push(`${relative(srcDir, f)}: ${spec}`)
        }
      }
    }
    expect(violations, `Forbidden imports in packages/core/src:\n${violations.join('\n')}`).toEqual(
      [],
    )
  })
})
