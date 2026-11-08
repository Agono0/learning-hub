/**
 * /api/ingest/multimodal — Universal ingestion: YouTube, ArXiv PDFs & GitHub repositories.
 */
import { z } from 'zod'
import {
  extractPaperFormulasAndDefinitions,
  generateCodeClozeCards,
  generateVideoCards,
  parseTranscriptSegments,
} from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const multimodalIngestSchema = z.object({
  kind: z.enum(['youtube_transcript', 'academic_paper', 'code_files']),
  rawContent: z.string().min(5),
  title: z.string().default('Ingested Source'),
  sourceUrl: z.string().optional(),
  filename: z.string().optional(),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, multimodalIngestSchema)

  if (body.kind === 'youtube_transcript') {
    const segments = parseTranscriptSegments(body.rawContent)
    const cards = generateVideoCards(body.title, body.sourceUrl ?? 'https://youtube.com', segments)
    return Response.json({
      ok: true,
      kind: body.kind,
      segmentCount: segments.length,
      cardCount: cards.length,
      cards,
    })
  }

  if (body.kind === 'academic_paper') {
    const cards = extractPaperFormulasAndDefinitions(body.rawContent)
    return Response.json({
      ok: true,
      kind: body.kind,
      cardCount: cards.length,
      cards,
    })
  }

  if (body.kind === 'code_files') {
    const cards = generateCodeClozeCards(body.filename ?? 'code.ts', body.rawContent)
    return Response.json({
      ok: true,
      kind: body.kind,
      cardCount: cards.length,
      cards,
    })
  }

  return Response.json({ ok: false, error: 'Unsupported media kind' }, { status: 400 })
})
