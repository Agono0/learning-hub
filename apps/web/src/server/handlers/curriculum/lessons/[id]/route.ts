/**
 * /api/curriculum/lessons/:id — the lesson player.
 * GET  → theory, worked examples, key terms, resources, reflection prompts,
 *        the lesson's exercise cards, progress and prev/next lesson ids.
 * POST { action: 'start' | 'time' | 'complete' | 'reopen', timeSpentSec?, reflections? }
 *      'complete' awards lesson XP exactly once (first completion).
 */
import { z } from 'zod'
import { XP_REWARDS } from '@learning-hub/core'
import { awardXp, completeLesson, getLessonView, reopenLesson, startLesson } from '@learning-hub/db'
import { db } from '@/lib/db'
import { readJson, withRoute } from '@/lib/api'
import { notFound, routeId, type IdContext } from '../../_shared'

export const GET = withRoute(async (_req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  const view = id ? getLessonView(id) : null
  return view ? Response.json(view) : notFound('lesson')
})

const actionSchema = z.object({
  action: z.enum(['start', 'time', 'complete', 'reopen']),
  /** Seconds studied since the last report (the player sends it periodically). */
  timeSpentSec: z
    .number()
    .min(0)
    .max(4 * 3600)
    .optional(),
  reflections: z.array(z.string().max(5000)).max(10).optional(),
})

export const POST = withRoute(async (req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  const view = id ? getLessonView(id) : null
  if (!id || !view) return notFound('lesson')
  const body = await readJson(req, actionSchema)

  if (body.action === 'start' || body.action === 'time') {
    startLesson(id, body.timeSpentSec ?? 0)
    return Response.json({ ok: true })
  }
  if (body.action === 'reopen') {
    reopenLesson(id)
    return Response.json({ ok: true, status: 'in_progress' })
  }
  const firstTime = completeLesson(id, {
    reflections: body.reflections,
    timeSpentSec: body.timeSpentSec,
  })
  if (firstTime) {
    // Rule 7: XP via the canonical awardXp path (repos/xp.ts).
    awardXp(db, { source: 'lesson', meta: { lessonId: id, title: view.lesson.title } })
  }
  return Response.json({
    ok: true,
    status: 'completed',
    xpEarned: firstTime ? XP_REWARDS.lesson : 0,
    nextLessonId: view.nextLessonId,
  })
})
