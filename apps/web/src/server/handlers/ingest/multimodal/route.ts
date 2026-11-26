/**
 * /api/ingest/multimodal — Universal ingestion: YouTube transcripts, papers & code.
 *
 * POST → a PREVIEW of generated cards (pure, nothing stored). Each card also comes
 * with its `{ type, content }` save item, which the page sends through the normal
 * validated bulk path (`PUT /api/cards?bulk=1`) once the learner picks a deck — so
 * ingestion never bypasses card validation or writes cards the learner didn't keep.
 */
import { z } from 'zod'
import {
  extractMarkdownNotesAndClozes,
  extractPaperFormulasAndDefinitions,
  generateCodeClozeCards,
  generateVideoCards,
  ingestedCardToCardItem,
  parseTranscriptSegments,
  type IngestedCardOutput,
} from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

/** ~500 KB of text — a long lecture transcript or paper; beyond that, split it. */
const MAX_CONTENT_CHARS = 500_000

/**
 * JSON body cap for this route. rawContent counts UTF-16 units but the body counts bytes: a unit
 * costs up to 3 bytes as UTF-8 and 6 as a `\uXXXX` escape, and title, sourceUrl and filename add up
 * to 2400 units more.
 */
const MAX_MULTIMODAL_BODY_BYTES = (MAX_CONTENT_CHARS + 2400) * 6 + 4 * 1024

const multimodalIngestSchema = z.object({
  kind: z.enum(['youtube_transcript', 'academic_paper', 'code_files', 'markdown_notes']),
  rawContent: z.string().min(5).max(MAX_CONTENT_CHARS),
  title: z.string().trim().max(200).default('Ingested Source'),
  sourceUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((u) => /^https?:\/\//i.test(u), 'sourceUrl must be an http(s) URL')
    .optional(),
  filename: z.string().trim().min(1).max(200).optional(),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, multimodalIngestSchema, { maxBytes: MAX_MULTIMODAL_BODY_BYTES })
  const title = body.title || 'Ingested Source'

  let cards: IngestedCardOutput[]
  let segmentCount: number | undefined
  switch (body.kind) {
    case 'youtube_transcript': {
      const segments = parseTranscriptSegments(body.rawContent)
      segmentCount = segments.length
      // No URL → cards without a deep link (never a link to a site's home page).
      cards = generateVideoCards(title, body.sourceUrl ?? '', segments)
      break
    }
    case 'academic_paper':
      cards = extractPaperFormulasAndDefinitions(body.rawContent)
      break
    case 'code_files':
      cards = generateCodeClozeCards(body.filename ?? 'code.ts', body.rawContent)
      break
    case 'markdown_notes':
      cards = extractMarkdownNotesAndClozes(body.rawContent)
      break
  }

  return Response.json({
    ok: true,
    kind: body.kind,
    ...(segmentCount !== undefined ? { segmentCount } : {}),
    cardCount: cards.length,
    cards,
    items: cards.map(ingestedCardToCardItem),
  })
})
