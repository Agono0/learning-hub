import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { streaks, xpEvents, withTransaction, updateStreakInTx } from '@learning-hub/db'
import { computeLevel, isFreshStartMoment, dayKey } from '@learning-hub/core'
import { withRoute } from '@/lib/api'

export const runtime = 'nodejs'

function getStreakRow() {
  const [row] = db.select().from(streaks).limit(1).all()
  if (row) return row
  db.insert(streaks).values({}).run()
  const [created] = db.select().from(streaks).limit(1).all()
  return created
}

/** GET /api/streaks — streak state + XP/level summary + fresh-start banner info. */
export async function GET() {
  const row = getStreakRow()
  const [xpRow] = db.select({ total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)` }).from(xpEvents).all()
  const total = xpRow?.total ?? 0
  const level = computeLevel(total)
  return NextResponse.json({
    streak: {
      current: row.current,
      best: row.best,
      lastActiveDate: row.lastActiveDate,
      freezes: row.freezes,
      weekendAmulet: row.weekendAmulet,
    },
    xp: { total, level: level.level, progress: level.progress, xpForNextLevel: level.xpForNextLevel },
    freshStart: isFreshStartMoment(dayKey(new Date())),
    todayDone: row.lastActiveDate === dayKey(new Date()),
  })
}

/**
 * POST /api/streaks — record today's activity. The duplicated read-modify-write
 * of the streaks table is replaced by the shared updateStreakInTx helper inside
 * one transaction (read + write + row-creation are now atomic).
 */
export const POST = withRoute(async () => {
  const next = withTransaction((tx) => {
    const existing = tx.select().from(streaks).limit(1).get()
    if (!existing) {
      tx.insert(streaks).values({}).run()
    }
    return updateStreakInTx(tx, new Date())
  })
  return NextResponse.json({ ok: true, streak: next, todayDone: next.lastActiveDate === dayKey(new Date()) })
})
