/**
 * /api/cognitive/dual-coding — Paivio Dual Coding Theory analysis & multimodal reinforcement.
 *
 * GET  → Analyze a text snippet or card for dual-coding viability.
 * POST → Evaluate composite retention, channel forgetting reduction, and modality suggestions.
 */
import { z } from 'zod'
import { analyzeDualCoding } from '@learning-hub/core'
import { readJson, readQuery, withRoute } from '@/lib/api'

const analyzeQuerySchema = z.object({
  cardId: z.coerce.number().int().positive().optional(),
  text: z.string().default(''),
})

const analyzeInputSchema = z.object({
  cardId: z.number().int().positive().optional(),
  text: z.string().min(1),
  hasImage: z.boolean().optional(),
  hasDiagram: z.boolean().optional(),
  verbalRetention: z.number().min(0).max(1).optional(),
  visualRetention: z.number().min(0).max(1).optional(),
})

export const GET = withRoute(async (req: Request) => {
  const { cardId, text } = readQuery(req, analyzeQuerySchema)
  const analysis = analyzeDualCoding({
    cardId,
    text: text || 'Concept definition',
    hasImage: false,
    hasDiagram: false,
  })
  return Response.json({ ok: true, analysis })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, analyzeInputSchema)
  const analysis = analyzeDualCoding({
    cardId: body.cardId,
    text: body.text,
    hasImage: body.hasImage,
    hasDiagram: body.hasDiagram,
    verbalRetention: body.verbalRetention,
    visualRetention: body.visualRetention,
  })

  return Response.json({ ok: true, analysis })
})
