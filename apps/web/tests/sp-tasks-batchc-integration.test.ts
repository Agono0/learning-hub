/**
 * SP tasks handlers batch C integration tests (S3-18): time-tracking
 * tick/stop, the session-log reads + corrections, worklog rollups, CSV
 * export and finish-day — driven against an isolated temp SQLite DB
 * (LEARNING_HUB_DB).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// single test file → single module registry; the db module reads this at import time
const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-sp-tasks-batchc-')), 'tasks-batchc.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = {
  time: typeof import('../app/api/tasks-time/route')
  timeId: typeof import('../app/api/tasks-time/[id]/route')
  tick: typeof import('../app/api/tasks-time/tick/route')
  stop: typeof import('../app/api/tasks-time/stop/route')
  worklog: typeof import('../app/api/tasks-worklog/route')
  exportRoute: typeof import('../app/api/tasks-worklog/export/route')
  finishDay: typeof import('../app/api/tasks-finish-day/route')
  tasks: typeof import('../app/api/tasks/route')
  tasksId: typeof import('../app/api/tasks/[id]/route')
  complete: typeof import('../app/api/tasks/[id]/complete/route')
  bulk: typeof import('../app/api/tasks/bulk/route')
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

beforeAll(async () => {
  M = {
    time: await import('../app/api/tasks-time/route'),
    timeId: await import('../app/api/tasks-time/[id]/route'),
    tick: await import('../app/api/tasks-time/tick/route'),
    stop: await import('../app/api/tasks-time/stop/route'),
    worklog: await import('../app/api/tasks-worklog/route'),
    exportRoute: await import('../app/api/tasks-worklog/export/route'),
    finishDay: await import('../app/api/tasks-finish-day/route'),
    tasks: await import('../app/api/tasks/route'),
    tasksId: await import('../app/api/tasks/[id]/route'),
    complete: await import('../app/api/tasks/[id]/complete/route'),
    bulk: await import('../app/api/tasks/bulk/route'),
  }
})

describe('POST /api/tasks-time/tick — append sessions', () => {
  it('appends a session and re-derives the per-day map', async () => {
    const id = await createTask({ title: 'Tracked via API' })
    const res = await M.tick.POST(
      req('/api/tasks-time/tick', 'POST', { taskId: id, sessionMs: 60_000 }),
    )
    expect(res.status).toBe(201)
    const { log, task } = await res.json()
    expect(log.sessionMs).toBe(60_000)
    expect(log.source).toBe('manual')
    expect(task.timeSpentOnDay[log.day]).toBe(60_000)
  })

  it('derives the day key from startedAt and skips junk ticks', async () => {
    const id = await createTask({ title: 'Night shift' })
    const res = await M.tick.POST(
      req('/api/tasks-time/tick', 'POST', {
        taskId: id,
        sessionMs: 5_000,
        startedAt: '2026-03-09T22:30:00.000Z',
        source: 'focus',
      }),
    )
    const { log } = await res.json()
    expect(log.day).toBe('2026-03-09')
    expect(log.source).toBe('focus')

    const junk = await M.tick.POST(
      req('/api/tasks-time/tick', 'POST', { taskId: id, sessionMs: 500 }),
    )
    expect(junk.status).toBe(200)
    expect((await junk.json()).skipped).toBe(true)
  })

  it('404s on a missing task and 400s on done/won\u2019t-do tasks', async () => {
    expect(
      (
        await M.tick.POST(
          req('/api/tasks-time/tick', 'POST', { taskId: 424242, sessionMs: 60_000 }),
        )
      ).status,
    ).toBe(404)

    const id = await createTask({ title: 'Done already' })
    await M.complete.POST(req(`/api/tasks/${id}/complete`, 'POST'), ctx(id))
    const res = await M.tick.POST(
      req('/api/tasks-time/tick', 'POST', { taskId: id, sessionMs: 60_000 }),
    )
    expect(res.status).toBe(400)

    const wontdo = await createTask({ title: 'Won\u2019t track' })
    await M.bulk.POST(req('/api/tasks/bulk', 'POST', { ids: [wontdo], op: { op: 'wontdo' } }))
    expect(
      (
        await M.tick.POST(
          req('/api/tasks-time/tick', 'POST', { taskId: wontdo, sessionMs: 60_000 }),
        )
      ).status,
    ).toBe(400)
  })
})

describe('POST /api/tasks-time/stop — flush + summary', () => {
  it('flushes the remaining buffer and returns the authoritative map', async () => {
    const id = await createTask({ title: 'Stop me' })
    await M.tick.POST(req('/api/tasks-time/tick', 'POST', { taskId: id, sessionMs: 30_000 }))
    const res = await M.stop.POST(
      req('/api/tasks-time/stop', 'POST', { taskId: id, sessionMs: 15_000 }),
    )
    expect(res.status).toBe(200)
    const { flushed, task } = await res.json()
    expect(flushed.sessionMs).toBe(15_000)
    expect(task.timeSpentOnDay[flushed.day]).toBe(45_000)

    const bare = await M.stop.POST(req('/api/tasks-time/stop', 'POST', { taskId: id }))
    const bareBody = await bare.json()
    expect(bareBody.flushed).toBeNull()
    expect(bareBody.task.timeSpentOnDay[flushed.day]).toBe(45_000)
  })
})

describe('GET /api/tasks-time + DELETE corrections', () => {
  it('lists logs with the total and recomputes the map on delete', async () => {
    const id = await createTask({ title: 'Correctable' })
    const first = await (
      await M.tick.POST(req('/api/tasks-time/tick', 'POST', { taskId: id, sessionMs: 60_000 }))
    ).json()
    await M.tick.POST(req('/api/tasks-time/tick', 'POST', { taskId: id, sessionMs: 30_000 }))

    const list = await M.time.GET(req(`/api/tasks-time?taskId=${id}`, 'GET'))
    const { logs, totalMs } = await list.json()
    expect(logs).toHaveLength(2)
    expect(totalMs).toBe(90_000)

    const del = await M.timeId.DELETE(
      req(`/api/tasks-time/${first.log.id}`, 'DELETE'),
      ctx(first.log.id),
    )
    expect(del.status).toBe(200)
    const after = await M.time.GET(req(`/api/tasks-time?taskId=${id}`, 'GET'))
    const afterBody = await after.json()
    expect(afterBody.totalMs).toBe(30_000)

    const fresh = await M.tasksId.GET(req(`/api/tasks/${id}`, 'GET'), ctx(id))
    expect((await fresh.json()).task.timeSpentOnDay[first.log.day]).toBe(30_000)

    expect(
      (await M.timeId.DELETE(req(`/api/tasks-time/${first.log.id}`, 'DELETE'), ctx(first.log.id)))
        .status,
    ).toBe(404)
  })
})

describe('GET /api/tasks-worklog — rollups', () => {
  it('rolls sessions up per day and per task over a window', async () => {
    const a = await createTask({ title: 'Worklog A' })
    const b = await createTask({ title: 'Worklog B' })
    await M.tick.POST(
      req('/api/tasks-time/tick', 'POST', {
        taskId: a,
        sessionMs: 3_600_000,
        startedAt: '2026-02-01T09:00:00.000Z',
      }),
    )
    await M.tick.POST(
      req('/api/tasks-time/tick', 'POST', {
        taskId: b,
        sessionMs: 1_800_000,
        startedAt: '2026-02-01T14:00:00.000Z',
      }),
    )
    await M.tick.POST(
      req('/api/tasks-time/tick', 'POST', {
        taskId: a,
        sessionMs: 900_000,
        startedAt: '2026-02-02T09:00:00.000Z',
      }),
    )

    const res = await M.worklog.GET(req('/api/tasks-worklog?from=2026-02-01&to=2026-02-02', 'GET'))
    const body = await res.json()
    expect(body.from).toBe('2026-02-01')
    expect(body.totalMs).toBe(6_300_000)
    expect(body.perDay).toEqual([
      { day: '2026-02-01', totalMs: 5_400_000 },
      { day: '2026-02-02', totalMs: 900_000 },
    ])
    expect(body.perTask[0]).toEqual({ taskId: a, title: 'Worklog A', totalMs: 4_500_000 })
  })
})

describe('GET /api/tasks-worklog/export — CSV', () => {
  it('serves an RFC4180 CSV attachment', async () => {
    const a = await createTask({ title: 'Quoted, "task"' })
    await M.tick.POST(
      req('/api/tasks-time/tick', 'POST', {
        taskId: a,
        sessionMs: 90_000,
        startedAt: '2026-02-03T08:00:00.000Z',
      }),
    )
    const res = await M.exportRoute.GET(
      req('/api/tasks-worklog/export?from=2026-02-03&to=2026-02-03', 'GET'),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('attachment')

    const body = await res.text()
    const lines = body.split('\r\n')
    expect(lines[0]).toBe('task_id,title,day,minutes,source,started_at')
    expect(lines[1]).toContain('"Quoted, ""task"""')
    expect(lines[1]).toContain('2026-02-03')
    expect(lines[1].split(',')[3]).toBe('2') // 90s → 2 whole minutes (rounded)
  })
})

describe('POST /api/tasks-finish-day — summary + auto-archive', () => {
  it('summarizes the day and runs the archive pass', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const done = await createTask({ title: 'Finished today' })
    await M.complete.POST(req(`/api/tasks/${done}/complete`, 'POST'), ctx(done))
    const open = await createTask({ title: 'Still open', due: today })

    const res = await M.finishDay.POST(req('/api/tasks-finish-day', 'POST', {}))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.day).toBe(today)
    expect(body.completedThatDay.some((t: { id: number }) => t.id === done)).toBe(true)
    expect(body.stillOpenForDay.some((t: { id: number }) => t.id === open)).toBe(true)
    expect(typeof body.trackedMs).toBe('number')
    expect(body.archive).toEqual({
      archived: expect.any(Array),
      promoted: expect.any(Array),
      restored: expect.any(Array),
    })

    const explicit = await M.finishDay.POST(
      req('/api/tasks-finish-day', 'POST', { day: '2026-02-05' }),
    )
    expect((await explicit.json()).day).toBe('2026-02-05')
  })
})
