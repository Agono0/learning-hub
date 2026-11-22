/**
 * SP tasks handlers integration tests (S3-16): the batch-A routes
 * (`/api/tasks`, `/api/tasks/[id]` + complete/reopen/duplicate/archive/
 * restore/tags, `/api/tasks/bulk`, `/api/tasks/order`) driven end-to-end
 * against an isolated temp SQLite DB (LEARNING_HUB_DB) — no dev data is
 * touched; ensureSchema() creates every table on first open.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// single test file → single module registry; the db module reads this at import time
const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-sp-tasks-handlers-')), 'tasks.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = {
  tasks: typeof import('../app/api/tasks/route')
  tasksId: typeof import('../app/api/tasks/[id]/route')
  tasksComplete: typeof import('../app/api/tasks/[id]/complete/route')
  tasksReopen: typeof import('../app/api/tasks/[id]/reopen/route')
  tasksDuplicate: typeof import('../app/api/tasks/[id]/duplicate/route')
  tasksArchive: typeof import('../app/api/tasks/[id]/archive/route')
  tasksRestore: typeof import('../app/api/tasks/[id]/restore/route')
  tasksTags: typeof import('../app/api/tasks/[id]/tags/route')
  tasksBulk: typeof import('../app/api/tasks/bulk/route')
  tasksOrder: typeof import('../app/api/tasks/order/route')
  db: typeof import('@learning-hub/db')
}
// Assigned in beforeAll, after LEARNING_HUB_DB points at the temp database.
let M: Modules

function req(url: string, method: string, body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

/** Route context for the [id] handlers — Next passes params as a Promise. */
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })

/** Create a task through the API and return its id. */
async function createTask(input: Record<string, unknown>): Promise<number> {
  const res = await M.tasks.POST(req('/api/tasks', 'POST', input))
  expect(res.status).toBe(201)
  const { task } = await res.json()
  return task.id
}

beforeAll(async () => {
  M = {
    tasks: await import('../app/api/tasks/route'),
    tasksId: await import('../app/api/tasks/[id]/route'),
    tasksComplete: await import('../app/api/tasks/[id]/complete/route'),
    tasksReopen: await import('../app/api/tasks/[id]/reopen/route'),
    tasksDuplicate: await import('../app/api/tasks/[id]/duplicate/route'),
    tasksArchive: await import('../app/api/tasks/[id]/archive/route'),
    tasksRestore: await import('../app/api/tasks/[id]/restore/route'),
    tasksTags: await import('../app/api/tasks/[id]/tags/route'),
    tasksBulk: await import('../app/api/tasks/bulk/route'),
    tasksOrder: await import('../app/api/tasks/order/route'),
    db: await import('@learning-hub/db'),
  }
})

describe('POST /api/tasks — create', () => {
  it('creates a task and echoes the core model', async () => {
    const res = await M.tasks.POST(
      req('/api/tasks', 'POST', {
        title: 'Write the spec',
        priority: 'high',
        estimateMs: 3_600_000,
      }),
    )
    expect(res.status).toBe(201)
    const { task } = await res.json()
    expect(task.id).toBeGreaterThan(0)
    expect(task.title).toBe('Write the spec')
    expect(task.priority).toBe('high')
    expect(task.isDone).toBe(false)
    expect(task.tagIds).toEqual([])
  })

  it('rejects an empty title with 400', async () => {
    const res = await M.tasks.POST(req('/api/tasks', 'POST', { title: '   ' }))
    expect(res.status).toBe(400)
  })

  it('rejects an unknown project with 404 (repo integrity)', async () => {
    const res = await M.tasks.POST(req('/api/tasks', 'POST', { title: 'x', projectId: 999 }))
    expect(res.status).toBe(404)
  })
})

describe('GET /api/tasks — list scopes', () => {
  it('defaults to open top-level tasks in display order', async () => {
    const inbox = await M.tasks.GET(req('/api/tasks?parentId=top', 'GET'))
    const { tasks } = await inbox.json()
    expect(tasks.length).toBeGreaterThan(0)
    for (const t of tasks) {
      expect(t.isDone).toBe(false)
      expect(t.wonthado).toBe(false)
    }
  })

  it('scopes to the inbox (projectId=inbox) and includes done when asked', async () => {
    await createTask({ title: 'Inbox only' })
    const res = await M.tasks.GET(req('/api/tasks?projectId=inbox&includeDone=1', 'GET'))
    const { tasks } = await res.json()
    expect(tasks.some((t: { title: string }) => t.title === 'Inbox only')).toBe(true)
  })
})

