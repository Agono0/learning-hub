/**
 * /api/notes/[id] — read (with backlinks + bullets), update (re-sync wikilink
 * links + bullet sync plan), delete.
 */
import { z } from 'zod'
import { deleteNote, getNoteDetail, updateNote } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const patchNoteSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  supertag: z
    .enum(['BIBLIDEF', 'DEFINITION', 'THEOREM', 'PERSON', 'BOOK', 'CORNELL'])
    .nullable()
    .optional(),
  fields: z.record(z.string(), z.string()).nullable().optional(),
  status: z.enum(['inbox', 'project', 'area', 'resource', 'archive']).optional(),
})

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const noteId = Number(id)
  const detail = getNoteDetail(noteId)
  if (!detail) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json(detail)
}

export const PATCH = withRoute(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const noteId = Number(id)
  const body = await readJson(req, patchNoteSchema)

  const res = updateNote(noteId, body)
  if (!res.note) return Response.json({ error: 'not found' }, { status: 404 })

  return Response.json({
    ok: true,
    bulletsPlan: res.bulletsPlan,
    linksCreated: res.linksCreated,
  })
})

export const DELETE = withRoute(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const noteId = Number(id)
  const ok = deleteNote(noteId)
  if (!ok) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json({ ok: true })
})
