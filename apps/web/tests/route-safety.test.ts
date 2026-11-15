/**
 * Route Safety Test Suite:
 *
 * 1. Scans all UI pages and components in `app/` and `src/` for transport calls
 *    (`apiGet`, `apiSend`, `apiUpload`, `apiStream`, `apiDownload`, `hubFetch`).
 * 2. Asserts that EVERY transport call starts strictly with `/api/` (preventing
 *    relative path 404s like `world/state` -> `http://.../world/state`).
 * 3. Asserts that the target API endpoint matches a registered handler in
 *    `handlers-registry.ts`.
 * 4. Asserts that every navigation link in `nav.ts` points to an existing `page.tsx`.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { matchRoute } from '@/hub/handlers-registry'
import { ALL_NAV_ITEMS } from '@/components/nav'

const WEB_ROOT = resolve(__dirname, '..')
const APP_DIR = resolve(WEB_ROOT, 'app')
const SRC_DIR = resolve(WEB_ROOT, 'src')

interface DiscoveredCall {
  file: string
  line: number
  fn: string
  rawUrl: string
  cleanPath: string
}

function walkSourceFiles(dir: string): string[] {
  const files: string[] = []
  if (!existsSync(dir)) return files

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry !== 'node_modules' && entry !== '.next' && entry !== '.next-tauri') {
        files.push(...walkSourceFiles(full))
      }
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      // Exclude tests, shims, and server handler definitions from client UI call scanning
      if (
        !full.includes('tests') &&
        !full.includes('server' + join('/')) &&
        !full.includes('server\\handlers')
      ) {
        files.push(full)
      }
    }
  }
  return files
}

function extractTransportCalls(filePath: string): DiscoveredCall[] {
  const code = readFileSync(filePath, 'utf8')
  const lines = code.split('\n')
  const results: DiscoveredCall[] = []

  // Regex matches: apiGet(...), apiSend<T>(...), apiUpload(...), apiDownload(...), apiStream(...), hubFetch(...)
  const callRegex =
    /\b(apiGet|apiSend|apiUpload|apiStream|apiDownload|hubFetch)\s*(?:<[^>]+>)?\s*\(\s*(['"`][^'"`\n]+['"`]|`[^`\n]+`)/g

  lines.forEach((lineText, idx) => {
    let match: RegExpExecArray | null
    while ((match = callRegex.exec(lineText)) !== null) {
      const fn = match[1]
      const rawArg = match[2].trim()

      // Strip outer quotes or backticks
      let urlPattern = rawArg.slice(1, -1)

      // Strip query string if present
      const queryIdx = urlPattern.indexOf('?')
      if (queryIdx !== -1) {
        urlPattern = urlPattern.slice(0, queryIdx)
      }

      results.push({
        file: filePath.replace(WEB_ROOT, ''),
        line: idx + 1,
        fn,
        rawUrl: rawArg,
        cleanPath: urlPattern,
      })
    }
  })

  return results
}

describe('Route Safety & Transport Scan', () => {
  const sourceFiles = [...walkSourceFiles(APP_DIR), ...walkSourceFiles(SRC_DIR)]
  const allCalls: DiscoveredCall[] = []

  for (const f of sourceFiles) {
    allCalls.push(...extractTransportCalls(f))
  }

  it('scans all UI transport calls across pages and components', () => {
    expect(allCalls.length).toBeGreaterThan(30)
  })

  it('ensures all transport calls start with "/api/" (no relative or malformed URLs)', () => {
    const invalidCalls: DiscoveredCall[] = []

    for (const call of allCalls) {
      // Allow dynamic variable paths if starting with variable (e.g. `url`), but all literal string paths must start with `/api/`
      if (
        call.rawUrl.startsWith("'") ||
        call.rawUrl.startsWith('"') ||
        call.rawUrl.startsWith('`')
      ) {
        // If it starts with template literal interpolation like `${url}`, skip
        if (call.cleanPath.startsWith('${')) continue

        if (!call.cleanPath.startsWith('/api/')) {
          invalidCalls.push(call)
        }
      }
    }

    if (invalidCalls.length > 0) {
      const report = invalidCalls
        .map(
          (c) => `[Line ${c.line}] ${c.file}: ${c.fn}(${c.rawUrl}) -> cleanPath: "${c.cleanPath}"`,
        )
        .join('\n')
      expect.fail(
        `Found ${invalidCalls.length} transport call(s) missing "/api/" prefix:\n${report}`,
      )
    }
  })

  it('ensures transport call paths resolve against registered API routes', () => {
    const unmatchedCalls: DiscoveredCall[] = []

    for (const call of allCalls) {
      if (call.cleanPath.startsWith('${')) continue
      if (!call.cleanPath.startsWith('/api/')) continue

      // Normalize dynamic interpolation: replace ${...} with a dummy id '1' or check route matching
      const testPath = call.cleanPath.replace(/\$\{[^}]+\}/g, '1')

      // Check if matchRoute matches any supported HTTP method
      const matched =
        matchRoute('GET', testPath) ||
        matchRoute('POST', testPath) ||
        matchRoute('PUT', testPath) ||
        matchRoute('PATCH', testPath) ||
        matchRoute('DELETE', testPath)

      if (!matched) {
        unmatchedCalls.push(call)
      }
    }

    if (unmatchedCalls.length > 0) {
      const report = unmatchedCalls
        .map(
          (c) => `[Line ${c.line}] ${c.file}: ${c.fn}(${c.rawUrl}) -> normalized: "${c.cleanPath}"`,
        )
        .join('\n')
      expect.fail(
        `Found ${unmatchedCalls.length} transport call(s) that do not match any registered API route:\n${report}`,
      )
    }
  })

  it('ensures all navigation links in nav.ts point to an existing page.tsx', () => {
    const missingPages: string[] = []

    for (const item of ALL_NAV_ITEMS) {
      const href = item.href // e.g. '/', '/world', '/curriculum'
      const relativePagePath = href === '/' ? 'page.tsx' : `${href.replace(/^\//, '')}/page.tsx`
      const expectedPath = join(APP_DIR, relativePagePath)

      if (!existsSync(expectedPath)) {
        missingPages.push(`${item.label} (${href}) -> expected ${expectedPath}`)
      }
    }

    expect(missingPages).toEqual([])
  })
})
