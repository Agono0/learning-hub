/**
 * /api/workload — Spaced Repetition Workload Balancer:
 * Forecast upcoming review loads, smooth spikes within safe retention fuzz windows,
 * set easy days, and recover from overdue backlogs.
 *
 * Adheres strictly to AGENTS.md Rule 7 (only modifies `due` dates, never FSRS memory parameters).
 */
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { cards, db, userSettings, withTransaction } from '@learning-hub/db'
import {
  balanceWorkload,
  catchUpBacklog,
  forecastWorkload,
  workloadBalanceSchema,
  type WorkloadCardItem,
} from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const getQuerySchema = z.object({
  deckId: z.coerce.number().int().positive().optional(),
  days: z.coerce.number().int().min(7).max(90).default(30),
})

async function fetchCandidateCards(deckId?: number): Promise<WorkloadCardItem[]> {
  const conditions = [eq(cards.suspended, false)]
  if (deckId) {
    conditions.push(eq(cards.deckId, deckId))
  }

  const rows = await db
    .select({
      id: cards.id,
      due: cards.due,
      stability: cards.stability,
      scheduledDays: cards.scheduledDays,
      state: cards.state,
      lapses: cards.lapses,
    })
    .from(cards)
    .where(and(...conditions))

  return rows.map((r) => ({
    id: r.id,
    due: r.due,
    stability: r.stability ?? 0,
    intervalDays: r.scheduledDays ?? 0,
    state: r.state ?? 0,
    lapses: r.lapses ?? 0,
  }))
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = getQuerySchema.safeParse({
    deckId: url.searchParams.get('deckId') || undefined,
    days: url.searchParams.get('days') || undefined,
  })

  if (!parsed.success) {
    return Response.json(
      { error: 'invalid query params', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { deckId, days } = parsed.data
  const cardItems = await fetchCandidateCards(deckId)
  const now = new Date()
  const nowIso = now.toISOString()
  const forecast = forecastWorkload(cardItems, days, now)
  const overdueCount = cardItems.filter((c) => c.due < nowIso && c.state !== 0).length

  return Response.json({
    ok: true,
    totalCards: cardItems.length,
    overdueCount,
    forecast,
  })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, workloadBalanceSchema)
  const cardItems = await fetchCandidateCards(body.deckId)
  const now = new Date()

  if (body.action === 'forecast') {
    const forecast = forecastWorkload(cardItems, body.days, now)
    const overdueCount = cardItems.filter((c) => c.due < now.toISOString() && c.state !== 0).length
    return Response.json({
      ok: true,
      action: 'forecast',
      totalCards: cardItems.length,
      overdueCount,
      forecast,
    })
  }

  if (body.action === 'balance') {
    // Learner profile (migration 030) supplies planner defaults when the
    // request omits them: attention style → daily cap, goal horizon → easy days.
    const [profileRow] = await db
      .select({ profile: userSettings.learnerProfile })
      .from(userSettings)
      .limit(1)
    const profile = profileRow?.profile
    const attention = profile?.traits.attentionStyle
    const profileMaxPerDay =
      body.maxPerDay ??
      (attention === 'sustained'
        ? 30
        : attention === 'sprints'
          ? 15
          : attention === 'variable'
            ? 20
            : undefined)
    const profileEasyDays =
      body.easyDays.length > 0 ? body.easyDays : profile?.traits.goalHorizon === 'exam' ? [] : [0]
    const { shifts, newForecast } = balanceWorkload(cardItems, {
      days: body.days,
      maxPerDay: profileMaxPerDay,
      easyDays: profileEasyDays,
      asOf: now,
    })

    if (shifts.length > 0) {
      withTransaction((tx) => {
        for (const shift of shifts) {
          tx.update(cards).set({ due: shift.newDue }).where(eq(cards.id, shift.cardId)).run()
        }
      })
    }

    return Response.json({
      ok: true,
      action: 'balance',
      shiftedCount: shifts.length,
      shifts,
      forecast: newForecast,
    })
  }

  if (body.action === 'catch_up') {
    const overdueCards = cardItems.filter((c) => c.due < now.toISOString() && c.state !== 0)
    const shifts = catchUpBacklog(overdueCards, body.dailyCap, now)

    if (shifts.length > 0) {
      withTransaction((tx) => {
        for (const shift of shifts) {
          tx.update(cards).set({ due: shift.newDue }).where(eq(cards.id, shift.cardId)).run()
        }
      })
    }

    // Re-forecast with the new dues
    const updatedCards = cardItems.map((c) => {
      const shift = shifts.find((s) => s.cardId === c.id)
      return shift ? { ...c, due: shift.newDue } : c
    })
    const forecast = forecastWorkload(updatedCards, body.days, now)

    return Response.json({
      ok: true,
      action: 'catch_up',
      shiftedCount: shifts.length,
      shifts,
      forecast,
    })
  }

  return Response.json({ error: 'unsupported action' }, { status: 400 })
})
