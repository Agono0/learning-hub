/**
 * /api/reading — source library + ingest.
 * POST accepts multipart/form-data (file: PDF → unpdf extractText) or JSON
 * { title, kind, content, url } for pasted articles.
 */
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, highlights, sources } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

const pasteSourceSchema = z.object({
  title: z.string().trim().min(1, 'title and content required'),
  kind: z.enum(['pdf', 'article', 'paste', 'youtube']).optional(),
  content: z.string().trim().min(1, 'title and content required'),
  url: z.string().optional(),
  priority: z.number().int().min(0).max(100).optional(),
})

export async function GET() {
  const rows = await db.select().from(sources).orderBy(desc(sources.priority)).limit(200)
  return Response.json({ sources: rows })
}

export const POST = withRoute(async (req: Request) => {
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      throw new ApiError(400, 'malformed multipart form data')
    }
    const file = form.get('file')
    if (!(file instanceof File)) return Response.json({ error: 'file required' }, { status: 400 })
    const title = String(form.get('title') ?? '') || file.name.replace(/\.pdf$/i, '')
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return Response.json(
        { error: 'only PDF upload is supported here — paste text for other kinds' },
        { status: 400 },
      )
    }
    const { extractText, getDocumentProxy } = await import('unpdf')
    const buffer = new Uint8Array(await file.arrayBuffer())
    const pdf = await getDocumentProxy(buffer)
    const { text } = await extractText(pdf, { mergePages: true })
    const [source] = await db
      .insert(sources)
      .values({ kind: 'pdf', title, content: text, priority: 50 })
      .returning()
    return Response.json({ ok: true, source, characters: text.length })
  }

  const body = await readJson(req, pasteSourceSchema)
  const [source] = await db
    .insert(sources)
    .values({
      kind: body.kind ?? 'paste',
      title: body.title,
      content: body.content,
      url: body.url ?? null,
      priority: body.priority ?? 50,
    })
    .returning()
  return Response.json({ ok: true, source })
})

export const DELETE = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const id = Number(url.searchParams.get('id'))
  if (!id || Number.isNaN(id)) return Response.json({ error: 'id required' }, { status: 400 })

  db.transaction((tx) => {
    tx.delete(highlights).where(eq(highlights.sourceId, id)).run()
    tx.delete(sources).where(eq(sources.id, id)).run()
  })

  return Response.json({ ok: true })
})
