import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { eventBus } from '@learning-hub/core'
import { goals } from '@learning-hub/db'
import { validateWoopGoal } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

type Params = { params: Promise<{ id: string }> }

const patchGoalSchema = z.object({
  wish: z.string().optional(),
  outcome: z.string().nullable().optional(),
  obstacle: z.string().nullable().optional(),
  ifThenPlan: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(['active', 'done', 'dropped']).optional(),
  progressPct: z.number().optional(),
})

/** PATCH /api/goals/[id] — edit WOOP fields, status, or progress. */
export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const { id } = await params
  const goalId = Number.parseInt(id, 10)
  if (!Number.isInteger(goalId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const [existing] = db.select().from(goals).where(eq(goals.id, goalId)).all()
  if (!existing) return Response.json({ error: 'Goal not found' }, { status: 404 })

  const body = await readJson(req, patchGoalSchema)
  // sent-and-empty clears the field (→ null); absent keeps the stored value
  const cleared = (v: string | null | undefined, current: string | null): string | null => {
    if (v === undefined || v === null) return v === null ? null : current
    return v.trim() !== '' ? v : null
  }

  const next = {
    wish: body.wish?.trim() || existing.wish,
    outcome: cleared(body.outcome, existing.outcome),
    obstacle: cleared(body.obstacle, existing.obstacle),
    ifThenPlan: cleared(body.ifThenPlan, existing.ifThenPlan),
    dueDate: cleared(body.dueDate, existing.dueDate),
    status: body.status ?? existing.status,
    progressPct:
      body.progressPct !== undefined && Number.isFinite(body.progressPct)
        ? Math.min(100, Math.max(0, body.progressPct))
        : existing.progressPct,
  }

  const validation = validateWoopGoal({
    wish: next.wish,
    outcome: next.outcome,
    obstacle: next.obstacle,
    ifThenPlan: next.ifThenPlan,
    dueDate: next.dueDate,
  })
  if (!validation.ok)
    return Response.json(
      { error: validation.errors.join(' '), errors: validation.errors },
      { status: 400 },
    )

  const [row] = db.update(goals).set(next).where(eq(goals.id, goalId)).returning().all()

  // Fact after the write: a WOOP goal reached `done` for the first time.
  if (row && existing.status !== 'done' && row.status === 'done') {
    eventBus.emit('goal.completed', { goalId: row.id })
  }

  return Response.json({ goal: row })
})

/** DELETE /api/goals/[id] */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const goalId = Number.parseInt(id, 10)
  if (!Number.isInteger(goalId)) return Response.json({ error: 'Invalid id' }, { status: 400 })
  db.delete(goals).where(eq(goals.id, goalId)).run()
  return Response.json({ ok: true })
}
