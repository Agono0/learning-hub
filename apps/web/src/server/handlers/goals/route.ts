import { desc } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { goals } from '@learning-hub/db'
import { validateWoopGoal } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

/** GET /api/goals — WOOP goals, newest first. */
export async function GET() {
  const rows = db.select().from(goals).orderBy(desc(goals.createdAt)).all()
  return Response.json({ goals: rows })
}

const createGoalSchema = z.object({
  wish: z.string().optional(),
  outcome: z.string().nullable().optional(),
  obstacle: z.string().nullable().optional(),
  ifThenPlan: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
})

/** POST /api/goals — create a WOOP goal (validated: wish + if-then plan shape). */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createGoalSchema)
  const asString = (v?: string | null): string | null =>
    v !== undefined && v !== null && v.trim() !== '' ? v : null
  const wish = body.wish ?? ''
  const outcome = asString(body.outcome)
  const obstacle = asString(body.obstacle)
  const ifThenPlan = asString(body.ifThenPlan)
  const dueDate = asString(body.dueDate)

  const validation = validateWoopGoal({ wish, outcome, obstacle, ifThenPlan, dueDate })
  if (!validation.ok) {
    return Response.json(
      { error: validation.errors.join(' '), errors: validation.errors },
      { status: 400 },
    )
  }

  const [row] = db
    .insert(goals)
    .values({ wish: wish.trim(), outcome, obstacle, ifThenPlan, dueDate })
    .returning()
    .all()
  return Response.json({ goal: row }, { status: 201 })
})
