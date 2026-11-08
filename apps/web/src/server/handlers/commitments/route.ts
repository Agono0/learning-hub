import { z } from 'zod'
import {
  createCommitment,
  deleteCommitment,
  listCommitments,
  updateCommitment,
} from '@learning-hub/db'
import { readJson, tzOffsetFromQuery, withRoute } from '@/lib/api'

/** GET /api/commitments?tzOffset=N — contracts + this week's honest report. */
export async function GET(req: Request) {
  const tz = tzOffsetFromQuery(req)
  const result = listCommitments({ tzOffset: tz })
  return Response.json(result)
}

const createCommitmentSchema = z.object({
  title: z
    .string()
    .trim()
    .min(
      3,
      'title, metric (reviews|focus_minutes|lessons) and a positive integer threshold are required',
    ),
  metric: z.enum(['reviews', 'focus_minutes', 'lessons'], {
    message:
      'title, metric (reviews|focus_minutes|lessons) and a positive integer threshold are required',
  }),
  threshold: z
    .number()
    .int()
    .positive(
      'title, metric (reviews|focus_minutes|lessons) and a positive integer threshold are required',
    ),
  stakes: z.string().optional(),
  endsAt: z.string().optional(),
})

/** POST /api/commitments { title, metric, threshold, stakes?, endsAt? } */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createCommitmentSchema)
  const row = createCommitment({
    title: body.title,
    metric: body.metric,
    threshold: body.threshold,
    stakes: body.stakes,
    endsAt: body.endsAt,
  })
  return Response.json({ commitment: row }, { status: 201 })
})

const patchCommitmentSchema = z.object({
  title: z.string().optional(),
  metric: z.enum(['reviews', 'focus_minutes', 'lessons']).optional(),
  threshold: z.number().int().positive().optional(),
  stakes: z.string().nullable().optional(),
  status: z.enum(['active', 'kept', 'broken', 'cancelled']).optional(),
  endsAt: z.string().nullable().optional(),
})

/** PATCH /api/commitments?id=N { title?, metric?, threshold?, stakes?, status?, endsAt? } */
export const PATCH = withRoute(async (req: Request) => {
  const id = Number.parseInt(new URL(req.url).searchParams.get('id') ?? '', 10)
  if (!Number.isInteger(id))
    return Response.json({ error: 'id query param required' }, { status: 400 })

  const body = await readJson(req, patchCommitmentSchema)
  const row = updateCommitment(id, body)
  if (!row) return Response.json({ error: 'Commitment not found' }, { status: 404 })

  return Response.json({ commitment: row })
})

/** DELETE /api/commitments?id=N */
export async function DELETE(req: Request) {
  const id = Number.parseInt(new URL(req.url).searchParams.get('id') ?? '', 10)
  if (!Number.isInteger(id))
    return Response.json({ error: 'id query param required' }, { status: 400 })
  deleteCommitment(id)
  return Response.json({ ok: true })
}
