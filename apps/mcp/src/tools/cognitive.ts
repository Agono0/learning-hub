/**
 * Cognitive & Evidence-Based Learning Tools for MCP (Claude Desktop, Cursor, AGY):
 * 1. weakness_radar: Interference/confusion pairs (Underwood 1957) and leech decomposition.
 * 2. workload_balance: Forecast, fuzz-smoothed review scheduling, and backlog recovery.
 * 3. exposure_ledger: Krashen i+1 natural lexical exposure tracking and spaced SRS promotion.
 */
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  cards,
  db,
  getWordExposureSummaries,
  recordExposureBatch,
  revlog,
  withTransaction,
} from '@learning-hub/db'
import {
  balanceWorkload,
  cardPreviewText,
  catchUpBacklog,
  decomposeLeechCard,
  detectConfusionPairs,
  forecastWorkload,
  type WorkloadCardItem,
} from '@learning-hub/core'
import { json, tool, type RegisteredTool } from '../tool-kit'

export const cognitiveTools: RegisteredTool[] = [
  tool(
    'weakness_radar',
    'Detect semantic interference/confusion pairs (Underwood 1957) and generate 1-click atomic card decompositions for leeches.',
    {
      deckId: z.number().int().positive().optional(),
      minLapses: z.number().int().min(1).default(2),
    },
    async ({ deckId, minLapses }) => {
      const conditions = [eq(cards.suspended, false)]
      if (deckId) conditions.push(eq(cards.deckId, deckId))

      const cardRows = await db
        .select()
        .from(cards)
        .where(and(...conditions))
        .limit(200)
      const previews = new Map<number, string>()
      const mapped = cardRows.map((c) => {
        const content = (c.content ?? {}) as Record<string, unknown>
        const preview = cardPreviewText(c.type, c.content) ?? `Card #${c.id}`
        previews.set(c.id, preview)
        const unwrapped = (content[c.type] ?? content) as Record<string, unknown>
        const front = String(unwrapped.front ?? content.front ?? preview)
        const back = String(unwrapped.back ?? content.back ?? '')
        return {
          id: c.id,
          deckId: c.deckId,
          front,
          back,
          lapses: c.lapses ?? 0,
          stability: c.stability ?? 0,
          difficulty: c.difficulty ?? 0,
        }
      })

      const revlogRows = await db
        .select({
          cardId: revlog.cardId,
          grade: revlog.rating,
          createdAt: revlog.reviewedAt,
        })
        .from(revlog)
        .orderBy(desc(revlog.id))
        .limit(1000)

      const confusionPairs = detectConfusionPairs(revlogRows, previews)
      const leeches = mapped
        .filter((c) => c.lapses >= minLapses)
        .map((c) => ({
          ...c,
          decomposition: decomposeLeechCard({
            id: c.id,
            lapses: c.lapses,
            front: c.front,
            back: c.back,
          }),
        }))

      return json({
        ok: true,
        confusionPairsCount: confusionPairs.length,
        confusionPairs: confusionPairs.slice(0, 10),
        leechCount: leeches.length,
        leeches: leeches.slice(0, 5),
      })
    },
  ),

  tool(
    'workload_balance',
    'Forecast upcoming review workload over N days, smooth spikes using safe interval fuzz (+/-5%), or schedule overdue backlog recovery (lowest stability first).',
    {
      action: z.enum(['forecast', 'balance', 'catch_up']).default('forecast'),
      days: z.number().int().min(7).max(90).default(30),
      easyDays: z.array(z.number().int().min(0).max(6)).optional(),
      dailyCap: z.number().int().min(5).max(300).default(30),
      deckId: z.number().int().positive().optional(),
    },
    async ({ action, days, easyDays, dailyCap, deckId }) => {
      const conditions = [eq(cards.suspended, false)]
      if (deckId) conditions.push(eq(cards.deckId, deckId))

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

      const cardItems: WorkloadCardItem[] = rows.map((r) => ({
        id: r.id,
        due: r.due,
        stability: r.stability ?? 0,
        intervalDays: r.scheduledDays ?? 0,
        state: r.state ?? 0,
        lapses: r.lapses ?? 0,
      }))

      const now = new Date()

      if (action === 'forecast') {
        const forecast = forecastWorkload(cardItems, days, now)
        const overdueCount = cardItems.filter(
          (c) => c.due < now.toISOString() && c.state !== 0,
        ).length
        return json({
          ok: true,
          action: 'forecast',
          totalCards: cardItems.length,
          overdueCount,
          forecast,
        })
      }

      if (action === 'balance') {
        const { shifts, newForecast } = balanceWorkload(cardItems, {
          days,
          easyDays: easyDays ?? [],
          asOf: now,
        })
        if (shifts.length > 0) {
          withTransaction((tx) => {
            for (const shift of shifts) {
              tx.update(cards).set({ due: shift.newDue }).where(eq(cards.id, shift.cardId)).run()
            }
          })
        }
        return json({
          ok: true,
          action: 'balance',
          shiftedCount: shifts.length,
          forecast: newForecast,
        })
      }

      if (action === 'catch_up') {
        const overdueCards = cardItems.filter((c) => c.due < now.toISOString() && c.state !== 0)
        const shifts = catchUpBacklog(overdueCards, dailyCap, now)
        if (shifts.length > 0) {
          withTransaction((tx) => {
            for (const shift of shifts) {
              tx.update(cards).set({ due: shift.newDue }).where(eq(cards.id, shift.cardId)).run()
            }
          })
        }
        return json({ ok: true, action: 'catch_up', shiftedCount: shifts.length })
      }

      return json({ ok: false, error: 'unsupported action' })
    },
  ),

  tool(
    'exposure_ledger',
    'View naturally encountered vocabulary / technical terms across reading and notes, or record new token encounters for Krashen i+1 tracking.',
    {
      action: z.enum(['list', 'record']).default('list'),
      tokens: z.array(z.string().trim()).optional(),
      sourceType: z.enum(['reading', 'note', 'lesson']).default('reading'),
      limit: z.number().int().min(1).max(100).default(30),
    },
    async ({ action, tokens, sourceType, limit }) => {
      if (action === 'record') {
        if (!tokens || tokens.length === 0) return json({ ok: false, error: 'tokens required' })
        const count = recordExposureBatch(tokens, { sourceType })
        return json({ ok: true, recordedCount: count })
      }

      const summaries = getWordExposureSummaries(limit)
      const readyForPromotion = summaries.filter((s) => s.eligibleForPromotion)
      return json({
        ok: true,
        trackedCount: summaries.length,
        readyForSrsCount: readyForPromotion.length,
        words: summaries,
      })
    },
  ),
]
