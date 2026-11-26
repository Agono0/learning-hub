/**
 * Interference through its web handler, page, nav entry, MCP tools and CLI
 * command, against one temp SQLite DB.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import React from 'react'
import { renderToString } from 'react-dom/server'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-inf-web-')), 'i.db')

type Route = typeof import('../src/server/handlers/interference/route')
let route: Route
let Page: typeof import('../app/interference/page').default
let tools: typeof import('../../mcp/src/tools/interference').interferenceTools
let interf: typeof import('../../cli/src/commands/interference').interferenceCommand

const req = (qs = '') => new Request(`http://localhost/api/interference${qs}`)
const post = (body: unknown) =>
  route.POST(
    new Request('http://localhost/api/interference', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
async function callTool(name: string, args: Record<string, unknown>) {
  const t = tools.find((x) => x.name === name)!
  const res = await t.handler(args)
  return JSON.parse((res.content[0] as { text: string }).text)
}
async function runCli(args: string[]) {
  const logs: string[] = []
  const errs: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...a) => void logs.push(a.join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...a) => void errs.push(a.join(' ')))
  process.exitCode = 0
  await interf(args)
  const code = process.exitCode
  process.exitCode = 0
  return { out: logs.join('\n'), err: errs.join('\n'), code }
}

beforeAll(async () => {
  route = await import('../src/server/handlers/interference/route')
  Page = (await import('../app/interference/page')).default
  tools = (await import('../../mcp/src/tools/interference')).interferenceTools
  interf = (await import('../../cli/src/commands/interference')).interferenceCommand
  await route.GET(req()) // opens the database
  const { getDb, decks, cards } = await import('@learning-hub/db')
  const db = getDb()
  db.insert(decks).values({ id: 1, name: 'Bio' }).run()
  const mk = (id: number, front: string, back: string) =>
    db
      .insert(cards)
      .values({
        id,
        deckId: 1,
        type: 'basic',
        content: { basic: { front, back } },
        due: new Date().toISOString(),
      })
      .run()
  mk(1, 'Which enzyme unwinds DNA at the replication fork?', 'Helicase')
  mk(2, 'Which enzyme unwinds RNA at the replication fork?', 'Topoisomerase')
  mk(3, 'Capital of Peru', 'Lima')
  mk(4, 'Boiling point of water at sea level', '100 C')
})
afterEach(() => vi.restoreAllMocks())

describe('interference surfaces', () => {
  it('has a nav entry and renders the page', async () => {
    const { ALL_NAV_ITEMS } = await import('../src/components/nav')
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/interference')).toBe(true)
    expect(renderToString(React.createElement(Page))).toContain('Interference')
  })

  it('GET finds the lookalike pair', async () => {
    const data = await (await route.GET(req('?windowDays=30'))).json()
    expect(data.audit.pairs).toHaveLength(1)
    expect([data.audit.pairs[0].a, data.audit.pairs[0].b]).toEqual([1, 2])
    expect(data.audit.pairs[0].kind).toBe('same-cue-different-target')
    expect(data.report.headline).toMatch(/1 lookalike/)
  })

  it('rejects an out-of-range window and a bad deck id', async () => {
    expect((await route.GET(req('?windowDays=2'))).status).toBe(400)
    expect((await route.GET(req('?deckId=0'))).status).toBe(400)
  })

  it('confirm, dismiss and clear change what the audit shows', async () => {
    expect((await post({ action: 'confirm', a: 2, b: 1 })).status).toBe(200)
    let data = await (await route.GET(req())).json()
    expect(data.audit.pairs[0].status).toBe('confirmed')
    expect((await post({ action: 'dismiss', a: 1, b: 2 })).status).toBe(200)
    data = await (await route.GET(req())).json()
    expect(data.audit.pairs).toHaveLength(0)
    expect((await post({ action: 'clear', a: 1, b: 2 })).status).toBe(200)
    expect((await (await route.GET(req())).json()).audit.pairs).toHaveLength(1)
  })

  it('maps errors: same card 400, missing card 404, bad body 400', async () => {
    expect((await post({ action: 'confirm', a: 1, b: 1 })).status).toBe(400)
    expect((await post({ action: 'confirm', a: 1, b: 99 })).status).toBe(404)
    expect((await post({ action: 'nope' })).status).toBe(400)
  })

  it('drill returns four items, drill-log tallies, and totals appear in GET', async () => {
    const d = await (await post({ action: 'drill', a: 1, b: 2 })).json()
    expect(d.drill.items.map((i: { cardId: number }) => i.cardId)).toEqual([1, 2, 2, 1])
    expect((await post({ action: 'drill-log', a: 1, b: 2, correct: 3, total: 4 })).status).toBe(200)
    expect((await post({ action: 'drill-log', a: 1, b: 2, correct: 5, total: 4 })).status).toBe(400)
    expect((await post({ action: 'drill', a: 1, b: 99 })).status).toBe(404)
    const data = await (await route.GET(req())).json()
    expect(data.drills[0]).toMatchObject({ a: 1, b: 2, correct: 3, total: 4 })
  })

  it('order keeps lookalikes apart and every id once', async () => {
    const res = await (await post({ action: 'order', ids: [1, 2, 3, 4, 1], gap: 2 })).json()
    expect([...res.ids].sort()).toEqual([1, 2, 3, 4])
    expect(Math.abs(res.ids.indexOf(1) - res.ids.indexOf(2))).toBeGreaterThanOrEqual(2)
  })

  it('MCP tools register and share the repository', async () => {
    expect(tools.map((t) => t.name)).toEqual([
      'interf_audit',
      'interf_pair',
      'interf_drill',
      'interf_order',
    ])
    expect((await callTool('interf_audit', {})).audit.pairs).toHaveLength(1)
    expect((await callTool('interf_pair', { a: 1, b: 2, status: 'confirmed' })).ok).toBe(true)
    expect((await callTool('interf_pair', { a: 1, b: 1, status: 'confirmed' })).ok).toBe(false)
    expect((await callTool('interf_drill', { a: 1, b: 2 })).drill.items).toHaveLength(4)
    expect(
      (await callTool('interf_drill', { a: 1, b: 2, correct: 1, total: 2 })).total,
    ).toBeGreaterThan(0)
    expect((await callTool('interf_order', { ids: [1, 2, 3] })).ids).toHaveLength(3)
    await callTool('interf_pair', { a: 1, b: 2, status: 'cleared' })
  })

  it('CLI audits, drills, decides and rejects bad input', async () => {
    expect((await runCli(['audit'])).out).toContain('lookalike')
    expect((await runCli(['audit', '--json'])).out).toContain('"audit"')
    expect((await runCli(['drill', '1', '2'])).out).toContain('Helicase')
    expect((await runCli(['dismiss', '1', '2'])).out).toContain('dismiss')
    expect((await runCli(['clear', '1', '2'])).out).toContain('clear')
    expect((await runCli(['log', '1', '2', '2', '3'])).out).toContain('right')
    expect((await runCli(['order', '1', '2', '3'])).out).toMatch(/\d/)
    expect((await runCli(['confirm', '1', '1'])).code).toBe(1)
    expect((await runCli(['drill', 'x', '2'])).code).toBe(1)
    expect((await runCli(['bogus'])).code).toBe(1)
  })
})
