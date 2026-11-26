/**
 * /api/context-variability: where and when the learner studies, performance
 * goals, and an audit of whether recall travels across contexts.
 * GET returns the audit, report, open session, recent sessions and goals.
 * POST starts, ends or logs a session, and adds or archives a goal.
 * Cards, schedules and reviews are never changed here.
 */
import { z } from 'zod'
import { ApiError, readJson, readQuery, withRoute } from '@/lib/api'
import {
  ContextLimitError,
  ContextValidationError,
  addContextGoal,
  archiveContextGoal,
  endContextSession,
  getOpenContextSession,
  listContextGoals,
  listContextSessions,
  logContextSession,
  runContextAuditDb,
  startContextSession,
} from '@learning-hub/db'

const noise = z.enum(['quiet', 'moderate', 'loud'])

const querySchema = z.object({
  windowDays: z.coerce.number().int().min(7).max(365).default(60),
  /** Minutes east of UTC. Default: the server's offset. */
  tz: z.coerce.number().int().min(-720).max(840).optional(),
})

/** GET /api/context-variability?windowDays&tz */
export const GET = withRoute(async (req: Request) => {
  const q = readQuery(req, querySchema)
  const run = runContextAuditDb({ windowDays: q.windowDays, tzOffsetMinutes: q.tz })
  return Response.json({
    ...run,
    open: getOpenContextSession(),
    sessions: listContextSessions(20),
    goals: listContextGoals(),
  })
})

const place = z.string().min(2).max(60)
const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    place,
    noise: noise.nullish(),
    tags: z.array(z.string().max(30)).max(8).optional(),
  }),
  z.object({ action: z.literal('end'), id: z.number().int().positive().optional() }),
  z.object({
    action: z.literal('log'),
    place,
    startedAt: z.string().max(40),
    endedAt: z.string().max(40),
    noise: noise.nullish(),
    tags: z.array(z.string().max(30)).max(8).optional(),
  }),
  z.object({
    action: z.literal('goal-add'),
    label: z.string().min(2).max(60),
    place,
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(0).max(24),
    noise: noise.nullish(),
  }),
  z.object({ action: z.literal('goal-archive'), id: z.number().int().positive() }),
])

/** Map repository errors to 400 and 409. */
function guard<T>(fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    if (e instanceof ContextValidationError) throw new ApiError(400, e.message)
    if (e instanceof ContextLimitError) throw new ApiError(409, e.message)
    throw e
  }
}

/** POST /api/context-variability { action: start | end | log | goal-add | goal-archive }. */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, bodySchema)
  switch (body.action) {
    case 'start': {
      const r = guard(() => startContextSession(body))
      return Response.json(r, { status: r.created ? 201 : 200 })
    }
    case 'end': {
      const session = endContextSession(body.id)
      if (!session) throw new ApiError(404, 'No open session to end')
      return Response.json({ session })
    }
    case 'log': {
      const r = guard(() => logContextSession(body))
      return Response.json(r, { status: r.created ? 201 : 200 })
    }
    case 'goal-add': {
      const r = guard(() => addContextGoal(body))
      return Response.json(r, { status: r.created ? 201 : 200 })
    }
    case 'goal-archive': {
      if (!archiveContextGoal(body.id)) throw new ApiError(404, 'Goal not found')
      return Response.json({ ok: true })
    }
  }
})
