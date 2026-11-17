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
  createGenerationLadder,
  decomposeLeechCard,
  detectConfusionPairs,
  evaluateFeynmanExplanation,
  evaluateGenerationTrial,
  evaluateHypercorrection,
  evaluateMetacognitiveCalibrationProfile,
  evaluateMetacognitiveProfile,
  toTrialMetacognitiveRecords,
  forecastWorkload,
  prioritizeRelearningQueue,
  generationTierEnum,
  type JudgmentOfLearning,
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
      tokens: z.array(z.string().trim().min(1).max(100)).max(500).optional(),
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
      const readyForPromotion = summaries.filter((s) => s.eligibleForPromotion && !s.isAlreadyCard)
      return json({
        ok: true,
        trackedCount: summaries.length,
        readyForSrsCount: readyForPromotion.length,
        words: summaries,
      })
    },
  ),

  tool(
    'generation_ladder',
    'Slamecka & Graf (1978) Generation Effect Engine: create a 4-tier generation challenge (stem completion, semantic anagram, reverse query, analogy synthesis) or evaluate a learner generation attempt.',
    {
      action: z.enum(['challenge', 'evaluate']).default('challenge'),
      concept: z.string().min(1),
      text: z.string().optional(),
      tier: generationTierEnum.optional(),
      expectedAnswer: z.string().optional(),
      userAttempt: z.string().optional(),
      latencyMs: z.number().min(0).default(3000),
    },
    async ({ action, concept, text, tier, expectedAnswer, userAttempt, latencyMs }) => {
      if (action === 'challenge') {
        const ladder = createGenerationLadder(concept, text ?? concept, tier ?? 'stem_completion')
        return json({
          ok: true,
          action: 'challenge',
          ladder,
        })
      }

      if (action === 'evaluate') {
        if (!expectedAnswer || !userAttempt) {
          return json({
            ok: false,
            error: 'expectedAnswer and userAttempt are required for evaluate',
          })
        }
        const evalResult = evaluateGenerationTrial({
          concept,
          tier: tier ?? 'stem_completion',
          expectedAnswer,
          userAttempt,
          latencyMs,
        })
        return json({
          ok: true,
          action: 'evaluate',
          evaluation: evalResult,
        })
      }

      return json({ ok: false, error: 'unsupported action' })
    },
  ),

  tool(
    'feynman_eval',
    'Rozenblit-Keil (2002) Illusion of Explanatory Depth (IOED) & Feynman Teach-Back Engine: evaluate an explanation for reading ease, jargon density, causal mechanisms, and generate Socratic reflection probes.',
    {
      concept: z.string().min(1),
      explanation: z.string().min(1),
      initialConfidence: z.number().min(1).max(5).default(4),
    },
    async ({ concept, explanation, initialConfidence }) => {
      const report = evaluateFeynmanExplanation({
        concept,
        explanation,
        initialConfidence,
      })
      return json({
        ok: true,
        report,
      })
    },
  ),

  tool(
    'metacognition_eval',
    'Koriat-Bjork (2005) Calibration & Glenn Brier (1950) Diagnostic Engine: evaluate subjective confidence versus empirical recall accuracy to detect fluency illusions and prescribe desirable difficulties.',
    {
      limit: z.number().int().min(5).max(500).default(100),
      deckId: z.number().int().positive().optional(),
    },
    async ({ limit, deckId }) => {
      const conditions = []
      if (deckId) conditions.push(eq(cards.deckId, deckId))

      const rows = await db
        .select({
          cardId: revlog.cardId,
          rating: revlog.rating,
          confidence: revlog.confidence,
          timeMs: revlog.timeMs,
        })
        .from(revlog)
        .innerJoin(cards, eq(revlog.cardId, cards.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(revlog.id))
        .limit(limit)

      const trials: JudgmentOfLearning[] = rows.map((r) => ({
        cardId: r.cardId,
        confidence: r.confidence === 1 ? 0.9 : 0.35,
        outcome: r.rating >= 3 ? 1 : 0,
        latencyMs: r.timeMs,
      }))

      const report = evaluateMetacognitiveProfile(trials)
      return json({
        ok: true,
        trialsCount: trials.length,
        report,
      })
    },
  ),

  tool(
    'metacognition_hypercorrection',
    'Butterfield & Metcalfe (2001) Hypercorrection Crucible + Nelson-Narens monitoring/control telemetry: reconstruct error-correction trials from revlog history (confident miss → later retest success), compute the hypercorrection index, Goodman-Kruskal monitoring γ, and the FSRS relearning-priority queue for uncorrected high-confidence misses.',
    {
      limit: z.number().int().min(5).max(500).default(200),
    },
    async ({ limit }) => {
      const rows = await db
        .select({
          cardId: revlog.cardId,
          rating: revlog.rating,
          confidence: revlog.confidence,
          timeMs: revlog.timeMs,
          stability: cards.stability,
          difficulty: cards.difficulty,
        })
        .from(revlog)
        .innerJoin(cards, eq(revlog.cardId, cards.id))
        .orderBy(desc(revlog.id))
        .limit(limit)

      // Walk oldest→newest: each miss arms its card; the next success on that
      // card counts as the correction (same reconstruction as the web API).
      const chronological = [...rows].reverse()
      const corrections: { cardId: number; initialConfidence: number; wasCorrected: boolean }[] = []
      const armed = new Map<number, 0 | 1>()
      for (const r of chronological) {
        const correct = r.rating >= 3
        const pending = armed.get(r.cardId)
        if (pending !== undefined && correct) {
          corrections.push({
            cardId: r.cardId,
            initialConfidence: pending === 1 ? 0.9 : 0.35,
            wasCorrected: true,
          })
          armed.delete(r.cardId)
        }
        if (!correct) armed.set(r.cardId, r.confidence)
      }

      const candidates = [...armed.entries()].map(([cardId, confidence]) => {
        const card = rows.find((r) => r.cardId === cardId)
        return {
          cardId,
          errorConfidence: confidence === 1 ? 0.9 : 0.35,
          stability: card && card.stability > 0 ? card.stability : 1,
          difficulty: card && card.difficulty > 0 ? card.difficulty : 6,
          wasAlreadyCorrected: false,
        }
      })

      const crucible = evaluateHypercorrection(corrections)
      const queue = prioritizeRelearningQueue(candidates, corrections)
      const profile = evaluateMetacognitiveCalibrationProfile(
        toTrialMetacognitiveRecords(
          rows.map((r) => ({
            cardId: r.cardId,
            rating: r.rating,
            confidence: r.confidence,
            timeMs: r.timeMs,
          })),
        ),
      )

      return json({
        ok: true,
        correctionsCount: corrections.length,
        crucible,
        relearningQueue: queue.slice(0, 12),
        goodmanKruskalGamma: profile.goodmanKruskalGamma,
        calibrationIndex: profile.metacognitiveCalibrationIndex,
        recommendations: profile.recommendations,
      })
    },
  ),
]
