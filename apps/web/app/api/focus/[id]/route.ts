import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ensurePluginsLoaded } from '@/lib/plugins'
import { focusSessions, xpEvents, withTransaction, updateStreakInTx } from '@learning-hub/db'
import { XP_REWARDS, eventBus } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

const endSessionSchema = z.object({
  actualMinutes: z.number().min(0).optional(),
  leaks: z.number().int().min(0).optional(),
  completed: z.boolean().optional(),
  mood: z.number().int().min(1).max(5).optional(),
  notes: z.string().optional(),
})

/**
 * PATCH /api/focus/[id] { actualMinutes, leaks, completed, mood?, notes? }
 * — end a session. Completing pays XP (source 'focus') and records streak
 * activity via the shared updateStreakInTx helper, all in one transaction so
 * the session state and its rewards commit atomically.
 */
export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  await ensurePluginsLoaded() // plugins must be registered before events can fire
  const { id } = await params
  const sessionId = Number.parseInt(id, 10)
  if (!Number.isInteger(sessionId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const [existing] = db.select().from(focusSessions).where(eq(focusSessions.id, sessionId)).all()
  if (!existing) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const body = await readJson(req, endSessionSchema)
  const actualMinutes =
    body.actualMinutes !== undefined && Number.isFinite(body.actualMinutes)
      ? Math.round(body.actualMinutes * 10) / 10
      : undefined
  const notes = body.notes !== undefined ? body.notes : existing.notes

  const result = withTransaction((tx) => {
    const [row] = tx
      .update(focusSessions)
      .set({
        endedAt: new Date().toISOString(),
        actualMinutes: actualMinutes ?? existing.actualMinutes,
        leaks: body.leaks ?? existing.leaks,
        completed: body.completed ?? existing.completed,
        mood: body.mood !== undefined ? body.mood : existing.mood,
        notes,
      })
      .where(eq(focusSessions.id, sessionId))
      .returning()
      .all()

    let xpAwarded = 0
    if ((body.completed ?? existing.completed) && !existing.completed) {
      xpAwarded = XP_REWARDS.focusSession
      tx.insert(xpEvents)
        .values({ source: 'focus', amount: xpAwarded, meta: { sessionId, plannedMinutes: existing.plannedMinutes, task: existing.task } })
        .run()
      // focus work counts toward the streak
      updateStreakInTx(tx, new Date())
    }

    return { row, xpAwarded }
  })

  // Completion transitioned this request (the same branch that pays XP) —
  // publish focus.completed after the commit, so listeners see durable state.
  if (result.xpAwarded > 0) {
    eventBus.emit('focus.completed', { durationMs: Math.round((result.row.actualMinutes ?? 0) * 60_000) })
  }

  return NextResponse.json({ session: result.row, xpAwarded: result.xpAwarded })
})
