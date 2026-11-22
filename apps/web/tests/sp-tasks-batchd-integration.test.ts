/**
 * SP tasks handlers batch D integration tests (S3-19): repeat configs,
 * per-task reminders (incl. the scheduler window), planner read, schedule
 * read, metric days and simple counters — driven against an isolated temp
 * SQLite DB (LEARNING_HUB_DB).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// single test file → single module registry; the db module reads this at import time
const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-sp-tasks-batchd-')), 'tasks-batchd.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = {
  repeatCfgs: typeof import('../app/api/tasks-repeat-cfgs/route')
  repeatCfgsId: typeof import('../app/api/tasks-repeat-cfgs/[id]/route')
  reminders: typeof import('../app/api/tasks-reminders/route')
  remindersId: typeof import('../app/api/tasks-reminders/[id]/route')
  planner: typeof import('../app/api/tasks-planner/route')
  schedule: typeof import('../app/api/tasks-schedule/route')
  metrics: typeof import('../app/api/tasks-metrics/route')
  counters: typeof import('../app/api/tasks-counters/route')
  countersId: typeof import('../app/api/tasks-counters/[id]/route')
  countersIncrement: typeof import('../app/api/tasks-counters/[id]/increment/route')
  tasks: typeof import('../app/api/tasks/route')
  tick: typeof import('../app/api/tasks-time/tick/route')
}
let M: Modules

function req(url: string, method: string, body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })

async function createTask(input: Record<string, unknown>): Promise<number> {
  const res = await M.tasks.POST(req('/api/tasks', 'POST', input))
  expect(res.status).toBe(201)
  return (await res.json()).task.id
}

const today = () => new Date().toISOString().slice(0, 10)

beforeAll(async () => {
  M = {
    repeatCfgs: await import('../app/api/tasks-repeat-cfgs/route'),
    repeatCfgsId: await import('../app/api/tasks-repeat-cfgs/[id]/route'),
    reminders: await import('../app/api/tasks-reminders/route'),
    remindersId: await import('../app/api/tasks-reminders/[id]/route'),
    planner: await import('../app/api/tasks-planner/route'),
    schedule: await import('../app/api/tasks-schedule/route'),
    metrics: await import('../app/api/tasks-metrics/route'),
    counters: await import('../app/api/tasks-counters/route'),
    countersId: await import('../app/api/tasks-counters/[id]/route'),
    countersIncrement: await import('../app/api/tasks-counters/[id]/increment/route'),
    tasks: await import('../app/api/tasks/route'),
    tick: await import('../app/api/tasks-time/tick/route'),
  }
})

describe('/api/tasks-repeat-cfgs — repeat config CRUD (S3-92 scope)', () => {
  it('creates (dropping the UI title), patches, reads and deletes', async () => {
    const created = await M.repeatCfgs.POST(
      req('/api/tasks-repeat-cfgs', 'POST', {
        title: 'Every 3 days',
        cycle: 'd',
        interval: 3,
        startDate: '2026-01-01',
        skipDates: ['2026-01-04'],
        reAnchor: 'scheduled',
      }),
    )
    expect(created.status).toBe(201)
    const { repeatCfg: cfg } = await created.json()
    expect(cfg.interval).toBe(3)
    expect(cfg.skipDates).toEqual(['2026-01-04'])

    const patched = await M.repeatCfgsId.PATCH(
      req(`/api/tasks-repeat-cfgs/${cfg.id}`, 'PATCH', { interval: 5 }),
      ctx(cfg.id),
    )
    expect((await patched.json()).repeatCfg.interval).toBe(5)

    const one = await M.repeatCfgsId.GET(
      req(`/api/tasks-repeat-cfgs/${cfg.id}`, 'GET'),
      ctx(cfg.id),
    )
    expect(one.status).toBe(200)
    expect(
      (await M.repeatCfgsId.GET(req('/api/tasks-repeat-cfgs/424242', 'GET'), ctx(424242))).status,
    ).toBe(404)

    const taskId = await createTask({ title: 'Repeats', repeatCfgId: cfg.id })
    const del = await M.repeatCfgsId.DELETE(
      req(`/api/tasks-repeat-cfgs/${cfg.id}`, 'DELETE'),
      ctx(cfg.id),
    )
    expect(del.status).toBe(200)
    const taskRes = await M.tasks.GET(req('/api/tasks?parentId=all&includeDone=1', 'GET'))
    const fresh = (await taskRes.json()).tasks.find((t: { id: number }) => t.id === taskId)
    expect(fresh.repeatCfgId).toBeNull()
  })

  it('rejects a bad cycle with 400', async () => {
    const res = await M.repeatCfgs.POST(
      req('/api/tasks-repeat-cfgs', 'POST', {
        cycle: 'hourly',
        interval: 1,
        startDate: '2026-01-01',
        reAnchor: 'completion',
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe('/api/tasks-reminders — reminders + schedule read', () => {
  it('creates at_time and relative reminders and lists by task', async () => {
    const taskId = await createTask({ title: 'Remindable' })
    const atTime = await (
      await M.reminders.POST(
        req('/api/tasks-reminders', 'POST', {
          taskId,
          type: 'at_time',
          remindAt: '2026-02-01T10:00:00.000Z',
          exactAlarm: true,
        }),
      )
    ).json()
    expect(atTime.reminder.remindAt).toBe('2026-02-01T10:00:00.000Z')
    expect(atTime.reminder.exactAlarm).toBe(true)

    const relative = await (
      await M.reminders.POST(
        req('/api/tasks-reminders', 'POST', { taskId, type: 'relative', offsetMs: -900_000 }),
      )
    ).json()
    expect(relative.reminder.remindAt).toBeNull()
    expect(relative.reminder.offsetMs).toBe(-900_000)

    const bad = await M.reminders.POST(
      req('/api/tasks-reminders', 'POST', { taskId, type: 'at_time' }),
    )
    expect(bad.status).toBe(400)

    const list = await M.reminders.GET(req(`/api/tasks-reminders?taskId=${taskId}`, 'GET'))
    expect((await list.json()).reminders).toHaveLength(2)

    // Scheduler window: everything armed up to a moment (at_time rows only
    // surface by their stored time; relative rows decode their offset).
    const schedule = await M.reminders.GET(
      req('/api/tasks-reminders?before=2026-02-02T00:00:00.000Z', 'GET'),
    )
    expect((await schedule.json()).reminders.length).toBeGreaterThanOrEqual(1)

    const shifted = await M.remindersId.PATCH(
      req(`/api/tasks-reminders/${relative.reminder.id}`, 'PATCH', { offsetMs: -1_800_000 }),
      ctx(relative.reminder.id),
    )
    expect((await shifted.json()).reminder.offsetMs).toBe(-1_800_000)
    expect(
      (
        await M.remindersId.DELETE(
          req(`/api/tasks-reminders/${relative.reminder.id}`, 'DELETE'),
          ctx(relative.reminder.id),
        )
      ).status,
    ).toBe(200)
  })
})

describe('/api/tasks-planner — planner read', () => {
  it('groups due tasks per day with workload totals and an overdue row', async () => {
    const d1 = today()
    const a = await createTask({ title: 'Due today', due: d1, estimateMs: 3_600_000 })
    const b = await createTask({ title: 'Also today', due: d1, estimateMs: 1_800_000 })
    const past = await createTask({ title: 'Overdue', due: '2026-01-01' })

    const res = await M.planner.GET(req('/api/tasks-planner?days=3', 'GET'))
    const body = await res.json()
    expect(body.days[0].day).toBe(d1)
    const dayIds = body.days[0].tasks.map((t: { id: number }) => t.id).sort()
    expect(dayIds).toEqual([a, b].sort())
    expect(body.days[0].estimatedMs).toBe(5_400_000)
    expect(body.overdue.some((t: { id: number }) => t.id === past)).toBe(true)
  })

  it('includes tracked time per column', async () => {
    const d1 = today()
    const a = await createTask({ title: 'Tracked due today', due: d1 })
    await M.tick.POST(req('/api/tasks-time/tick', 'POST', { taskId: a, sessionMs: 60_000 }))
    const res = await M.planner.GET(req('/api/tasks-planner?days=1', 'GET'))
    expect((await res.json()).days[0].trackedMs).toBe(60_000)
  })
})

describe('/api/tasks-schedule — schedule read', () => {
  it('emits 30 days of blocks sized by estimate with deadline flags', async () => {
    const d5 = new Date(Date.parse(today()) + 5 * 86_400_000).toISOString().slice(0, 10)
    const d2 = new Date(Date.parse(today()) + 2 * 86_400_000).toISOString().slice(0, 10)
    await createTask({ title: 'Block in 5 days', due: d5, estimateMs: 7_200_000 })
    await createTask({ title: 'Deadline in 2 days', deadline: d2 })

    const res = await M.schedule.GET(req('/api/tasks-schedule?days=10', 'GET'))
    const body = await res.json()
    expect(body.today).toBe(today())
    expect(body.days).toHaveLength(10)

    const blockDay = body.days.find((d: { day: string }) => d.day === d5)
    expect(blockDay.blocks).toHaveLength(1)
    expect(blockDay.blocks[0].estimateMs).toBe(7_200_000)
    expect(blockDay.blocks[0].deadlinePassed).toBe(false)

    const deadlineDay = body.days.find((d: { day: string }) => d.day === d2)
    expect(deadlineDay.blocks).toHaveLength(1)
    expect(deadlineDay.blocks[0].deadline).toBe(d2)
  })
})

describe('/api/tasks-metrics — metric days', () => {
  it('upserts with metric merge and validates the evaluation sheet', async () => {
    const d = today()
    await M.metrics.POST(
      req('/api/tasks-metrics', 'POST', { day: d, metrics: { focus: 3_600_000 } }),
    )
    const merged = await (
      await M.metrics.POST(
        req('/api/tasks-metrics', 'POST', { day: d, metrics: { tasks: 3 }, impact: 4, energy: 2 }),
      )
    ).json()
    expect(merged.day.metrics).toEqual({ focus: 3_600_000, tasks: 3 })
    expect(merged.day.impact).toBe(4)

    const bad = await M.metrics.POST(req('/api/tasks-metrics', 'POST', { day: d, impact: 9 }))
    expect(bad.status).toBe(400)

    const list = await M.metrics.GET(req(`/api/tasks-metrics?from=${d}`, 'GET'))
    expect((await list.json()).days).toHaveLength(1)
  })
})

describe('/api/tasks-counters — simple counters REST (S3-91 scope)', () => {
  it('creates, increments (accumulate), reads with logs, patches, deletes', async () => {
    const created = await (
      await M.counters.POST(req('/api/tasks-counters', 'POST', { label: 'Water', color: 'blue' }))
    ).json()
    const id = created.counter.id

    await M.countersIncrement.POST(req(`/api/tasks-counters/${id}/increment`, 'POST', {}), ctx(id))
    const second = await (
      await M.countersIncrement.POST(
        req(`/api/tasks-counters/${id}/increment`, 'POST', { by: 2 }),
        ctx(id),
      )
    ).json()
    expect(second.log.count).toBe(3)

    const one = await (
      await M.countersId.GET(req(`/api/tasks-counters/${id}`, 'GET'), ctx(id))
    ).json()
    expect(one.counter.label).toBe('Water')
    expect(one.logs).toHaveLength(1)
    expect(one.logs[0].count).toBe(3)
    expect(
      (await M.countersId.GET(req('/api/tasks-counters/424242', 'GET'), ctx(424242))).status,
    ).toBe(404)

    const archived = await (
      await M.countersId.PATCH(
        req(`/api/tasks-counters/${id}`, 'PATCH', { archived: true }),
        ctx(id),
      )
    ).json()
    expect(archived.counter.archived).toBe(true)
    const active = await M.counters.GET(req('/api/tasks-counters', 'GET'))
    expect((await active.json()).counters).toHaveLength(0)
    const all = await M.counters.GET(req('/api/tasks-counters?all=1', 'GET'))
    expect((await all.json()).counters).toHaveLength(1)

    expect(
      (await M.countersId.DELETE(req(`/api/tasks-counters/${id}`, 'DELETE'), ctx(id))).status,
    ).toBe(200)
    expect(
      (
        await M.countersIncrement.POST(
          req(`/api/tasks-counters/${id}/increment`, 'POST', {}),
          ctx(id),
        )
      ).status,
    ).toBe(404)
  })

  it('rejects a blank label with 400', async () => {
    expect((await M.counters.POST(req('/api/tasks-counters', 'POST', { label: ' ' }))).status).toBe(
      400,
    )
  })
})
