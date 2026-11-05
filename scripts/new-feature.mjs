#!/usr/bin/env node
/**
 * Scaffold a complete, wired-up feature in one command:
 *
 *   npm run new:feature -- <kebab-name> [--title "Human Title"] [--group Learn|Explore|Discipline|"Create & Analyze"] [--no-page]
 *
 * Generates (and never overwrites existing files):
 *   packages/core/src/<name>/index.ts      pure domain logic (no I/O)
 *   packages/core/src/<name>.ts            public entry → @learning-hub/core/<name>
 *   packages/core/tests/<name>.test.ts     unit test skeleton
 *   apps/web/src/server/handlers/<name>/route.ts   runtime-neutral handler
 *   apps/web/app/api/<name>/route.ts       Next.js route shim (web target)
 *   apps/web/app/<name>/page.tsx           page built from the UI kit
 * and wires:
 *   apps/web/src/hub/handlers-registry.ts  import + add() (native apps)
 *   apps/web/src/components/nav.ts         nav entry (every screen size)
 *
 * Every generated file explains itself — read them, then replace the TODOs.
 * See AGENTS.md → "Add a feature".
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ─── args ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const name = args.find((a) => !a.startsWith('--'))
const flag = (key) => {
  const i = args.indexOf(`--${key}`)
  return i === -1 ? undefined : args[i + 1]
}
if (!name || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
  console.error(
    'usage: npm run new:feature -- <kebab-name> [--title "Title"] [--group Learn] [--no-page]',
  )
  process.exit(2)
}
const camel = name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())
const pascal = camel[0].toUpperCase() + camel.slice(1)
const title =
  flag('title') ??
  name
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
const group = flag('group') ?? 'Create & Analyze'
const withPage = !args.includes('--no-page')

// ─── helpers ────────────────────────────────────────────────────────────────

const created = []
function write(rel, content) {
  const file = join(root, rel)
  if (existsSync(file)) {
    console.log(`  skip    ${rel} (exists)`)
    return
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
  created.push(rel)
  console.log(`  create  ${rel}`)
}

function patch(rel, transform) {
  const file = join(root, rel)
  const before = readFileSync(file, 'utf8')
  const after = transform(before)
  if (after === before) {
    console.log(`  skip    ${rel} (already wired)`)
    return
  }
  writeFileSync(file, after)
  console.log(`  wire    ${rel}`)
}

/** Insert `line` after the LAST line matching `pattern` (keeps blocks grouped). */
function insertAfterLast(text, pattern, line) {
  const lines = text.split('\n')
  let at = -1
  lines.forEach((l, i) => {
    if (pattern.test(l)) at = i
  })
  if (at === -1) throw new Error(`anchor ${pattern} not found`)
  lines.splice(at + 1, 0, line)
  return lines.join('\n')
}

// ─── core domain ────────────────────────────────────────────────────────────

write(
  `packages/core/src/${name}/index.ts`,
  `/**
 * ${title} — pure domain logic (no I/O, no DB, no fetch).
 *
 * Keep everything here deterministic and unit-testable; handlers, MCP tools
 * and the CLI call into it. Cite the research behind any learning-science
 * rule in the JSDoc of the function that implements it.
 */
import { z } from 'zod'

/** Shape of one ${title} item — validated at every boundary. */
export const ${camel}ItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
})
export type ${pascal}Item = z.infer<typeof ${camel}ItemSchema>

/**
 * TODO: replace with the feature's real logic.
 * Example pure function: normalize a title for display.
 */
export function format${pascal}Title(item: ${pascal}Item): string {
  return item.title.trim()
}
`,
)

write(
  `packages/core/src/${name}.ts`,
  `/** Public entry for \`@learning-hub/core/${name}\` — see ./${name}/index.ts. */
export * from './${name}/index'
`,
)

write(
  `packages/core/tests/${name}.test.ts`,
  `import { describe, expect, it } from 'vitest'
import { ${camel}ItemSchema, format${pascal}Title } from '../src/${name}'

describe('${name}', () => {
  it('validates and formats an item', () => {
    const item = ${camel}ItemSchema.parse({ title: '  Hello  ' })
    expect(format${pascal}Title(item)).toBe('Hello')
  })
})
`,
)

