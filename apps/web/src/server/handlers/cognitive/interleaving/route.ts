/**
 * /api/cognitive/interleaving — Rohrer & Taylor interleaving practice scheduler & discrimination engine.
 *
 * GET  → Return sample interleaving optimization demonstration.
 * POST → Compute optimal interleaved sequence for candidate items with category entropy and reflection prompts.
 */
import { z } from 'zod'
import {
  computeInterleavingSchedule,
  interleavingItemSchema,
  interleavingScheduleOptionsSchema,
} from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const interleavingRequestSchema = z.object({
  items: z.array(interleavingItemSchema),
  options: interleavingScheduleOptionsSchema.partial().optional(),
})

export const GET = withRoute(async () => {
  const sampleItems = [
    { id: '1', categoryId: 'calculus', difficulty: 0.8, urgency: 0.9, title: 'Derivatives' },
    { id: '2', categoryId: 'calculus', difficulty: 0.7, urgency: 0.8, title: 'Integrals' },
    { id: '3', categoryId: 'linear_algebra', difficulty: 0.6, urgency: 0.7, title: 'Matrices' },
    { id: '4', categoryId: 'linear_algebra', difficulty: 0.5, urgency: 0.6, title: 'Eigenvalues' },
    { id: '5', categoryId: 'probability', difficulty: 0.6, urgency: 0.8, title: 'Bayes Theorem' },
  ]

  const result = computeInterleavingSchedule(sampleItems, { maxConsecutiveCategory: 1 })
  return Response.json({ ok: true, result })
})

export const POST = withRoute(async (req: Request) => {
  const { items, options } = await readJson(req, interleavingRequestSchema)
  const result = computeInterleavingSchedule(items, options ?? {})
  return Response.json({ ok: true, result })
})
