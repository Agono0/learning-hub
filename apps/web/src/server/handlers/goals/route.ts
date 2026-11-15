import { z } from 'zod'
import { createGoal, listGoals } from '@learning-hub/db'
import { MAX_IF_THEN_CHARS, validateWoopGoal } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

/** GET /api/goals — WOOP goals, newest first. */
export async function GET() {
  const rows = listGoals()
  return Response.json({ goals: rows })
}

const createGoalSchema = z.object({
  wish: z.string().optional(),
  outcome: z.string().nullable().optional(),
  obstacle: z.string().nullable().optional(),
  ifThenPlan: z.string().nullable().optional(),
  // structured implementation intention (Gollwitzer & Sheeran 2006, d = 0.65)
  ifCondition: z.string().max(MAX_IF_THEN_CHARS).nullable().optional(),
  thenAction: z.string().max(MAX_IF_THEN_CHARS).nullable().optional(),
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
  const ifCondition = asString(body.ifCondition)
  const thenAction = asString(body.thenAction)
  const dueDate = asString(body.dueDate)

  const validation = validateWoopGoal({
    wish,
    outcome,
    obstacle,
    ifThenPlan,
    ifCondition,
    thenAction,
    dueDate,
  })
  if (!validation.ok) {
    return Response.json(
      { error: validation.errors.join(' '), errors: validation.errors },
      { status: 400 },
    )
  }

  const row = createGoal({
    wish: wish.trim(),
    outcome,
    obstacle,
    ifThenPlan,
    ifCondition,
    thenAction,
    dueDate,
  })
  return Response.json({ goal: row }, { status: 201 })
})
