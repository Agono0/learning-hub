/**
 * Retrieval forgetting guard through its web handler, page, nav entry, MCP
 * tools and CLI command, against one temp SQLite DB.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import React from 'react'
import { renderToString } from 'react-dom/server'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-rif-web-')), 'r.db')

type Route = typeof import('../src/server/handlers/retrieval-forgetting/route')
let route: Route
let Page: typeof import('../app/retrieval-forgetting/page').default
let tools: typeof import('../../mcp/src/tools/retrieval-forgetting').retrievalForgettingTools
let rif: typeof import('../../cli/src/commands/retrieval-forgetting').retrievalForgettingCommand

const day = 86_400_000
const ago = (d: number) => new Date(Date.now() - d * day).toISOString()

const req = (qs = '') => new Request(`http://localhost/api/retrieval-forgetting${qs}`)
const post = (body: unknown) =>
  route.POST(
    new Request('http://localhost/api/retrieval-forgetting', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

beforeAll(async () => {
  route = await import('../src/server/handlers/retrieval-forgetting/route')
  Page = (await import('../app/retrieval-forgetting/page')).default
  tools = (await import('../../mcp/src/tools/retrieval-forgetting')).retrievalForgettingTools
  rif = (await import('../../cli/src/commands/retrieval-forgetting')).retrievalForgettingCommand
  await route.GET(req()) // opens the database
  const { getDb, decks, cards, revlog } = await import('@learning-hub/db')
  const db = getDb()
  db.insert(decks).values({ id: 1, name: 'Fruit' }).run()
  const fruit: [number, string, string][] = [
    [1, 'Fruit that is red and grows on trees', 'apple'],
    [2, 'Fruit that is yellow and grows on trees', 'banana'],
    [3, 'Fruit that is orange and grows on trees', 'tangerine'],
  ]
  for (const [id, front, back] of fruit)
    db.insert(cards)
      .values({
        id,
        deckId: 1,
        type: 'basic',
        content: { basic: { front, back } },
        due: ago(-1),
        stability: id === 3 ? 2 : 6,
        lastReview: ago(id === 3 ? 12 : 3),
        state: 2,
      })
      .run()
  let rid = Date.now() - 10 * day
  for (const d of [1, 2, 3, 4, 5])
    for (const cardId of [1, 2])
      db.insert(revlog)
        .values({
          id: rid++,
          cardId,
          rating: 3,
          state: 2,
          elapsedDays: 1,
          scheduledDays: 2,
          timeMs: 3000,
          reviewedAt: ago(d),
        })
        .run()
})

afterEach(() => vi.restoreAllMocks())

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
  await rif(args)
  const code = process.exitCode
  process.exitCode = 0
  return { out: logs.join('\n'), err: errs.join('\n'), code }
}

describe('retrieval forgetting handler', () => {
  it('GET audits real cards and ranks the neglected sibling first', async () => {
    const body = await (await route.GET(req())).json()
    expect(body.audit.clusters).toHaveLength(1)
    expect(body.rescue[0].cardId).toBe(3)
    expect(body.report.headline).toMatch(/card/)
  })
  it('GET rejects a bad window', async () => {
    const res = await route.GET(req('?windowDays=1'))
    expect(res.status).toBe(400)
  })
  it('save stores a summary that shows up in history', async () => {
    const res = await post({ action: 'save', windowDays: 21 })
    expect(res.status).toBe(201)
    const body = await (await route.GET(req())).json()
    expect(body.history.length).toBeGreaterThan(0)
  })
  it('dismiss removes a card from the queue, restore brings it back, unknown card is 404', async () => {
    expect((await post({ action: 'dismiss', cardId: 999 })).status).toBe(404)
    expect((await post({ action: 'dismiss', cardId: 3 })).status).toBe(200)
    let body = await (await route.GET(req())).json()
    expect(body.rescue.some((r: { cardId: number }) => r.cardId === 3)).toBe(false)
    expect(body.dismissed).toContain(3)
    await post({ action: 'restore', cardId: 3 })
    body = await (await route.GET(req())).json()
    expect(body.rescue.some((r: { cardId: number }) => r.cardId === 3)).toBe(true)
  })
  it('plan adds suppressed siblings', async () => {
    const body = await (await post({ action: 'plan', dueIds: [1], budget: 2 })).json()
    expect(body.added.map((a: { cardId: number }) => a.cardId)).toContain(3)
  })
  it('validates bodies', async () => {
    expect((await post({ action: 'plan', dueIds: [], budget: 99 })).status).toBe(400)
    expect((await post({ action: 'nope' })).status).toBe(400)
  })
})

describe('retrieval forgetting page and nav', () => {
  it('renders and is in the nav', async () => {
    const { ALL_NAV_ITEMS } = await import('../src/components/nav')
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/retrieval-forgetting')).toBe(true)
    const html = renderToString(React.createElement(Page))
    expect(html).toContain('Retrieval Forgetting Guard')
    expect(html).not.toMatch(/red-\d/)
  })
  it('is registered in the hub handler registry', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(join(__dirname, '../src/hub/handlers-registry.ts'), 'utf8'),
    )
    expect(src).toContain("add('retrieval-forgetting'")
  })
})

describe('retrieval forgetting MCP tools', () => {
  it('registers four uniquely named tools', () => {
    expect(tools.map((t) => t.name)).toEqual(['rif_audit', 'rif_rescue', 'rif_dismiss', 'rif_plan'])
  })
  it('rif_audit and rif_rescue agree with the handler', async () => {
    const a = await callTool('rif_audit', {})
    expect(a.ok).toBe(true)
    expect(a.audit.clusters).toHaveLength(1)
    const r = await callTool('rif_rescue', { limit: 1 })
    expect(r.rescue).toHaveLength(1)
    expect(r.rescue[0].cardId).toBe(3)
  })
  it('rif_dismiss and rif_plan work', async () => {
    expect((await callTool('rif_dismiss', { cardId: 3 })).ok).toBe(true)
    expect((await callTool('rif_dismiss', { cardId: 3, restore: true })).ok).toBe(true)
    const p = await callTool('rif_plan', { dueIds: [1], budget: 1 })
    expect(p.ids).toContain(3)
  })
})

describe('rif CLI', () => {
  it('audit prints the headline and groups; --json is parseable', async () => {
    const t = await runCli(['audit'])
    expect(t.code).toBe(0)
    expect(t.out).toMatch(/#3/)
    const j = JSON.parse((await runCli(['audit', '--json'])).out)
    expect(j.ok).toBe(true)
    expect(j.audit.clusters).toHaveLength(1)
  })
  it('audit --save stores a summary', async () => {
    const j = JSON.parse((await runCli(['audit', '--save', '--json'])).out)
    expect(typeof j.savedId).toBe('number')
  })
  it('rescue lists reverse probes', async () => {
    const r = await runCli(['rescue'])
    expect(r.out).toContain('probe:')
  })
  it('dismiss, restore and plan', async () => {
    expect((await runCli(['dismiss', '3', '--reason', 'testing'])).out).toMatch(/out of the guard/)
    expect((await runCli(['restore', '3'])).out).toMatch(/back under/)
    expect((await runCli(['restore', '3'])).code).toBe(1)
    const p = JSON.parse((await runCli(['plan', '1', '--budget', '1', '--json'])).out)
    expect(p.ids).toContain(3)
  })
  it('rejects bad input with exit code 1', async () => {
    expect((await runCli(['audit', '--days', '1'])).code).toBe(1)
    expect((await runCli(['dismiss', 'abc'])).code).toBe(1)
    expect((await runCli(['plan', 'x,y'])).code).toBe(1)
    expect((await runCli(['bogus'])).code).toBe(1)
  })
})
