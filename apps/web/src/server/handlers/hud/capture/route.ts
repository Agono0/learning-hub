/**
 * /api/hud/capture — Quick capture thoughts, notes, and external URLs from global HUD.
 */
import { queryId, queryLimit } from '@/lib/query-params'
import { z } from 'zod'
import {
  createQuickCapture,
  deleteQuickCapture,
  listQuickCaptures,
  markQuickCaptureProcessed,
} from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const captureSchema = z.object({
  text: z.string().min(1),
  sourceUrl: z.string().url().optional().or(z.literal('')),
  sourceTitle: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

const updateCaptureSchema = z.object({
  id: z.number().int().positive(),
  processed: z.boolean(),
})

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const limit = queryLimit(url.searchParams, 50, 100)
  const includeProcessed = url.searchParams.get('includeProcessed') === 'true'

  const captures = listQuickCaptures(limit, includeProcessed)
  return Response.json({
    ok: true,
    captures,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, captureSchema)
  const capture = createQuickCapture({
    text: body.text,
    sourceUrl: body.sourceUrl || null,
    sourceTitle: body.sourceTitle || null,
    tags: body.tags || [],
  })

  return Response.json({
    ok: true,
    capture,
  })
})

export const PATCH = withRoute(async (req: Request) => {
  const body = await readJson(req, updateCaptureSchema)
  const success = markQuickCaptureProcessed(body.id, body.processed)

  return Response.json({
    ok: success,
  })
})

export const DELETE = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const id = queryId(url.searchParams, 'id')
  if (id === null) {
    return Response.json({ ok: false, error: 'Valid id required' }, { status: 400 })
  }
  const deleted = deleteQuickCapture(id)
  return Response.json({ ok: deleted })
})
