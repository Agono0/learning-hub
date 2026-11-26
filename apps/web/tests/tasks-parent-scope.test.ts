/**
 * Regression: six task pages request `/api/tasks?parentId=any`, but the list schema only accepted
 * all|top|<id>, so every one of those requests threw out of an unwrapped GET and returned 500
 * (found by the visual smoke error capture on /tasks). `any` is now an alias of `all`, and an
 * invalid scope is a 400 instead of a 500. Isolated temp SQLite DB, no network.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-tasks-scope-')), 'tasks.db')

type Modules = { tasks: typeof import('../app/api/tasks/route') }
let M: Modules

const get = (qs: string) => M.tasks.GET(new Request(`http://localhost/api/tasks${qs}`))
const post = (body: unknown) =>
  M.tasks.POST(
    new Request('http://localhost/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

beforeAll(async () => {
  M = { tasks: await import('../app/api/tasks/route') }
})

describe('GET /api/tasks parentId scope', () => {
  it('parentId=any and parentId=all both include subtasks, top excludes them', async () => {
    const { task: parent } = (await (await post({ title: 'Parent' })).json()) as {
      task: { id: number }
    }
    const created = await post({ title: 'Child', parentId: parent.id })
    expect(created.status).toBe(201)

    const ids = async (qs: string) => {
      const res = await get(qs)
      expect(res.status).toBe(200)
      const body = (await res.json()) as { tasks: { title: string }[] }
      return body.tasks.map((t) => t.title).sort()
    }
    expect(await ids('?parentId=any&includeDone=1')).toEqual(['Child', 'Parent'])
    expect(await ids('?parentId=all&includeDone=1')).toEqual(['Child', 'Parent'])
    expect(await ids('?parentId=top')).toEqual(['Parent'])
  })

  it('an invalid scope is a 400, not a 500', async () => {
    const res = await get('?parentId=bogus')
    expect(res.status).toBe(400)
  })
})