// ─── API (handler + shim + native registry) ─────────────────────────────────

write(
  `apps/web/src/server/handlers/${name}/route.ts`,
  `/**
 * /api/${name} — runtime-neutral handler (Request → Response).
 *
 * Runs on Node (via the app/api shim) AND inside the native apps' webview
 * worker (via the hub registry). So: no static node:* imports (lint-enforced),
 * validate every body with zod via readJson, keep logic in @learning-hub/core.
 */
import { z } from 'zod'
import { readJson, withRoute } from '@/lib/api'
import { ${camel}ItemSchema, format${pascal}Title } from '@learning-hub/core/${name}'

/** GET /api/${name} — TODO: return real data (query via a packages/db repo). */
export const GET = withRoute(async () => {
  return Response.json({ items: [] })
})

const createSchema = z.object({ item: ${camel}ItemSchema })

/** POST /api/${name} { item } — TODO: persist inside withTransaction. */
export const POST = withRoute(async (req: Request) => {
  const { item } = await readJson(req, createSchema)
  return Response.json({ ok: true, title: format${pascal}Title(item) })
})
`,
)

write(
  `apps/web/app/api/${name}/route.ts`,
  `// Route shim — the implementation lives in the runtime-neutral handler (@/server/handlers/${name}/route).
export { GET, POST } from '@/server/handlers/${name}/route'

export const runtime = 'nodejs'
`,
)

patch('apps/web/src/hub/handlers-registry.ts', (text) => {
  if (text.includes(`'../server/handlers/${name}/route'`)) return text
  let next = insertAfterLast(
    text,
    /^import \* as \w+ from '\.\.\/server\/handlers\//,
    `import * as ${camel}Route from '../server/handlers/${name}/route'`,
  )
  next = insertAfterLast(next, /^add\('/, `add('${name}', ${camel}Route)`)
  return next
})

// ─── page + nav ─────────────────────────────────────────────────────────────

if (withPage) {
  write(
    `apps/web/app/${name}/page.tsx`,
    `'use client'

/**
 * ${title} page. Data flows through @/lib/transport (HTTP on the web, the
 * in-webview hub worker in the native apps) — never call fetch directly.
 */
import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { apiGet } from '@/lib/transport'
import { EmptyState, PageHeader, Panel } from '@/ui'

interface ${pascal}Response {
  items: { title: string }[]
}

export default function ${pascal}Page() {
  const { data, isLoading } = useQuery({
    queryKey: ['${name}'],
    queryFn: () => apiGet<${pascal}Response>('/api/${name}'),
  })

  return (
    <div className="space-y-4">
      <PageHeader title="${title}" subtitle="TODO: one calm sentence on what this page is for." />
      <Panel>
        {isLoading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : data && data.items.length > 0 ? (
          <ul className="space-y-1">
            {data.items.map((item, i) => (
              <li key={i}>{item.title}</li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Sparkles className="h-6 w-6" />} title="Nothing here yet" />
        )}
      </Panel>
    </div>
  )
}
`,
  )

  patch('apps/web/src/components/nav.ts', (text) => {
    if (text.includes(`href: '/${name}'`)) return text
    const groupAt = text.indexOf(`group: '${group}'`)
    if (groupAt === -1) throw new Error(`nav group "${group}" not found`)
    const closeAt = text.indexOf('\n    ],', groupAt)
    const entry = `\n      { href: '/${name}', label: '${title}', icon: Sparkles },`
    let next = text.slice(0, closeAt) + entry + text.slice(closeAt)
    if (!/\bSparkles\b/.test(next.slice(0, next.indexOf("} from 'lucide-react'")))) {
      next = next.replace("} from 'lucide-react'", "  Sparkles,\n} from 'lucide-react'")
    }
    return next
  })
}

console.log(`
✔ ${title} scaffolded (${created.length} files). Next:
  1. Replace the TODOs (logic in core, persistence in a packages/db repo).
  2. npm run typecheck && npm test
  3. Commit in atomic steps: core logic → handler → page (see AGENTS.md).`)
