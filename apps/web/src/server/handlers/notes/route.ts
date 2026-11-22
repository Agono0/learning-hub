/**
 * /api/notes — list + create notes. On create, [[wikilinks]] to existing notes
 * become note_links and markdown bullets become note_bullets rows.
 */
import { z } from 'zod'
import { createNote, listNotes } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const createNoteSchema = z.object({
  title: z.string().trim().min(1, 'title required'),
  content: z.string().optional(),
  supertag: z.enum(['BIBLIDEF', 'DEFINITION', 'THEOREM', 'PERSON', 'BOOK', 'CORNELL']).optional(),
  fields: z.record(z.string(), z.string()).optional(),
  status: z.enum(['inbox', 'project', 'area', 'resource', 'archive']).optional(),
  deckId: z.number().int().positive().optional(),
})

export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get('q')
  // S3-93: ?projectId=7 filters to notes linked to that task project
  // (fields.projectId, maintained by the notes PATCH fields path).
  const projectIdRaw = url.searchParams.get('projectId')
  const projectId =
    projectIdRaw !== null && /^\d+$/.test(projectIdRaw) ? Number(projectIdRaw) : undefined
  const rows = listNotes({ query: q, projectId, limit: 100 })
  return Response.json({ notes: rows })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createNoteSchema)
  const res = createNote({
    title: body.title,
    content: body.content,
    supertag: body.supertag,
    fields: body.fields,
    status: body.status,
    deckId: body.deckId,
  })
  return Response.json({ ok: true, note: res.note, links: res.links, bullets: res.bulletsCount })
})
