/**
 * Headless-server composition guard (TD-11 regression test).
 *
 * `apps/server/src/index.ts` does `import { dispatch, routes } from './routes'`,
 * which binds to `routes.ts` — NOT `routes/index.ts` — under bundler module
 * resolution. The TD-11 split therefore only works while `routes.ts` stays a
 * pure re-export of the area modules. A merge that resurrects a monolithic
 * `routes.ts` (or an area module that stops being concatenated) would compile
 * fine and pass every functional test that exercises a still-registered path,
 * while silently dropping the rest of the table. This test pins the whole
 * composition: every area table contributes, nothing is duplicated, and the
 * parity domains shipped in TD-11 are actually reachable.
 */
import { describe, expect, it } from 'vitest'
import { dispatch, prototypeExemplarRouteJson, routes } from '../../../apps/server/src/routes'
import { advancedRoutes } from '../../../apps/server/src/routes/advanced'
import { cognitiveRoutes } from '../../../apps/server/src/routes/cognitive'
import { curriculumRoutes } from '../../../apps/server/src/routes/curriculum'
import { focusRoutes } from '../../../apps/server/src/routes/focus'
import { habitsRoutes } from '../../../apps/server/src/routes/habits'
import { ideasRoutes } from '../../../apps/server/src/routes/ideas'
import { interleavingRoutes } from '../../../apps/server/src/routes/interleaving'
import { notesRoutes } from '../../../apps/server/src/routes/notes'
import { feedbackRoutes } from '../../../apps/server/src/routes/feedback'
import { reviewRoutes } from '../../../apps/server/src/routes/review'
import { studiosRoutes } from '../../../apps/server/src/routes/studios'
import { systemRoutes } from '../../../apps/server/src/routes/system'

const AREA_TABLES = [
  ['system', systemRoutes],
  ['review', reviewRoutes],
  ['interleaving', interleavingRoutes],
  ['cognitive', cognitiveRoutes],
  ['advanced', advancedRoutes],
  ['studios', studiosRoutes],
  ['curriculum', curriculumRoutes],
  ['ideas', ideasRoutes],
  ['focus', focusRoutes],
  ['habits', habitsRoutes],
  ['notes', notesRoutes],
  ['feedback', feedbackRoutes],
] as const

describe('headless server route composition (TD-11 guard)', () => {
  it('routes.ts re-exports the real dispatcher surface', () => {
    expect(typeof dispatch).toBe('function')
    expect(typeof prototypeExemplarRouteJson).toBe('function')
  })

  it('every area table is concatenated into the aggregate route list', () => {
    const total = AREA_TABLES.reduce((n, [, table]) => n + table.length, 0)
    expect(routes.length).toBe(total)
    for (const [name, table] of AREA_TABLES) {
      expect(table.length, `${name}Routes must not be empty`).toBeGreaterThan(0)
      for (const entry of table) {
        expect(
          routes.some((r) => r.method === entry.method && r.path === entry.path),
          `${entry.method} ${entry.path} from ${name}Routes missing from the aggregate`,
        ).toBe(true)
      }
    }
  })

  it('has no duplicate method+path registrations', () => {
    const seen = new Set<string>()
    for (const r of routes) {
      const key = `${r.method} ${r.path}`
      expect(seen.has(key), `duplicate registration: ${key}`).toBe(false)
      seen.add(key)
    }
  })

  it('every route exposes a summary and a handler', () => {
    for (const r of routes) {
      expect(r.summary.length, `summary missing for ${r.method} ${r.path}`).toBeGreaterThan(0)
      expect(typeof r.handler).toBe('function')
    }
  })

  it('the TD-11 parity domains are reachable (curriculum/ideas/focus/habits/notes)', () => {
    const paths = new Set(routes.map((r) => r.path))
    for (const p of [
      '/curriculum/courses',
      '/curriculum/import',
      '/curriculum/export',
      '/ideas',
      '/ideas/search',
      '/focus/today',
      '/focus/session/start',
      '/habits',
      '/habits/check-in',
      '/notes',
      '/notes/detail',
    ]) {
      expect(paths.has(p), `parity route missing: ${p}`).toBe(true)
    }
  })
})
