/**
 * Notes↔project linking (S3-93): a note's `fields.projectId` links it to a
 * task project; GET ?projectId filters to those notes; PATCH maintains the
 * link (and null clears every field). The settings-haptics pattern — temp
 * DB, handlers driven with real Requests.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-notes-link-')), 'notes.db')
process.env.LEARNING_HUB_DB = tempDbFile

const json = (method: string, body: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const url = (p: string) => `http://localhost${p}`

type Handlers = {
  notes: typeof import('@/server/handlers/notes/route')
  notesId: typeof import('@/server/handlers/notes/[id]/route')
  projects: typeof import('@/server/handlers/tasks-projects/route')
}

let H: Handlers

beforeAll(async () => {
  H = {
    notes: await import('@/server/handlers/notes/route'),
    notesId: await import('@/server/handlers/notes/[id]/route'),
    projects: await import('@/server/handlers/tasks-projects/route'),
  }
})

describe('S3-93 notes↔project linking', () => {
  it('creates a project and notes, links via fields.projectId, filters by it', async () => {
    const project = await H.projects.POST(
      new Request(url('/api/tasks-projects'), json('POST', { title: 'Thesis' })),
    )
    const projectId = ((await project.json()) as { project: { id: number } }).project.id

    const createNote = async (title: string, fields?: Record<string, string>) => {
      const res = await H.notes.POST(
        new Request(url('/api/notes'), json('POST', { title, fields })),
      )
      const body = (await res.json()) as { note: { id: number } }
      return body.note.id
    }
    const linked = await createNote('Chapter outline', { projectId: String(projectId) })
    const linkedTwo = await createNote('Bibliography', { projectId: String(projectId) })
    await createNote('Unrelated idea')

    const filtered = await H.notes.GET(new Request(url('/api/notes?projectId=' + projectId)))
    const body = (await filtered.json()) as { notes: { id: number; title: string }[] }
    expect(body.notes.map((n) => n.id).sort()).toEqual([linked, linkedTwo].sort())
    expect(body.notes.every((n) => n.title !== 'Unrelated idea')).toBe(true)
  })

  it('combines the query text and the project filter', async () => {
    const res = await H.notes.GET(new Request(url('/api/notes?projectId=1&q=Chapter')))
    const body = (await res.json()) as { notes: { title: string }[] }
    expect(body.notes.length).toBe(1)
    expect(body.notes[0]?.title).toBe('Chapter outline')
  })

  it('PATCH maintains the link and null fields clears it', async () => {
    const created = await H.notes.POST(
      new Request(url('/api/notes'), json('POST', { title: 'To link' })),
    )
    const id = ((await created.json()) as { note: { id: number } }).note.id

    const patched = await H.notesId.PATCH(
      new Request(url('/api/notes/' + id), json('PATCH', { fields: { projectId: '1' } })),
      { params: Promise.resolve({ id: String(id) }) },
    )
    expect(patched.status).toBe(200)

    const linked = await H.notes.GET(new Request(url('/api/notes?projectId=1')))
    const linkedIds = ((await linked.json()) as { notes: { id: number }[] }).notes.map((n) => n.id)
    expect(linkedIds).toContain(id)

    const cleared = await H.notesId.PATCH(
      new Request(url('/api/notes/' + id), json('PATCH', { fields: null })),
      { params: Promise.resolve({ id: String(id) }) },
    )
    expect(cleared.status).toBe(200)
    const after = await H.notes.GET(new Request(url('/api/notes?projectId=1')))
    const afterIds = ((await after.json()) as { notes: { id: number }[] }).notes.map((n) => n.id)
    expect(afterIds).not.toContain(id)
  })

  it('zod rejects a non-numeric projectId at the boundary (rule 5)', async () => {
    const res = await H.notes.GET(new Request(url('/api/notes?projectId=nope')))
    const body = (await res.json()) as { notes: unknown[] }
    // the malformed filter degrades to NO filter — the full list returns
    expect(res.status).toBe(200)
    expect(body.notes.length).toBeGreaterThan(0)
  })
})
