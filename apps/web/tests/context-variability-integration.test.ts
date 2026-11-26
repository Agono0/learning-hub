/**
 * Context variability through its web handler, page, nav entry, MCP tools and
 * CLI command, against one temp SQLite DB.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import React from 'react'
import { renderToString } from 'react-dom/server'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-ctxv-web-')), 'c.db')

type Route = typeof import('../src/server/handlers/context-variability/route')
let route: Route
let Page: typeof import('../app/context-variability/page').default
let tools: typeof import('../../mcp/src/tools/context-variability').contextVariabilityTools
let ctxv: typeof import('../../cli/src/commands/context-variability').contextVariabilityCommand

const req = (qs = '') => new Request(`http://localhost/api/context-variability${qs}`)
const post = (body: unknown) =>
  route.POST(
    new Request('http://localhost/api/context-variability', {
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
  await ctxv(args)
  const code = process.exitCode
  process.exitCode = 0
  return { out: logs.join('\n'), err: errs.join('\n'), code }
}

beforeAll(async () => {
  route = await import('../src/server/handlers/context-variability/route')
  Page = (await import('../app/context-variability/page')).default
  tools = (await import('../../mcp/src/tools/context-variability')).contextVariabilityTools
  ctxv = (await import('../../cli/src/commands/context-variability')).contextVariabilityCommand
})
afterEach(() => vi.restoreAllMocks())

describe('context variability surfaces', () => {
  it('has a nav entry and renders the page', async () => {
    const { ALL_NAV_ITEMS } = await import('../src/components/nav')
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/context-variability')).toBe(true)
    const html = renderToString(React.createElement(Page))
    expect(html).toContain('Context Variability')
  })

  it('GET on an empty database returns an audit with no reviews', async () => {
    const data = await (await route.GET(req('?windowDays=30'))).json()
    expect(data.audit.reviews).toBe(0)
    expect(data.open).toBeNull()
    expect(data.goals).toEqual([])
    expect(data.report.headline).toMatch(/Not enough/)
  })

  it('rejects an out-of-range window', async () => {
    expect((await route.GET(req('?windowDays=2'))).status).toBe(400)
  })

  it('start is idempotent for the same place, then end closes it', async () => {
    const a = await post({ action: 'start', place: 'Library' })
    expect(a.status).toBe(201)
    const b = await post({ action: 'start', place: 'library' })
    expect(b.status).toBe(200)
    expect((await (await route.GET(req())).json()).open.place).toBe('library')
    expect((await post({ action: 'end' })).status).toBe(200)
    expect((await post({ action: 'end' })).status).toBe(404)
  })

  it('log rejects an over-long session with 400 and dedupes a repeat', async () => {
    const bad = await post({
      action: 'log',
      place: 'cafe',
      startedAt: '2026-01-01T08:00:00Z',
      endedAt: '2026-01-02T08:00:00Z',
    })
    expect(bad.status).toBe(400)
    const body = {
      action: 'log',
      place: 'cafe',
      startedAt: '2026-01-01T08:00:00Z',
      endedAt: '2026-01-01T10:00:00Z',
    }
    expect((await post(body)).status).toBe(201)
    expect((await post(body)).status).toBe(200)
  })

  it('goal add, update in place and archive', async () => {
    const g = {
      action: 'goal-add',
      label: 'Final exam',
      place: 'Hall B',
      startHour: 9,
      endHour: 12,
    }
    expect((await post(g)).status).toBe(201)
    expect((await post({ ...g, endHour: 13 })).status).toBe(200)
    const data = await (await route.GET(req())).json()
    expect(data.goals).toHaveLength(1)
    expect(data.audit.goals[0].reinstatement.length).toBeGreaterThan(0)
    expect((await post({ action: 'goal-archive', id: data.goals[0].id })).status).toBe(200)
    expect((await post({ action: 'goal-archive', id: 9999 })).status).toBe(404)
  })

  it('MCP tools register and share the repository', async () => {
    expect(tools.map((t) => t.name)).toEqual(['ctxv_audit', 'ctxv_session', 'ctxv_goal'])
    const s = await callTool('ctxv_session', { action: 'start', place: 'park' })
    expect(s.ok).toBe(true)
    const bad = await callTool('ctxv_session', { action: 'start' })
    expect(bad.ok).toBe(false)
    expect((await callTool('ctxv_audit', {})).audit.windowDays).toBe(60)
    await callTool('ctxv_session', { action: 'end' })
    expect((await callTool('ctxv_goal', { action: 'archive', id: 9999 })).ok).toBe(false)
    expect((await callTool('ctxv_audit', { tzOffsetMinutes: 120 })).audit.windowDays).toBe(60)
  })

  it('CLI starts, reports status, audits and rejects bad input', async () => {
    expect((await runCli(['start', 'desk'])).out).toContain('desk')
    expect((await runCli(['status'])).out).toContain('Studying at desk')
    expect((await runCli(['end'])).out).toContain('Ended')
    expect((await runCli(['audit', '--json'])).out).toContain('"audit"')
    const bad = await runCli(['goal', 'add', 'x', 'y', '9', '99'])
    expect(bad.code).toBe(1)
    expect((await runCli(['bogus'])).code).toBe(1)
  })
})
