/**
 * Query `limit` parsing: a non-numeric value used to become NaN, which SQLite
 * binds as NULL, and LIMIT NULL returns every row. Synthetic rows only.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { intParam } from '../src/server/query-params'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-query-limit-')), 'q.db')

describe('intParam', () => {
  const o = { fallback: 10, min: 1, max: 50 }
  it('uses the fallback for missing, blank and non-numeric input', () => {
    for (const raw of [
      null,
      undefined,
      '',
      '   ',
      'abc',
      'NaN',
      'Infinity',
      '-Infinity',
      '1e999',
    ]) {
      expect(intParam(raw, o), String(raw)).toBe(10)
    }
  })
  it('floors fractions and clamps to the bounds', () => {
    expect(intParam('7.9', o)).toBe(7)
    expect(intParam('0', o)).toBe(1)
    expect(intParam('-5', o)).toBe(1)
    expect(intParam('9999', o)).toBe(50)
    expect(intParam('25', o)).toBe(25)
  })
  it('clamps an out-of-range fallback too', () => {
    expect(intParam(null, { fallback: 500, min: 1, max: 20 })).toBe(20)
  })
})

type Handler = (req: Request) => Promise<Response>
const handlers: Record<string, Handler> = {}

beforeAll(async () => {
  const D = await import('@learning-hub/db')
  handlers.plots = (await import('../src/server/handlers/world/plots/route')).GET as Handler
  handlers.duels = (await import('../src/server/handlers/social/duels/route')).GET as Handler
  handlers.guilds = (await import('../src/server/handlers/social/guilds/route')).GET as Handler
  handlers.capture = (await import('../src/server/handlers/hud/capture/route')).GET as Handler
  D.db.transaction((tx) => {
    for (let i = 0; i < 230; i++) tx.insert(D.forestPlots).values({}).run()
    for (let i = 0; i < 70; i++) {
      tx.insert(D.reviewDuels)
        .values({ player1Alias: `a${i}`, player2Alias: `b${i}` })
        .run()
      tx.insert(D.guilds)
        .values({ name: `guild-${i}`, tag: 'T' })
        .run()
    }
    for (let i = 0; i < 130; i++)
      tx.insert(D.quickCaptures)
        .values({ text: `c${i}` })
        .run()
  })
})

async function count(name: string, key: string, query: string): Promise<number> {
  const res = await handlers[name]!(new Request(`http://localhost/api/x${query}`))
  expect(res.status).toBe(200)
  return ((await res.json()) as Record<string, unknown[]>)[key]!.length
}

const cases: Array<[name: string, key: string, def: number, max: number]> = [
  ['plots', 'plots', 100, 200],
  ['duels', 'duels', 10, 50],
  ['guilds', 'guilds', 20, 50],
  ['capture', 'captures', 50, 100],
]

describe.each(cases)('GET %s limit', (name, key, def, max) => {
  it('defaults and caps', async () => {
    expect(await count(name, key, '')).toBe(def)
    expect(await count(name, key, '?limit=100000')).toBe(max)
  })
  it('does not let a non-numeric or non-finite limit return every row', async () => {
    for (const bad of ['abc', 'NaN', 'Infinity', '']) {
      expect(await count(name, key, `?limit=${bad}`), bad).toBe(def)
    }
  })
  it('clamps a negative limit to one row', async () => {
    expect(await count(name, key, '?limit=-1')).toBe(1)
  })
})
