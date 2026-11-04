import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { focusSessions } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

/** GET /api/focus — recent sessions (newest first) + the currently running one. */
export async function GET() {
  const rows = db
    .select()
    .from(focusSessions)
    .orderBy(desc(focusSessions.startedAt))
    .limit(20)
    .all()
  const [running] = db
    .select()
    .from(focusSessions)
    .where(eq(focusSessions.completed, false))
    .orderBy(desc(focusSessions.startedAt))
    .limit(1)
    .all()
  return Response.json({ sessions: rows, running: running ?? null })
}

const startSessionSchema = z.object({
  plannedMinutes: z
    .number()
    .min(1, 'plannedMinutes must be between 1 and 600')
    .max(600, 'plannedMinutes must be between 1 and 600'),
  type: z.enum(['pomodoro', 'deep', 'custom']).optional(),
  task: z.string().optional(),
})

/** POST /api/focus { plannedMinutes, type?, task? } — start a session. */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, startSessionSchema)
  const task = body.task?.trim() || null

  const [row] = db
    .insert(focusSessions)
    .values({
      startedAt: new Date().toISOString(),
      plannedMinutes: body.plannedMinutes,
      type: body.type ?? 'pomodoro',
      task,
    })
    .returning()
    .all()
  return Response.json({ session: row }, { status: 201 })
})
