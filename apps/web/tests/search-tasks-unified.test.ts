/**
 * Unified search (S3-38) — tasks rank in the same /api/search envelope as
 * the knowledge surfaces.
 *
 * DB-backed (isolated temp DB like search-palette.test.ts): a task is
 * created through the SP repo, then the handler returns it as a `task` hit
 * — ranked by the core engine (title-prefix > substring > notes), with
 * `done: true` for completed tasks and won't-do tasks excluded (S3-66).
 * Knowledge-surface hits (mode) are unchanged: tasks PREPEND, never
 * replace.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

// Isolated temp DB — must be set before any @learning-hub/db import resolves.
process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-search-unified-')), 'api.db')

interface ApiHit {
  kind: string
  id: number
  title: string
  snippet: string
  href: string
  done?: boolean
}

let searchGet: (req: Request) => Promise<Response>

beforeAll(async () => {
  const handler = await import('../src/server/handlers/search/route')
  searchGet = handler.GET as unknown as (req: Request) => Promise<Response>
})

/** Invoke GET /api/search?q=… against the temp DB. */
async function search(q: string): Promise<{ ok: boolean; hits: ApiHit[]; mode: string }> {
  const res = await searchGet(
    new Request(`http://localhost:3000/api/search?q=${encodeURIComponent(q)}`),
  )
  return (await res.json()) as { ok: boolean; hits: ApiHit[]; mode: string }
}

describe('unified search: tasks + knowledge surfaces', () => {
  it('finds an open task by title and serves it as a task hit', async () => {
    const { createTaskItem } = await import('@learning-hub/db')
    createTaskItem({
      title: 'Finish FSRS-6 tuning writeup',
      notes: 'compare against SM-2 baseline',
    })

    const data = await search('FSRS')
    expect(data.ok).toBe(true)
    const hit = data.hits.find((h) => h.kind === 'task')
    expect(hit).toBeDefined()
    expect(hit?.title).toBe('Finish FSRS-6 tuning writeup')
    expect(hit?.done).toBe(false)
    expect(hit?.href).toBe('/tasks')
    // Tasks rank ahead of the knowledge surfaces in the unified envelope.
    expect(data.hits[0].kind).toBe('task')
  })

  it('matches task notes too, with the note text as the snippet', async () => {
    const data = await search('baseline')
    const hit = data.hits.find((h) => h.kind === 'task')
    expect(hit).toBeDefined()
    expect(hit?.snippet).toContain('baseline')
  })

  it('marks done tasks (the hit carries done: true)', async () => {
    const { createTaskItem, completeTaskItem } = await import('@learning-hub/db')
    const done = createTaskItem({ title: 'Read spaced repetition survey' })
    completeTaskItem(done.id)

    const data = await search('survey')
    const readHit = data.hits.find(
      (h) => h.kind === 'task' && h.title === 'Read spaced repetition survey',
    )
    expect(readHit).toBeDefined()
    expect(readHit?.done).toBe(true)
  })

  it('empty query returns no task hits (no "search everything")', async () => {
    const data = await search('')
    expect(data.hits.filter((h) => h.kind === 'task')).toEqual([])
  })
})
