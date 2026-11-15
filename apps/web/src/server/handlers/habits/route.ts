import { z } from 'zod'
import { createHabit, listHabits } from '@learning-hub/db'
import { validateHabit } from '@learning-hub/core'
import { readJson, tzOffsetFromQuery, withRoute } from '@/lib/api'

/** GET /api/habits?all=1&tzOffset=N — habits with chain order, today's state, solidifying stage and 90-day log dates. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const includeArchived = url.searchParams.get('all') === '1'
  const tz = tzOffsetFromQuery(req)
  const result = listHabits({ includeArchived, tzOffset: tz })
  return Response.json(result)
}

const createHabitSchema = z.object({
  name: z.string().optional(),
  cue: z.string().optional(),
  cueType: z.string().optional(),
  craving: z.string().optional(),
  response: z.string().optional(),
  reward: z.string().optional(),
  anchor: z.string().optional(),
})

/** POST /api/habits — create a habit (cue/craving/response/reward validated). */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createHabitSchema)
  const trimOrNull = (v?: string): string | null => {
    const t = v?.trim()
    return t ? t : null
  }

  const cue = trimOrNull(body.cue)
  const craving = trimOrNull(body.craving)
  const response = trimOrNull(body.response)
  const reward = trimOrNull(body.reward)
  const name = body.name?.trim() || (cue ?? '')
  if (name.length < 2) return Response.json({ error: 'Name is required.' }, { status: 400 })

  const validation = validateHabit({ cue, craving, response, reward })
  if (!validation.ok)
    return Response.json(
      {
        error: validation.errors.join(' '),
        errors: validation.errors,
        warnings: validation.warnings,
      },
      { status: 400 },
    )

  const row = createHabit({
    name,
    cue,
    cueType: trimOrNull(body.cueType),
    craving,
    response,
    reward,
    anchor: trimOrNull(body.anchor),
  })

  return Response.json({ habit: row, warnings: validation.warnings }, { status: 201 })
})
