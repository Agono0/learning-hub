import { desc } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { frictionEvents } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

/** GET /api/friction — recent gate outcomes (for the honesty log). */
export async function GET() {
  const rows = db
    .select()
    .from(frictionEvents)
    .orderBy(desc(frictionEvents.createdAt))
    .limit(20)
    .all()
  return Response.json({ events: rows })
}

const frictionSchema = z.object({
  trigger: z.enum(['break_focus', 'relapse', 'distraction'], {
    message: 'trigger must be break_focus | relapse | distraction',
  }),
  proceeded: z.boolean().optional(),
  reflection: z.string().optional(),
  sessionId: z.number().int().positive().optional(),
  delaySec: z.number().min(0).optional(),
})

/**
 * POST /api/friction { trigger, proceeded, reflection?, sessionId?, delaySec? }
 * — persist the outcome of a full friction-gate run. Append-only.
 */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, frictionSchema)
  const proceeded = body.proceeded === true
  const reflection = body.reflection?.trim() || null
  const delaySec = body.delaySec !== undefined ? Math.round(body.delaySec) : 10

  if (proceeded && !reflection) {
    return Response.json({ error: 'Proceeding requires the written reflection.' }, { status: 400 })
  }

  const [row] = db
    .insert(frictionEvents)
    .values({
      trigger: body.trigger,
      proceeded,
      reflection,
      sessionId: body.sessionId ?? null,
      delaySec,
    })
    .returning()
    .all()
  return Response.json({ event: row }, { status: 201 })
})
