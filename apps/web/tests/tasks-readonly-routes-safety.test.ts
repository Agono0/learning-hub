/**
 * The tasks-* read routes used to export bare handlers: a bad query made `readQuery` throw an
 * ApiError that nothing caught (a framework 500 instead of the JSON 400 contract), and a
 * regex-valid but impossible date such as 2026-99-99 reached `toISOString()` and threw a
 * RangeError. They now go through `withRoute` and validate real calendar days.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-tasks-ro-')), 't.db')

type Handler = (req: Request, ctx?: unknown) => Promise<Response>
let planner: Handler
let schedule: Handler
let worklog: Handler
let worklogExport: Handler
let timeList: Handler
let timeDel: Handler
let attDel: Handler
const u = (p: string) => `http://localhost${p}`

beforeAll(async () => {
  planner = (await import('../src/server/handlers/tasks-planner/route')).GET as Handler
  schedule = (await import('../src/server/handlers/tasks-schedule/route')).GET as Handler
  worklog = (await import('../src/server/handlers/tasks-worklog/route')).GET as Handler
  worklogExport = (await import('../src/server/handlers/tasks-worklog/export/route')).GET as Handler
  timeList = (await import('../src/server/handlers/tasks-time/route')).GET as Handler
  timeDel = (await import('../src/server/handlers/tasks-time/[id]/route')).DELETE as Handler
  attDel = (await import('../src/server/handlers/tasks-attachments/[id]/route')).DELETE as Handler
})

describe('tasks read routes answer bad input with a JSON 400, never a throw', () => {
  const cases: [string, () => Handler, string][] = [
    ['planner days=abc', () => planner, '/api/tasks-planner?days=abc'],
    ['planner days=0', () => planner, '/api/tasks-planner?days=0'],
    ['planner days=9999', () => planner, '/api/tasks-planner?days=9999'],
    ['planner from=2026-99-99', () => planner, '/api/tasks-planner?from=2026-99-99'],
    ['planner from=2026-02-30', () => planner, '/api/tasks-planner?from=2026-02-30'],
    ['schedule days=-4', () => schedule, '/api/tasks-schedule?days=-4'],
    ['schedule days=1.5', () => schedule, '/api/tasks-schedule?days=1.5'],
    ['worklog from=nope', () => worklog, '/api/tasks-worklog?from=nope'],
    ['worklog to=2026-13-01', () => worklog, '/api/tasks-worklog?to=2026-13-01'],
    ['export from=2026-00-00', () => worklogExport, '/api/tasks-worklog/export?from=2026-00-00'],
    ['time taskId=-1', () => timeList, '/api/tasks-time?taskId=-1'],
    ['time day=2026-02-31', () => timeList, '/api/tasks-time?day=2026-02-31'],
  ]
  it.each(cases)('%s', async (_n, h, url) => {
    const res = await h()(new Request(u(url)))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Invalid query parameters')
  })

  it('valid input still works', async () => {
    for (const [h, url] of [
      [planner, '/api/tasks-planner?days=3&from=2026-02-28'],
      [schedule, '/api/tasks-schedule?days=5'],
      [worklog, '/api/tasks-worklog?from=2026-01-01&to=2026-01-31'],
      [worklogExport, '/api/tasks-worklog/export'],
      [timeList, '/api/tasks-time?day=2026-02-28'],
    ] as [Handler, string][]) {
      const res = await h(new Request(u(url)))
      expect(res.status).toBe(200)
    }
  })

  it('planner crosses a leap day correctly', async () => {
    const res = await planner(new Request(u('/api/tasks-planner?days=3&from=2028-02-28')))
    const body = (await res.json()) as { days: { day: string }[] }
    expect(body.days.map((d) => d.day)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01'])
  })
})

describe('id routes', () => {
  it.each(['0', '-1', 'abc', '1.5'])('DELETE tasks-time/%s -> 400', async (id) => {
    const res = await timeDel(new Request(u('/x'), { method: 'DELETE' }), {
      params: Promise.resolve({ id }),
    })
    expect(res.status).toBe(400)
  })
  it('DELETE missing attachment -> 404', async () => {
    const res = await attDel(new Request(u('/x'), { method: 'DELETE' }), {
      params: Promise.resolve({ id: '99999' }),
    })
    expect(res.status).toBe(404)
  })
  it('DELETE missing time log -> 404', async () => {
    const res = await timeDel(new Request(u('/x'), { method: 'DELETE' }), {
      params: Promise.resolve({ id: '99999' }),
    })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/tasks-time totals follow the same filter as the rows', () => {
  it('a day filter narrows totalMs, not just the logs', async () => {
    const D = await import('@learning-hub/db')
    const task = D.createTaskItem({ title: 'sum filter' })
    D.insertTimeLog({ taskId: task.id, day: '2031-03-01', sessionMs: 900_000 })
    D.insertTimeLog({ taskId: task.id, day: '2031-03-01', sessionMs: 600_000 })
    D.insertTimeLog({ taskId: task.id, day: '2031-03-02', sessionMs: 300_000 })

    const get = async (qs: string) =>
      (await (await timeList(new Request(u(`/api/tasks-time?taskId=${task.id}${qs}`)))).json()) as {
        logs: unknown[]
        totalMs: number
      }
    const all = await get('')
    expect(all.logs).toHaveLength(3)
    expect(all.totalMs).toBe(1_800_000)

    const day1 = await get('&day=2031-03-01')
    expect(day1.logs).toHaveLength(2)
    expect(day1.totalMs).toBe(1_500_000)

    const day2 = await get('&day=2031-03-02')
    expect(day2.totalMs).toBe(300_000)
    expect((await get('&day=2031-03-09')).totalMs).toBe(0)
  })
})