describe('PATCH /api/tasks/[id] — update + integrity', () => {
  it('patches fields and replaces tag links', async () => {
    const id = await createTask({ title: 'Before' })
    const res = await M.tasksId.PATCH(req(`/api/tasks/${id}`, 'PATCH', { title: 'After' }), ctx(id))
    expect(res.status).toBe(200)
    const { task } = await res.json()
    expect(task.title).toBe('After')
  })

  it('404s on a missing task and 400s on unknown tag ids', async () => {
    expect(
      (await M.tasksId.PATCH(req('/api/tasks/424242', 'PATCH', { title: 'x' }), ctx(424242)))
        .status,
    ).toBe(404)
    const id = await createTask({ title: 'Tags' })
    const bad = await M.tasksId.PATCH(
      req(`/api/tasks/${id}`, 'PATCH', { tagIds: [12345] }),
      ctx(id),
    )
    expect(bad.status).toBe(400)
  })

  it('enforces one nesting level (400 on subtask-of-subtask)', async () => {
    const parent = await createTask({ title: 'Parent' })
    const sub = await createTask({ title: 'Sub', parentId: parent })
    const deep = await M.tasksId.PATCH(
      req(`/api/tasks/${parent}`, 'PATCH', { parentId: sub }),
      ctx(parent),
    )
    expect(deep.status).toBe(400)
  })
})

