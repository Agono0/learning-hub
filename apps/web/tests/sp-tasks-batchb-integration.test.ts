/**
 * SP tasks handlers batch B integration tests (S3-17): the projects, tags,
 * sections and views routes (`/api/tasks-projects`, `/api/tasks-tags`,
 * `/api/tasks-sections`, `/api/tasks-views` + `[id]` subroutes) driven
 * end-to-end against an isolated temp SQLite DB (LEARNING_HUB_DB).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// single test file → single module registry; the db module reads this at import time
const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-sp-tasks-batchb-')), 'tasks-batchb.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = {
  projects: typeof import('../app/api/tasks-projects/route')
  projectsId: typeof import('../app/api/tasks-projects/[id]/route')
  projectsArchive: typeof import('../app/api/tasks-projects/[id]/archive/route')
  projectsRestore: typeof import('../app/api/tasks-projects/[id]/restore/route')
  projectsDuplicate: typeof import('../app/api/tasks-projects/[id]/duplicate/route')
  tags: typeof import('../app/api/tasks-tags/route')
  tagsId: typeof import('../app/api/tasks-tags/[id]/route')
  sections: typeof import('../app/api/tasks-sections/route')
  sectionsId: typeof import('../app/api/tasks-sections/[id]/route')
  views: typeof import('../app/api/tasks-views/route')
  viewsId: typeof import('../app/api/tasks-views/[id]/route')
  tasks: typeof import('../app/api/tasks/route')
  db: typeof import('@learning-hub/db')
}
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
  return (await res.json()).task.id
}

beforeAll(async () => {
  M = {
    projects: await import('../app/api/tasks-projects/route'),
    projectsId: await import('../app/api/tasks-projects/[id]/route'),
    projectsArchive: await import('../app/api/tasks-projects/[id]/archive/route'),
    projectsRestore: await import('../app/api/tasks-projects/[id]/restore/route'),
    projectsDuplicate: await import('../app/api/tasks-projects/[id]/duplicate/route'),
    tags: await import('../app/api/tasks-tags/route'),
    tagsId: await import('../app/api/tasks-tags/[id]/route'),
    sections: await import('../app/api/tasks-sections/route'),
    sectionsId: await import('../app/api/tasks-sections/[id]/route'),
    views: await import('../app/api/tasks-views/route'),
    viewsId: await import('../app/api/tasks-views/[id]/route'),
    tasks: await import('../app/api/tasks/route'),
    db: await import('@learning-hub/db'),
  }
})

describe('/api/tasks-projects — projects CRUD', () => {
  it('creates, lists, patches and reads one project', async () => {
    const created = await M.projects.POST(
      req('/api/tasks-projects', 'POST', { title: 'Thesis', color: 'blue' }),
    )
    expect(created.status).toBe(201)
    const { project } = await created.json()

    const list = await M.projects.GET()
    expect(list.status).toBe(200)
    expect((await list.json()).projects.some((p: { id: number }) => p.id === project.id)).toBe(true)

    const patched = await M.projectsId.PATCH(
      req(`/api/tasks-projects/${project.id}`, 'PATCH', { backlogFlag: true, color: null }),
      ctx(project.id),
    )
    expect((await patched.json()).project).toMatchObject({
      title: 'Thesis',
      backlogFlag: true,
      color: null,
    })

    const one = await M.projectsId.GET(
      req(`/api/tasks-projects/${project.id}`, 'GET'),
      ctx(project.id),
    )
    expect(one.status).toBe(200)
    expect(
      (await M.projectsId.GET(req('/api/tasks-projects/424242', 'GET'), ctx(424242))).status,
    ).toBe(404)
  })

  it('rejects an empty title with 400', async () => {
    expect(
      (await M.projects.POST(req('/api/tasks-projects', 'POST', { title: '  ' }))).status,
    ).toBe(400)
  })

  it('archive → restore round trip', async () => {
    const { project } = await (
      await M.projects.POST(req('/api/tasks-projects', 'POST', { title: 'Shelve me' }))
    ).json()
    const archived = await M.projectsArchive.POST(
      req(`/api/tasks-projects/${project.id}/archive`, 'POST'),
      ctx(project.id),
    )
    expect(archived.status).toBe(200)
    expect((await archived.json()).project.archivedAt).not.toBeNull()

    const restored = await M.projectsRestore.POST(
      req(`/api/tasks-projects/${project.id}/restore`, 'POST'),
      ctx(project.id),
    )
    expect((await restored.json()).project.archivedAt).toBeNull()
  })

  it('duplicates open tasks into the copy; archived projects refuse', async () => {
    const { project } = await (
      await M.projects.POST(req('/api/tasks-projects', 'POST', { title: 'Dup me' }))
    ).json()
    await createTask({ title: 'Open task', projectId: project.id })

    const dup = await M.projectsDuplicate.POST(
      req(`/api/tasks-projects/${project.id}/duplicate`, 'POST'),
      ctx(project.id),
    )
    expect(dup.status).toBe(201)
    const copy = (await dup.json()).project
    expect(copy.title).toBe('Dup me (copy)')
    const copyTasks = await M.tasks.GET(req(`/api/tasks?projectId=${copy.id}&includeDone=1`, 'GET'))
    expect((await copyTasks.json()).tasks.map((t: { title: string }) => t.title)).toEqual([
      'Open task (copy)',
    ])

    await M.projectsArchive.POST(
      req(`/api/tasks-projects/${project.id}/archive`, 'POST'),
      ctx(project.id),
    )
    const again = await M.projectsDuplicate.POST(
      req(`/api/tasks-projects/${project.id}/duplicate`, 'POST'),
      ctx(project.id),
    )
    expect(again.status).toBe(400)
  })

  it('DELETE moves the project tasks to the inbox', async () => {
    const { project } = await (
      await M.projects.POST(req('/api/tasks-projects', 'POST', { title: 'Doomed project' }))
    ).json()
    const taskId = await createTask({ title: 'Orphan', projectId: project.id })

    const del = await M.projectsId.DELETE(
      req(`/api/tasks-projects/${project.id}`, 'DELETE'),
      ctx(project.id),
    )
    expect(del.status).toBe(200)
    expect(
      (
        await M.projectsId.DELETE(
          req(`/api/tasks-projects/${project.id}`, 'DELETE'),
          ctx(project.id),
        )
      ).status,
    ).toBe(404)

    const taskRes = await M.tasks.GET(req('/api/tasks?projectId=inbox&includeDone=1', 'GET'))
    expect((await taskRes.json()).tasks.some((t: { id: number }) => t.id === taskId)).toBe(true)
  })
})

describe('/api/tasks-tags — tags CRUD', () => {
  it('creates (normalized, unique), patches and unlinks on delete', async () => {
    const created = await M.tags.POST(req('/api/tasks-tags', 'POST', { name: '  deep   work  ' }))
    expect(created.status).toBe(201)
    const { tag } = await created.json()
    expect(tag.name).toBe('deep work')

    const dup = await M.tags.POST(req('/api/tasks-tags', 'POST', { name: 'deep work' }))
    expect(dup.status).toBe(409)

    const patched = await M.tagsId.PATCH(
      req(`/api/tasks-tags/${tag.id}`, 'PATCH', { color: 'teal' }),
      ctx(tag.id),
    )
    expect((await patched.json()).tag.color).toBe('teal')
    expect(
      (await M.tagsId.PATCH(req('/api/tasks-tags/424242', 'PATCH', { color: 'x' }), ctx(424242)))
        .status,
    ).toBe(404)

    const taskId = await createTask({ title: 'Tagged via route' })
    await M.db.setTaskItemTags(taskId, [tag.id])

    const del = await M.tagsId.DELETE(req(`/api/tasks-tags/${tag.id}`, 'DELETE'), ctx(tag.id))
    expect(del.status).toBe(200)
    const taskRes = await M.tasks.GET(req('/api/tasks?includeDone=1&parentId=all', 'GET'))
    const fresh = (await taskRes.json()).tasks.find((t: { id: number }) => t.id === taskId)
    expect(fresh.tagIds).toEqual([])
  })
})

describe('/api/tasks-sections — sections CRUD', () => {
  it('creates in order, patches and deletes', async () => {
    const a = await (
      await M.sections.POST(req('/api/tasks-sections', 'POST', { name: 'Morning' }))
    ).json()
    const b = await (
      await M.sections.POST(req('/api/tasks-sections', 'POST', { name: 'Evening' }))
    ).json()

    const list = await M.sections.GET()
    expect((await list.json()).sections.map((s: { name: string }) => s.name)).toEqual([
      'Morning',
      'Evening',
    ])

    const moved = await M.sectionsId.PATCH(
      req(`/api/tasks-sections/${b.section.id}`, 'PATCH', { sortOrder: -1 }),
      ctx(b.section.id),
    )
    expect(moved.status).toBe(200)
    const reordered = await M.sections.GET()
    expect((await reordered.json()).sections.map((s: { name: string }) => s.name)).toEqual([
      'Evening',
      'Morning',
    ])

    expect(
      (
        await M.sectionsId.DELETE(
          req(`/api/tasks-sections/${a.section.id}`, 'DELETE'),
          ctx(a.section.id),
        )
      ).status,
    ).toBe(200)
    expect(
      (
        await M.sectionsId.DELETE(
          req(`/api/tasks-sections/${a.section.id}`, 'DELETE'),
          ctx(a.section.id),
        )
      ).status,
    ).toBe(404)
  })

  it('rejects a blank name with 400', async () => {
    expect((await M.sections.POST(req('/api/tasks-sections', 'POST', { name: '  ' }))).status).toBe(
      400,
    )
  })
})

describe('/api/tasks-views — saved views (boards) persistence', () => {
  it('creates with rule chips, patches and deletes', async () => {
    const created = await M.views.POST(
      req('/api/tasks-views', 'POST', {
        name: 'Urgent board',
        kind: 'kanban',
        filter: { priority: 'high', tagIds: [1] },
        sortBy: 'due',
      }),
    )
    expect(created.status).toBe(201)
    const { view } = await created.json()
    expect(view.filter).toEqual({ priority: 'high', tagIds: [1] })

    const patched = await M.viewsId.PATCH(
      req(`/api/tasks-views/${view.id}`, 'PATCH', { groupBy: 'priority' }),
      ctx(view.id),
    )
    expect((await patched.json()).view.groupBy).toBe('priority')

    const bad = await M.views.POST(req('/api/tasks-views', 'POST', { name: 'Bad', kind: 'matrix' }))
    expect(bad.status).toBe(400)

    expect(
      (await M.viewsId.DELETE(req(`/api/tasks-views/${view.id}`, 'DELETE'), ctx(view.id))).status,
    ).toBe(200)
    expect(
      (await M.viewsId.DELETE(req(`/api/tasks-views/${view.id}`, 'DELETE'), ctx(view.id))).status,
    ).toBe(404)
  })
})
