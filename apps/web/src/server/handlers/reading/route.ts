/**
 * /api/reading — source library + file/text ingest.
 * POST accepts multipart/form-data (PDF → unpdf, EPUB → extractEpubBytes,
 * Markdown/TXT → UTF-8 text) or JSON { title, kind, content, url }.
 */
import { queryId } from '@/lib/query-params'
import { z } from 'zod'
import { extractEpubBytes } from '@learning-hub/core'
import { createSource, deleteSource, listSources } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

/** Upload cap per file, matching the 50 MB apkg import contract. */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

const pasteSourceSchema = z.object({
  title: z.string().trim().min(1, 'title and content required'),
  kind: z.enum(['pdf', 'epub', 'article', 'paste', 'youtube', 'markdown']).optional(),
  content: z.string().trim().min(1, 'title and content required'),
  url: z.string().optional(),
  priority: z.number().int().min(0).max(100).optional(),
})

export const GET = withRoute(async () => {
  const rows = listSources({ limit: 200 })
  return Response.json({ sources: rows })
})

export const POST = withRoute(async (req: Request) => {
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    // Refuse before buffering the multipart body when the client declares an oversized one.
    const declared = Number(req.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + 1024 * 1024) {
      throw new ApiError(413, 'file exceeds the 50MB upload limit')
    }
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      throw new ApiError(400, 'malformed multipart form data')
    }
    const file = form.get('file')
    if (!(file instanceof File)) return Response.json({ error: 'file required' }, { status: 400 })
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ApiError(413, 'file exceeds the 50MB upload limit')
    }
    const rawName = file.name.toLowerCase()
    const customTitle = String(form.get('title') ?? '').trim()
    const priority = Math.min(100, Math.max(0, Number(form.get('priority') ?? 50) || 50))

    if (rawName.endsWith('.pdf')) {
      const title = customTitle || file.name.replace(/\.pdf$/i, '')
      const { extractText, getDocumentProxy } = await import('unpdf')
      const buffer = new Uint8Array(await file.arrayBuffer())
      const pdf = await getDocumentProxy(buffer)
      const { text } = await extractText(pdf, { mergePages: true })
      const source = createSource({ kind: 'pdf', title, content: text, priority })
      return Response.json({ ok: true, source, characters: text.length })
    }

    if (rawName.endsWith('.epub')) {
      const buffer = new Uint8Array(await file.arrayBuffer())
      let extracted: ReturnType<typeof extractEpubBytes>
      try {
        extracted = extractEpubBytes(buffer)
      } catch (err) {
        throw new ApiError(400, err instanceof Error ? err.message : 'invalid EPUB file')
      }
      const title = customTitle || extracted.title || file.name.replace(/\.epub$/i, '')
      const source = createSource({
        kind: 'epub',
        title,
        content: extracted.content,
        priority,
      })
      return Response.json({
        ok: true,
        source,
        chapters: extracted.chapters.length,
        characters: extracted.content.length,
      })
    }

    if (rawName.endsWith('.md') || rawName.endsWith('.markdown') || rawName.endsWith('.txt')) {
      const text = (await file.text()).trim()
      if (!text) throw new ApiError(400, 'uploaded text file is empty')
      const title = customTitle || file.name.replace(/\.(md|markdown|txt)$/i, '')
      const kind = rawName.endsWith('.txt') ? 'paste' : 'markdown'
      const source = createSource({ kind, title, content: text, priority })
      return Response.json({ ok: true, source, characters: text.length })
    }

    return Response.json(
      { error: 'supported file types: .pdf, .epub, .md, .markdown, .txt' },
      { status: 400 },
    )
  }

  const body = await readJson(req, pasteSourceSchema)
  const source = createSource({
    kind: body.kind ?? 'paste',
    title: body.title,
    content: body.content,
    url: body.url ?? null,
    priority: body.priority ?? 50,
  })
  return Response.json({ ok: true, source })
})

export const DELETE = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const id = queryId(url.searchParams, 'id')
  if (id === null) return Response.json({ error: 'id required' }, { status: 400 })

  deleteSource(id)
  return Response.json({ ok: true })
})