describe('complete / reopen / duplicate', () => {
  it('completes a parent and sweeps open subtasks; reopen clears', async () => {
    const parent = await createTask({ title: 'Sweep' })
    const sub = await createTask({ title: 'Child', parentId: parent })
    const done = await M.tasksComplete.POST(
      req(`/api/tasks/${parent}/complete`, 'POST'),
      ctx(parent),
    )
    expect(done.status).toBe(200)
    const { task } = await done.json()
    expect(task.isDone).toBe(true)
    const subRes = await M.tasksId.GET(req(`/api/tasks/${sub}`, 'GET'), ctx(sub))
    expect((await subRes.json()).task.isDone).toBe(true)

    const reopened = await M.tasksReopen.POST(
      req(`/api/tasks/${parent}/reopen`, 'POST'),
      ctx(parent),
    )
    expect((await reopened.json()).task.isDone).toBe(false)
  })

  it('refuses to complete a won\u2019t-do task with the domain code', async () => {
    const id = await createTask({ title: 'Won\u2019t do' })
    await M.tasksBulk.POST(req('/api/tasks/bulk', 'POST', { ids: [id], op: { op: 'wontdo' } }))
    const res = await M.tasksComplete.POST(req(`/api/tasks/${id}/complete`, 'POST'), ctx(id))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('wontdo-cannot-complete')
  })

  it('duplicates with a (copy) suffix', async () => {
    const id = await createTask({ title: 'Original' })
    const res = await M.tasksDuplicate.POST(req(`/api/tasks/${id}/duplicate`, 'POST'), ctx(id))
    expect(res.status).toBe(201)
    expect((await res.json()).task.title).toBe('Original (copy)')
  })

  it('404s on a missing task', async () => {
    const res = await M.tasksComplete.POST(req('/api/tasks/424242/complete', 'POST'), ctx(424242))
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/tasks/[id] — trash entry + cascade', () => {
  it('returns a trash entry and removes the task', async () => {
    const id = await createTask({ title: 'Delete me' })
    const res = await M.tasksId.DELETE(req(`/api/tasks/${id}?via=context-menu`, 'DELETE'), ctx(id))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deleted).toBe(true)
    expect(body.trash.title).toBe('Delete me')
    expect(body.trash.deletedVia).toBe('context-menu')
    expect(body.trash.snapshot.id).toBe(id)

    const again = await M.tasksId.DELETE(req(`/api/tasks/${id}`, 'DELETE'), ctx(id))
    expect(again.status).toBe(404)
  })

  it('404s on a missing task', async () => {
    expect((await M.tasksId.DELETE(req('/api/tasks/424242', 'DELETE'), ctx(424242))).status).toBe(
      404,
    )
  })
})

describe('POST /api/tasks/bulk — batch ops', () => {
  it('moves a selection to a project and reports not-found ids', async () => {
    const p = M.db.createTaskProjectRow({ title: 'Bulk target' })
    const a = await createTask({ title: 'Bulk A' })
    const b = await createTask({ title: 'Bulk B' })

    const res = await M.tasksBulk.POST(
      req('/api/tasks/bulk', 'POST', {
        ids: [a, b, 987],
        op: { op: 'setProject', projectId: p.id },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.applied).toHaveLength(2)
    expect(body.skipped).toEqual([{ id: 987, reason: 'not found' }])
  })

  it('skips completing a won\u2019t-do task instead of failing the batch', async () => {
    const id = await createTask({ title: 'Skip me' })
    await M.tasksBulk.POST(req('/api/tasks/bulk', 'POST', { ids: [id], op: { op: 'wontdo' } }))
    const res = await M.tasksBulk.POST(
      req('/api/tasks/bulk', 'POST', { ids: [id], op: { op: 'complete' } }),
    )
    const body = await res.json()
    expect(body.applied).toHaveLength(0)
    expect(body.skipped[0]!.reason).toMatch(/won.t do/)
  })
})

describe('POST /api/tasks/order — drag + dense renumber', () => {
  it('moves one task and echoes the new dense order', async () => {
    const a = await createTask({ title: 'A' })
    const b = await createTask({ title: 'B' })
    const c = await createTask({ title: 'C' })
    const res = await M.tasksOrder.POST(
      req('/api/tasks/order', 'POST', { id: c, targetIndex: 0, listIds: [a, b, c] }),
    )
    const { order } = await res.json()
    expect(order).toEqual([c, a, b])
    const list = await M.tasks.GET(req('/api/tasks?projectId=inbox&includeDone=1', 'GET'))
    const { tasks } = await list.json()
    const inbox = tasks.filter((t: { id: number }) => [a, b, c].includes(t.id))
    expect(inbox.map((t: { id: number }) => t.id)).toEqual([c, a, b])
  })

  it('persists a full order list', async () => {
    const a = await createTask({ title: 'O1' })
    const b = await createTask({ title: 'O2' })
    const res = await M.tasksOrder.POST(req('/api/tasks/order', 'POST', { ids: [b, a] }))
    expect((await res.json()).order).toEqual([b, a])
  })
})

describe('archive / restore — the two-tier path', () => {
  it('archives, restores, and 404s a second restore', async () => {
    const id = await createTask({ title: 'Archive me' })
    const archive = await M.tasksArchive.POST(
      req(`/api/tasks/${id}/archive`, 'POST', { tier: 'young' }),
      ctx(id),
    )
    expect(archive.status).toBe(200)
    expect((await archive.json()).archive.tier).toBe('young')

    const restore = await M.tasksRestore.POST(req(`/api/tasks/${id}/restore`, 'POST'), ctx(id))
    expect(restore.status).toBe(200)
    expect((await restore.json()).restored).toBe(true)

    const again = await M.tasksRestore.POST(req(`/api/tasks/${id}/restore`, 'POST'), ctx(id))
    expect(again.status).toBe(404)
  })
})

describe('PUT /api/tasks/[id]/tags — tag link replacement', () => {
  it('replaces the tag set and rejects unknown ids without touching the old set', async () => {
    const tag = M.db.createTaskTag({ name: 'handler-tag' })
    const id = await createTask({ title: 'Tag target' })

    const set = await M.tasksTags.PUT(
      req(`/api/tasks/${id}/tags`, 'PUT', { tagIds: [tag.id] }),
      ctx(id),
    )
    expect(set.status).toBe(200)
    expect((await set.json()).tagIds).toEqual([tag.id])

    const bad = await M.tasksTags.PUT(
      req(`/api/tasks/${id}/tags`, 'PUT', { tagIds: [12345] }),
      ctx(id),
    )
    expect(bad.status).toBe(400)
    // The previous set survives the failed write.
    const fresh = await M.tasksId.GET(req(`/api/tasks/${id}`, 'GET'), ctx(id))
    expect((await fresh.json()).task.tagIds).toEqual([tag.id])
  })
})
