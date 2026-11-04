import { NextResponse } from 'next/server'
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { commitments, focusSessions, lessons } from '@learning-hub/db'
import { dayKey } from '@learning-hub/core'
import { readJson, tzOffsetFromQuery, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

const METRICS = ['reviews', 'focus_minutes', 'lessons'] as const
type Metric = (typeof METRICS)[number]

function mondayOf(date: Date, tzOffsetMinutes = 0): string {
  const key = dayKey(date, tzOffsetMinutes)
  const d = new Date(key + 'T00:00:00Z')
  const shift = (d.getUTCDay() + 6) % 7
  return dayKey(new Date(d.getTime() - shift * 86_400_000))
}

/**
 * UTC instant range covering the local days [weekStart, weekEnd] for the
 * client's tz (same conversion as the quests route).
 */
function localWeekRange(weekStart: string, weekEnd: string, tzOffsetMinutes: number): { start: string; end: string } {
  const startMs = Date.parse(weekStart + 'T00:00:00Z') + tzOffsetMinutes * 60_000
  const endMs = Date.parse(weekEnd + 'T00:00:00Z') + tzOffsetMinutes * 60_000 + 86_400_000
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() }
}

/** Honest weekly number for one metric, from real rows only. */
function weeklyMetricValue(metric: Metric, weekStart: string, weekEnd: string, tz: number): number {
  if (metric === 'reviews') {
    // v_daily_reviews buckets days by UTC — the honest local-day view would
    // need a tz-aware view; kept as-is (±1 day at the week edges).
    const rows = db.all<{ total: number }>(
      sql`SELECT coalesce(sum(reviews), 0) AS total FROM v_daily_reviews WHERE day BETWEEN ${weekStart} AND ${weekEnd}`,
    )
    return rows[0]?.total ?? 0
  }
  const { start, end } = localWeekRange(weekStart, weekEnd, tz)
  if (metric === 'focus_minutes') {
    const [row] = db
      .select({ minutes: sql<number>`coalesce(sum(${focusSessions.actualMinutes}), 0)` })
      .from(focusSessions)
      .where(and(gte(focusSessions.startedAt, start), lt(focusSessions.startedAt, end), eq(focusSessions.completed, true)))
      .all()
    return row?.minutes ?? 0
  }
  const [row] = db
    .select({ n: sql<number>`count(*)` })
    .from(lessons)
    .where(and(gte(lessons.completedAt, start), lt(lessons.completedAt, end)))
    .all()
  return row?.n ?? 0
}

/** GET /api/commitments?tzOffset=N — contracts + this week's honest report. */
export async function GET(req: Request) {
  const tz = tzOffsetFromQuery(req)
  const rows = db.select().from(commitments).orderBy(desc(commitments.startedAt)).all()
  const weekStart = mondayOf(new Date(), tz)
  const weekEnd = dayKey(new Date(Date.parse(weekStart + 'T00:00:00Z') + 6 * 86_400_000))

  const report = rows
    .filter((c) => c.status === 'active')
    .map((c) => {
      const metric = (METRICS as readonly string[]).includes(c.metric) ? (c.metric as Metric) : null
      const value = metric ? weeklyMetricValue(metric, weekStart, weekEnd, tz) : 0
      return {
        commitment: c,
        week: { start: weekStart, end: weekEnd },
        value,
        threshold: c.threshold,
        met: value >= c.threshold,
        note: metric ? null : `Unknown metric "${c.metric}" — treat manually`,
      }
    })

  return NextResponse.json({ commitments: rows, report, week: { start: weekStart, end: weekEnd } })
}

const createCommitmentSchema = z.object({
  title: z.string().trim().min(3, 'title, metric (reviews|focus_minutes|lessons) and a positive integer threshold are required'),
  metric: z.enum(['reviews', 'focus_minutes', 'lessons'], { message: 'title, metric (reviews|focus_minutes|lessons) and a positive integer threshold are required' }),
  threshold: z.number().int().positive('title, metric (reviews|focus_minutes|lessons) and a positive integer threshold are required'),
  stakes: z.string().optional(),
  endsAt: z.string().optional(),
})

/** POST /api/commitments { title, metric, threshold, stakes?, endsAt? } */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createCommitmentSchema)
  const [row] = db
    .insert(commitments)
    .values({
      title: body.title,
      metric: body.metric,
      threshold: body.threshold,
      stakes: body.stakes?.trim() || null,
      endsAt: body.endsAt?.trim() || null,
    })
    .returning()
    .all()
  return NextResponse.json({ commitment: row }, { status: 201 })
})

const patchCommitmentSchema = z.object({
  title: z.string().optional(),
  metric: z.enum(['reviews', 'focus_minutes', 'lessons']).optional(),
  threshold: z.number().int().positive().optional(),
  stakes: z.string().nullable().optional(),
  status: z.enum(['active', 'kept', 'broken', 'cancelled']).optional(),
  endsAt: z.string().nullable().optional(),
})

/** PATCH /api/commitments?id=N { title?, metric?, threshold?, stakes?, status?, endsAt? } */
export const PATCH = withRoute(async (req: Request) => {
  const id = Number.parseInt(new URL(req.url).searchParams.get('id') ?? '', 10)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id query param required' }, { status: 400 })
  const [existing] = db.select().from(commitments).where(eq(commitments.id, id)).all()
  if (!existing) return NextResponse.json({ error: 'Commitment not found' }, { status: 404 })

  const body = await readJson(req, patchCommitmentSchema)
  const [row] = db
    .update(commitments)
    .set({
      title: body.title?.trim() || existing.title,
      metric: body.metric ?? existing.metric,
      threshold: body.threshold ?? existing.threshold,
      stakes: body.stakes === undefined ? existing.stakes : (body.stakes?.trim() || null),
      status: body.status ?? existing.status,
      endsAt: body.endsAt === undefined ? existing.endsAt : (body.endsAt?.trim() || null),
    })
    .where(eq(commitments.id, id))
    .returning()
    .all()
  return NextResponse.json({ commitment: row })
})

/** DELETE /api/commitments?id=N */
export async function DELETE(req: Request) {
  const id = Number.parseInt(new URL(req.url).searchParams.get('id') ?? '', 10)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id query param required' }, { status: 400 })
  db.delete(commitments).where(eq(commitments.id, id)).run()
  return NextResponse.json({ ok: true })
}

