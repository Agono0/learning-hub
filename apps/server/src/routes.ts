/**
 * Learning HUB server — REST routes.
 *
 * Every route reuses the existing services (packages/db review engine +
 * packages/core session/stats helpers) rather than reimplementing SQL; the few
 * listing queries mirror the web app's route queries against the same shared
 * drizzle client. All bodies and query strings are zod-validated.
 */
import { and, asc, desc, eq, lte, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  db,
  decks,
  cards,
  deriveMeasuredBehavior,
  revlog,
  streaks,
  executeReview,
  executeBatchReview,
  resolveDbPath,
  type ReviewPayload,
} from '@learning-hub/db'
import {
  dayKey,
  forecastNext30Days,
  listPlugins,
  type Grade,
  createGenerationLadder,
  evaluateGenerationTrial,
  evaluateFeynmanExplanation,
  evaluateHypercorrection,
  evaluateMetacognitiveProfile,
  generationTierEnum,
  generationTrialInputSchema,
  feynmanEvaluationInputSchema,
  buildTonightPlan,
  auditDesirableDifficulty,
  auditInterleaving,
  auditSpacing,
  SELF_REPORT_PROMPTS,
  prioritizeRelearningQueue,
  sleepProfileSchema,
  toConsolidationCandidates,
  fragilityScore,
  type CorrectionTrial,
  buildPretestQuestion,
  CALIBRATED_ANALOGICAL_SUITES,
  CALIBRATED_FLEXIBILITY_SUITES,
  evaluateStructureMappingAttempt,
  evaluateCognitiveFlexibility,
  exportFlexibilityToFSRSCards,
  CALIBRATED_INTERACTIVITY_SUITES,
  analyzeElementInteractivity,
  calculateInstructionalEfficiency,
  judgmentOfLearningSchema,
  pretestRelatedness,
  selectPretestCandidates,
  type JudgmentOfLearning,
  type RelearnCandidate,
  CALIBRATED_INVARIANCE_CATEGORIES,
  CALIBRATED_INVARIANCE_PROBLEMS,
  computeCategoryContrastMatrix,
  computeDiscriminationTelemetry,
  computeSequenceMetrics,
  exportFSRSInterleavingDeck,
  generateContrastSchedule,
  CANONICAL_SKILLS,
  auditCodeAgainstAgentsRules,
  executeSkillSimulation,
  calculateEbbinghausSavings,
  predictRetentionAtDays,
  calibrateFSRSStability,
  calibrateFSRSDifficulty,
  calculateSRLMaturityIndex,
  evaluateSRLMaturityTier,
  calculateGoalAttainmentScale,
  CALIBRATED_SRL_CHALLENGES,
  buildEpistemicDiscourseModel,
  bridgeEpistemicToCurriculum,
  createStandardEducationSCM,
  evaluateCounterfactual,
  checkDSeparation,
  evaluateBackdoorAdmissibility,
  getStandardThresholdConcepts,
  evaluateLiminalTrajectory,
  bridgeThresholdToCurriculum,
  computeThresholdSignificanceIndex,
} from '@learning-hub/core'
import { jsonError, readJson, readQuery, sendError, sendJson } from './http'

const DAY_MS = 86_400_000

// ── Schemas ─────────────────────────────────────────────────────────────────

/** One review grade (same shape the web app and MCP accept). */
const reviewItemSchema = z.object({
  cardId: z.number().int().positive(),
  grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  confidence: z.union([z.literal(0), z.literal(1)]).optional(),
  timeMs: z.number().min(0).optional(),
  today: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'today must be an ISO date string')
    .optional(),
})

const reviewBodySchema = reviewItemSchema

const reviewBatchBodySchema = z.object({
  reviews: z.array(reviewItemSchema).min(1, 'reviews required'),
})

const cardsQuerySchema = z.object({
  deckId: z.coerce.number().int().positive().optional(),
  due: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

const generationChallengeSchema = z.object({
  concept: z.string().min(1),
  explanation: z.string().optional(),
  text: z.string().optional(),
  tier: generationTierEnum.default('stem_completion'),
})

/** JSON-encoded attempt array (?attempts=[...]) for confusion-matrix scoring. */
const invarianceAttemptSchema = z.object({
  problemId: z.string().min(1),
  trueCategoryId: z.string().min(1),
  chosenCategoryId: z.string().min(1),
  reactionMs: z.coerce.number().int().nonnegative().optional(),
})

const invarianceQuerySchema = z.object({
  mode: z.enum(['interleaved', 'blocked']).default('interleaved'),
  attemptsJson: z.string().max(100_000).optional(),
})

const skillsCatalogQuerySchema = z.object({
  category: z.string().optional(),
})

const skillsAuditBodySchema = z.object({
  code: z.string().min(1),
  file: z.string().min(1),
})

const skillsRunBodySchema = z.object({
  skillName: z.string().min(1),
  topic: z.string().min(1).default('Autonomous Drill'),
  context: z.string().optional(),
})

const relearningSavingsBodySchema = z.object({
  initialLearningSeconds: z.number().positive(),
  relearningSeconds: z.number().positive(),
  daysElapsed: z.number().positive().default(7),
  initialTrialsCount: z.number().int().min(1).default(3),
})

const srlEvaluateBodySchema = z.object({
  forethoughtScore: z.number().min(0).max(10),
  performanceScore: z.number().min(0).max(10),
  reflectionScore: z.number().min(0).max(10),
  challengeId: z.string().optional(),
})

const epistemicAnalyzeBodySchema = z.object({
  discourseTexts: z.array(z.string()).min(1),
  baseMastery: z.number().min(0).max(1).default(0.75),
})

const causalCounterfactualBodySchema = z.object({
  evidence: z.record(z.string(), z.number()),
  interventions: z.record(z.string(), z.number()),
  targetVariableId: z.string().default('ExamScore'),
})

const thresholdLiminalBodySchema = z.object({
  conceptId: z.string().default('tc_pointers_memory'),
  probeResponses: z.record(z.string(), z.string()),
  baseMastery: z.number().min(0).max(1).default(0.75),
})

const metacognitionBodySchema = z.object({
  trials: z.array(judgmentOfLearningSchema).min(1),
})

const metacognitionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  deckId: z.coerce.number().int().positive().optional(),
})

// ── Handlers ────────────────────────────────────────────────────────────────

/** GET /health — liveness + resolved DB path. */
async function health(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, {
    ok: true,
    name: 'learning-hub-server',
    version: '0.1.0',
    uptimeSeconds: Math.round(process.uptime()),
    db: resolveDbPath(),
  })
}

/** GET /decks — decks with card/due/new counts (same query as the web app). */
async function listDecks(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rows = await db
    .select({
      id: decks.id,
      name: decks.name,
      description: decks.description,
      emoji: decks.emoji,
      createdAt: decks.createdAt,
      total: sql<number>`count(${cards.id})`,
      due: sql<number>`sum(CASE WHEN ${cards.due} <= ${new Date().toISOString()} AND ${cards.suspended} = 0 THEN 1 ELSE 0 END)`,
      newCards: sql<number>`sum(CASE WHEN ${cards.state} = 0 THEN 1 ELSE 0 END)`,
    })
    .from(decks)
    .leftJoin(cards, eq(cards.deckId, decks.id))
    .groupBy(decks.id)
    .orderBy(asc(decks.name))
  sendJson(res, 200, {
    decks: rows.map((r) => ({
      ...r,
      total: Number(r.total ?? 0),
      due: Number(r.due ?? 0),
      newCards: Number(r.newCards ?? 0),
    })),
  })
}

/** GET /cards?deckId=&due=1&limit= — browse cards; due=1 keeps only unsuspended cards due now. */
async function listCards(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const q = readQuery(url, cardsQuerySchema)
  const filters: SQL[] = []
  if (q.deckId !== undefined) filters.push(eq(cards.deckId, q.deckId))
  if (q.due === 1) {
    filters.push(lte(cards.due, new Date().toISOString()))
    filters.push(eq(cards.suspended, false))
  }
  const rows = await db
    .select()
    .from(cards)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(q.due === 1 ? asc(cards.due) : desc(cards.createdAt))
    .limit(q.limit ?? 200)
  sendJson(res, 200, { cards: rows })
}

/** Per-review response fields (same shape as the web app's POST /api/review). */
function reviewSummary(result: Awaited<ReturnType<typeof executeReview>>) {
  const when = new Date(result.revlog.reviewedAt)
  return {
    card: result.card,
    preReview: result.preReview,
    revlogId: result.revlog.id,
    due: result.card.due,
    intervalDays: Math.max(0, Math.round((Date.parse(result.card.due) - when.getTime()) / DAY_MS)),
    xp: result.xpEarned,
    streak: { current: result.streak.current, best: result.streak.best },
    elo: result.elo,
    retrievability: result.retrievability,
  }
}

/** POST /review {cardId, grade, confidence?, timeMs?, today?} — one canonical executeReview() call. */
async function postReview(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, reviewBodySchema)
  const payload: ReviewPayload = {
    cardId: body.cardId,
    grade: body.grade as Grade,
    confidence: body.confidence,
    timeMs: body.timeMs,
    today: body.today,
  }
  // One atomic, collision-safe engine call: cards + revlog + XP + streak + Elo/BKT.
  // CardNotFoundError → 404, ValidationError → 400 via sendError.
  const result = await executeReview(payload)
  sendJson(res, 200, {
    ok: true,
    ...reviewSummary(result),
    day: dayKey(body.today ? new Date(body.today) : new Date()),
  })
}

/** POST /review/batch {reviews:[...]} — atomic executeBatchReview() of many grades. */
async function postReviewBatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, reviewBatchBodySchema)
  const payloads: ReviewPayload[] = body.reviews.map((r) => ({
    cardId: r.cardId,
    grade: r.grade as Grade,
    confidence: r.confidence,
    timeMs: r.timeMs,
    today: r.today,
  }))
  const results = await executeBatchReview(payloads)
  sendJson(res, 200, { ok: true, results: results.map(reviewSummary) })
}

/** GET /today — due/new counts, today's review tallies and the streak row. */
async function today(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const now = new Date()
  const nowIso = now.toISOString()
  const todayKey = dayKey(now)

  const [dueRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(cards)
    .where(and(lte(cards.due, nowIso), eq(cards.suspended, false)))
  const [newRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(cards)
    .where(and(eq(cards.state, 0), eq(cards.suspended, false)))
  const [todayStats] = await db.all<{
    reviews: number
    correct: number
    avg_time_ms: number | null
  }>(sql`
    SELECT count(*) AS reviews,
           sum(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS correct,
           round(avg(time_ms)) AS avg_time_ms
    FROM revlog
    WHERE substr(reviewed_at, 1, 10) = ${todayKey}
      AND NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = revlog.id)
  `)
  const [streakRow] = await db.select().from(streaks).limit(1)

  sendJson(res, 200, {
    ok: true,
    day: todayKey,
    due: Number(dueRow?.count ?? 0),
    newCards: Number(newRow?.count ?? 0),
    reviews: {
      count: Number(todayStats?.reviews ?? 0),
      correct: Number(todayStats?.correct ?? 0),
      avgTimeMs: todayStats?.avg_time_ms ?? null,
    },
    streak: streakRow
      ? {
          current: streakRow.current,
          best: streakRow.best,
          lastActiveDate: streakRow.lastActiveDate,
          freezes: streakRow.freezes,
        }
      : { current: 0, best: 0, lastActiveDate: null, freezes: 2 },
  })
}

/** GET /stats — true retention (v_true_retention), today's tallies, 30-day due forecast. */
async function stats(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const todayKey = new Date().toISOString().slice(0, 10)
  const retention = await db.all<{ total: number; retained: number; retention_pct: number }>(
    sql`SELECT total, retained, retention_pct FROM v_true_retention`,
  )
  const [todayStats] = await db.all<{
    reviews: number
    correct: number
    avg_time_ms: number | null
  }>(sql`
    SELECT count(*) AS reviews,
           sum(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS correct,
           round(avg(time_ms)) AS avg_time_ms
    FROM revlog
    WHERE substr(reviewed_at, 1, 10) = ${todayKey}
      AND NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = revlog.id)
  `)
  const dueRows = await db
    .select({ due: cards.due, suspended: cards.suspended })
    .from(cards)
    .limit(5000)
  const forecast = forecastNext30Days(
    dueRows.filter((r) => !r.suspended).map((r) => ({ due: r.due })),
  )

  sendJson(res, 200, {
    ok: true,
    trueRetention: retention[0] ?? { total: 0, retained: 0, retention_pct: null },
    today: {
      day: todayKey,
      reviews: Number(todayStats?.reviews ?? 0),
      correct: Number(todayStats?.correct ?? 0),
      avgTimeMs: todayStats?.avg_time_ms ?? null,
    },
    forecast,
  })
}

/** Parses ?attemptsJson into validated attempts; malformed input scores as no telemetry. */
function parseInvarianceAttempts(
  raw: string | undefined,
): ReturnType<typeof computeDiscriminationTelemetry> | null {
  if (!raw) return null
  try {
    const parsed = invarianceAttemptSchema.array().max(1000).parse(JSON.parse(raw))
    return computeDiscriminationTelemetry(
      parsed,
      CALIBRATED_INVARIANCE_CATEGORIES,
      CALIBRATED_INVARIANCE_PROBLEMS,
    )
  } catch {
    return null
  }
}

/** GET /cognitive/structural-invariance — interleaved practice plan over the calibrated curriculum. */
async function getStructuralInvariance(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const q = readQuery(url, invarianceQuerySchema)
  const { schedule, metrics } = generateContrastSchedule(
    CALIBRATED_INVARIANCE_PROBLEMS,
    CALIBRATED_INVARIANCE_CATEGORIES,
    { mode: q.mode },
  )
  sendJson(res, 200, {
    ok: true,
    mode: q.mode,
    schedule: schedule.map((p) => ({
      id: p.id,
      categoryId: p.categoryId,
      title: p.title,
      prompt: p.prompt,
    })),
    metrics,
    contrastMatrix: computeCategoryContrastMatrix(
      CALIBRATED_INVARIANCE_CATEGORIES,
      CALIBRATED_INVARIANCE_PROBLEMS,
    ),
    deck: exportFSRSInterleavingDeck(
      CALIBRATED_INVARIANCE_PROBLEMS,
      CALIBRATED_INVARIANCE_CATEGORIES,
    ),
    interleavedMetrics: computeSequenceMetrics(
      generateContrastSchedule(CALIBRATED_INVARIANCE_PROBLEMS, CALIBRATED_INVARIANCE_CATEGORIES, {
        mode: 'interleaved',
      }).schedule,
      CALIBRATED_INVARIANCE_CATEGORIES,
      CALIBRATED_INVARIANCE_PROBLEMS,
    ),
    blockedMetrics: computeSequenceMetrics(
      generateContrastSchedule(CALIBRATED_INVARIANCE_PROBLEMS, CALIBRATED_INVARIANCE_CATEGORIES, {
        mode: 'blocked',
      }).schedule,
      CALIBRATED_INVARIANCE_CATEGORIES,
      CALIBRATED_INVARIANCE_PROBLEMS,
    ),
    telemetry: parseInvarianceAttempts(q.attemptsJson),
  })
}

/** GET /plugins — names + versions of the plugins loaded at boot (core registry). */
async function plugins(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, {
    ok: true,
    plugins: listPlugins().map((entry) => ({
      name: entry.plugin.name,
      version: entry.plugin.version,
      description: entry.plugin.description ?? null,
      source: entry.source,
    })),
  })
}

/** POST /cognitive/generation/challenge — creates a 4-tier generation challenge. */
async function postGenerationChallenge(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, generationChallengeSchema)
  const ladder = createGenerationLadder(
    body.concept,
    body.explanation ?? body.text ?? body.concept,
    body.tier,
  )
  sendJson(res, 200, { ok: true, ladder })
}

/** POST /cognitive/generation/eval — evaluates a learner's generation trial. */
async function postGenerationEval(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, generationTrialInputSchema)
  const result = evaluateGenerationTrial(body)
  sendJson(res, 200, { ok: true, result })
}

/** POST /cognitive/feynman-eval — evaluates an explanation for reading ease, jargon, and causal depth. */
async function postFeynmanEval(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, feynmanEvaluationInputSchema)
  const report = evaluateFeynmanExplanation(body)
  sendJson(res, 200, { ok: true, report })
}

/** GET /cognitive/metacognition — evaluates metacognitive calibration from revlog history. */
async function getMetacognition(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const q = readQuery(url, metacognitionQuerySchema)
  const conditions = []
  if (q.deckId) conditions.push(eq(cards.deckId, q.deckId))

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
    .limit(q.limit ?? 100)

  const trials: JudgmentOfLearning[] = rows.map((r) => ({
    cardId: r.cardId,
    confidence: r.confidence === 1 ? 0.9 : 0.35,
    outcome: r.rating >= 3 ? 1 : 0,
    latencyMs: r.timeMs ?? undefined,
  }))

  const report = evaluateMetacognitiveProfile(trials)
  sendJson(res, 200, { ok: true, trialsCount: trials.length, report })
}

/** GET /cognitive/difficulty-audit — measured telemetry audits + prompt catalog. */
async function getDifficultyAudit(
  _req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const q = readQuery(
    url,
    z.object({ tzOffset: z.coerce.number().int().min(-720).max(840).optional() }),
  )
  const measured = deriveMeasuredBehavior(q.tzOffset ?? 0, 7)
  sendJson(res, 200, {
    ok: true,
    measured,
    spacing: auditSpacing(measured, 7),
    interleaving: auditInterleaving(measured),
    techniqueMix: {
      measurable: false,
      note: 'Technique minutes (rereading, highlighting, retrieval…) are invisible to telemetry — submit them via POST for the full audit.',
      prompts: SELF_REPORT_PROMPTS,
    },
    windowDays: 7,
  })
}

/** POST /cognitive/difficulty-audit — full integrated audit (self-report + measured). */
async function postDifficultyAudit(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(
    req,
    z.object({
      windowDays: z.number().int().min(1).max(28).default(7),
      minutesByTechnique: z.record(z.string(), z.number().min(0).max(10000)),
      tzOffset: z.number().int().min(-720).max(840).optional(),
    }),
  )
  // Measured telemetry is always recomputed server-side.
  const measured = deriveMeasuredBehavior(body.tzOffset ?? 0, body.windowDays)
  const report = auditDesirableDifficulty(
    { windowDays: body.windowDays, minutesByTechnique: body.minutesByTechnique },
    measured,
  )
  sendJson(res, 200, { ok: true, report, measured })
}

/** POST /cognitive/interactivity — Sweller element-interactivity + Paas efficiency. */
async function postInteractivity(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(
    req,
    z.object({
      suiteKey: z.string().optional(),
      extraneousLoadFactor: z.coerce.number().min(0).max(3).default(1),
      mentalEffort: z.coerce.number().min(1).max(9).optional(),
      performance: z.coerce.number().min(0).max(100).optional(),
    }),
  )

  if (!body.suiteKey) {
    const suites = Object.entries(CALIBRATED_INTERACTIVITY_SUITES).map(([key, suite]) => ({
      suiteId: key,
      title: suite.title,
      elements: suite.elements.length,
      interactions: suite.edges.length,
    }))
    sendJson(res, 200, { ok: true, suites })
    return
  }

  const suite = CALIBRATED_INTERACTIVITY_SUITES[body.suiteKey]
  if (!suite) {
    jsonError(res, 404, `Unknown suite "${body.suiteKey}"`)
    return
  }
  const analysis = analyzeElementInteractivity(suite, body.extraneousLoadFactor)
  const paas =
    body.mentalEffort !== undefined && body.performance !== undefined
      ? calculateInstructionalEfficiency(body.mentalEffort, body.performance)
      : null
  sendJson(res, 200, { ok: true, analysis, paas, paasClassification: paas?.classification ?? null })
}

/** POST /cognitive/analogy — Gentner structure-mapping evaluation over the calibrated suites. */
async function postAnalogy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(
    req,
    z.object({
      suiteKey: z.string().optional(),
      attempt: z
        .object({
          suiteId: z.string(),
          selectedBaseAnalogId: z.string(),
          entityMappings: z.array(
            z.object({ baseEntityId: z.string(), targetEntityId: z.string() }),
          ),
          predicateMappings: z.array(
            z.object({ basePredicateId: z.string(), targetPredicateId: z.string() }),
          ),
          articulatedConvergenceSchema: z.string(),
          decoyRejectionRationale: z.string().optional(),
          confidenceScore: z.number().min(1).max(5),
          timeSpentMs: z.number().nonnegative(),
        })
        .optional(),
    }),
  )

  // Suite listing mode.
  if (!body.attempt) {
    const keys = body.suiteKey ? [body.suiteKey] : Object.keys(CALIBRATED_ANALOGICAL_SUITES)
    const suites = keys.map((k) => {
      const suite = CALIBRATED_ANALOGICAL_SUITES[k]
      if (!suite) return { suiteId: k, error: `unknown suite "${k}"` }
      return {
        suiteId: suite.suiteId,
        title: suite.title,
        targetProblem: suite.targetProblem.scenarioTitle,
        baseAnalogs: suite.baseAnalogs.map((b) => ({ id: b.id, title: b.scenarioTitle })),
      }
    })
    sendJson(res, 200, { ok: true, suites })
    return
  }

  const suite = CALIBRATED_ANALOGICAL_SUITES[body.attempt.suiteId]
  if (!suite) {
    jsonError(res, 404, `Unknown suite "${body.attempt.suiteId}"`)
    return
  }
  const telemetry = evaluateStructureMappingAttempt(suite, body.attempt)
  sendJson(res, 200, { ok: true, telemetry })
}

/** POST /cognitive/flexibility — Spiro criss-crossing evaluation over the calibrated suites. */
async function postFlexibility(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(
    req,
    z.object({
      suiteKey: z.string().optional(),
      attempts: z
        .array(
          z.object({
            caseId: z.string(),
            selectedHat: z.enum([
              'white_hat',
              'red_hat',
              'black_hat',
              'yellow_hat',
              'green_hat',
              'blue_hat',
            ]),
            activeLens: z.enum([
              'mechanistic_technical',
              'socio_economic',
              'ecological_systemic',
              'teleological_ethical',
            ]),
            studentObservations: z.string(),
            identifiedThematicNodeIds: z.array(z.string()),
            diagnosedReductiveTrapIds: z.array(z.string()),
          }),
        )
        .max(100)
        .optional(),
      exportCards: z.boolean().default(false),
    }),
  )

  if (!body.attempts) {
    const suites = Object.entries(CALIBRATED_FLEXIBILITY_SUITES).map(([key, suite]) => ({
      suiteId: key,
      name: suite.name,
      domainFamily: suite.domainFamily,
      caseTitle: suite.primaryCase.title,
      thematicNodes: suite.primaryCase.thematicNodes.length,
      reductiveTraps: suite.primaryCase.reductiveTraps.length,
    }))
    sendJson(res, 200, { ok: true, suites })
    return
  }

  const suite = CALIBRATED_FLEXIBILITY_SUITES[body.suiteKey ?? '']
  if (!suite) {
    jsonError(res, 404, `Unknown suite "${body.suiteKey ?? ''}"`)
    return
  }
  const evaluation = evaluateCognitiveFlexibility(suite, body.attempts)
  const cards = body.exportCards ? exportFlexibilityToFSRSCards(suite, evaluation) : undefined
  sendJson(res, 200, { ok: true, evaluation, cards })
}

/** GET /cognitive/pretesting — pretest questions for young, fragile cards. */
async function getPretesting(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rows = await db
    .select({
      id: cards.id,
      content: cards.content,
      stability: cards.stability,
      difficulty: cards.difficulty,
    })
    .from(cards)
    .where(eq(cards.suspended, false))
    .orderBy(asc(cards.stability))
    .limit(120)

  const frontBack = (content: unknown): { front: string; back: string } | null => {
    if (!content || typeof content !== 'object') return null
    const c = content as Record<string, unknown>
    if (c.basic && typeof c.basic === 'object') {
      const b = c.basic as Record<string, unknown>
      if (typeof b.front === 'string' && typeof b.back === 'string')
        return { front: b.front, back: b.back }
    }
    if (typeof c.front === 'string' && typeof c.back === 'string')
      return { front: c.front, back: c.back }
    return null
  }

  const usable = rows
    .filter((r) => r.stability < 3 && frontBack(r.content) !== null)
    .map((r) => ({ cardId: r.id, stability: r.stability, difficulty: r.difficulty }))
  const picked = selectPretestCandidates(usable, 10)

  const candidates = picked.flatMap((c) => {
    const row = rows.find((r) => r.id === c.cardId)
    const fb = row ? frontBack(row.content) : null
    if (!fb) return []
    const built = buildPretestQuestion(fb.front, fb.back)
    const relatedness = pretestRelatedness(built.question, fb.back)
    return [
      {
        cardId: c.cardId,
        front: fb.front,
        target: fb.back,
        kind: built.kind,
        question: built.question,
        relatedness,
        solidPretest: relatedness >= 0.5,
        stability: c.stability,
        difficulty: c.difficulty,
      },
    ]
  })

  sendJson(res, 200, {
    ok: true,
    candidates,
    sampleSize: candidates.length,
    protocol: {
      name: 'pretest → feedback → study → retest',
      citation: 'Kornell, Hays & Bjork (2009); Little & Bjork (2016); Butler & Roediger (2008)',
      note: 'A wrong guess followed by immediate study is the protocol working, not failing.',
    },
  })
}

/** POST /cognitive/metacognition — evaluates metacognitive calibration from provided trial payload. */
async function postMetacognition(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, metacognitionBodySchema)
  const report = evaluateMetacognitiveProfile(body.trials)
  sendJson(res, 200, { ok: true, trialsCount: body.trials.length, report })
}

/** GET /cognitive/tmr/plan — tonight's TMR consolidation plan over real FSRS state. */
async function getTmrPlan(_req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const q = readQuery(
    url,
    z.object({
      bedtime: z
        .string()
        .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
        .optional(),
      wakeTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
        .optional(),
      chronotype: z.coerce.number().min(-1).max(1).optional(),
      sleepDebtHours: z.coerce.number().min(0).max(12).optional(),
      maxAcousticDba: z.coerce.number().min(25).max(42).optional(),
      limit: z.coerce.number().int().min(1).max(30).optional(),
    }),
  )

  const profile = sleepProfileSchema.parse({
    bedtime: q.bedtime ?? '23:00',
    wakeTime: q.wakeTime ?? '07:00',
    chronotype: q.chronotype ?? 0,
    sleepDebtHours: q.sleepDebtHours ?? 0,
    maxAcousticDba: q.maxAcousticDba ?? 35,
  })

  const rows = await db
    .select({
      id: cards.id,
      stability: cards.stability,
      difficulty: cards.difficulty,
      due: cards.due,
      state: cards.state,
      suspended: cards.suspended,
    })
    .from(cards)
    .where(eq(cards.suspended, false))
    .orderBy(asc(cards.stability))
    .limit(300)

  const candidates = toConsolidationCandidates(
    rows
      .filter((r) => !r.suspended && r.state >= 2 && r.stability > 0)
      .map((r) => ({ id: r.id, stability: r.stability, difficulty: r.difficulty, due: r.due })),
  )
    .sort((a, b) => fragilityScore(b) - fragilityScore(a))
    .slice(q.limit ?? 12)

  const plan = buildTonightPlan(profile, candidates)
  sendJson(res, 200, {
    ok: true,
    candidatesSelected: candidates.length,
    cueCount: plan.cues.length,
    meanPredictedBoostPct: plan.meanPredictedBoostPct,
    hypnogram: {
      cycleCount: plan.hypnogram.cycleCount,
      swsShare: plan.hypnogram.swsShare,
      remShare: plan.hypnogram.remShare,
      totalOpportunityMinutes: plan.hypnogram.totalOpportunityMinutes,
    },
    swsBlocks: plan.swsBlocks,
    cues: plan.cues,
    unscheduledCardIds: plan.unscheduledCardIds,
    safety: plan.safety,
    advisory: plan.advisory,
  })
}

/** GET /cognitive/metacognition/hypercorrection — Butterfield-Metcalfe crucible from revlog. */
async function getHypercorrection(
  _req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const q = readQuery(url, metacognitionQuerySchema)
  const rows = await db
    .select({
      cardId: revlog.cardId,
      rating: revlog.rating,
      confidence: revlog.confidence,
      stability: cards.stability,
      difficulty: cards.difficulty,
    })
    .from(revlog)
    .innerJoin(cards, eq(revlog.cardId, cards.id))
    .orderBy(desc(revlog.id))
    .limit(q.limit ?? 200)

  // Same reconstruction as the web handler / MCP tool: a miss arms its card,
  // the card's next success counts as the correction (Butterfield & Metcalfe
  // 2001: high-confidence errors hypercorrect on retest).
  const chronological = [...rows].reverse()
  const corrections: CorrectionTrial[] = []
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

  const candidates: RelearnCandidate[] = [...armed.entries()].map(([cardId, confidence]) => {
    const card = rows.find((r) => r.cardId === cardId)
    return {
      cardId,
      errorConfidence: confidence === 1 ? 0.9 : 0.35,
      stability: card && card.stability > 0 ? card.stability : 1,
      difficulty: card && card.difficulty > 0 ? card.difficulty : 6,
      wasAlreadyCorrected: false,
    }
  })

  const report = evaluateHypercorrection(corrections)
  const queue = prioritizeRelearningQueue(candidates, corrections)
  sendJson(res, 200, {
    ok: true,
    correctionsCount: corrections.length,
    report,
    queue: queue.slice(0, 12),
  })
}

/** GET /cognitive/skills/catalog — lists canonical agent skills */
async function getSkillsCatalog(
  _req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const q = readQuery(url, skillsCatalogQuerySchema)
  const skills = Object.values(CANONICAL_SKILLS)
  const filtered = q.category
    ? skills.filter((s) => s.meta.category.toLowerCase() === q.category!.toLowerCase())
    : skills
  sendJson(res, 200, {
    ok: true,
    count: filtered.length,
    skills: filtered.map((s) => ({
      name: s.meta.name,
      title: s.meta.title,
      category: s.meta.category,
      description: s.meta.description,
      parameters: s.parameters,
      phases: s.phases.map((p) => ({ id: p.id, name: p.name, description: p.description })),
    })),
  })
}

/** POST /cognitive/skills/audit — audits code against AGENTS.md rules */
async function postSkillsAudit(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, skillsAuditBodySchema)
  const violations = auditCodeAgainstAgentsRules(body.code, body.file)
  sendJson(res, 200, {
    ok: true,
    file: body.file,
    violationsCount: violations.length,
    violations,
  })
}

/** POST /cognitive/skills/run — simulates execution of an autonomous skill drill */
async function postSkillsRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, skillsRunBodySchema)
  const skill = CANONICAL_SKILLS[body.skillName] ?? Object.values(CANONICAL_SKILLS)[0]!
  const simulation = executeSkillSimulation(skill.meta.name, {
    topic: body.topic,
    context: body.context ?? '',
  })
  sendJson(res, 200, {
    ok: true,
    skill: skill.meta.name,
    clarityIndex: simulation.clarityIndex,
    rigorScore: simulation.rigorScore,
    rawOutput: simulation.rawOutput,
    ambiguitiesResolved: simulation.ambiguitiesResolved,
    assumptionsSurfaced: simulation.assumptionsSurfaced,
  })
}

/** POST /cognitive/relearning/savings — calculates Rawson & Dunlosky Ebbinghaus savings */
async function postRelearningSavings(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, relearningSavingsBodySchema)
  const savings = calculateEbbinghausSavings(body.initialLearningSeconds, body.relearningSeconds)
  const retention = predictRetentionAtDays(0.1, body.daysElapsed)
  const stability = calibrateFSRSStability(0.08)
  const difficulty = calibrateFSRSDifficulty(body.initialTrialsCount, 1)
  sendJson(res, 200, {
    ok: true,
    savingsPercentage: savings,
    predictedRetention: Math.round(retention * 100),
    calibratedFSRS: {
      stabilityDays: stability,
      difficultyScale: difficulty,
    },
    recommendation:
      savings >= 50
        ? 'Robust Ebbinghaus memory savings achieved. Safe to expand review interval by 2.5x.'
        : 'Sub-threshold memory savings. Additional successive retrieval trial recommended.',
  })
}

/** POST /cognitive/srl/evaluate — Zimmerman 3-phase cyclical SRL matrix */
async function postSrlEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, srlEvaluateBodySchema)
  const index = calculateSRLMaturityIndex(
    body.forethoughtScore,
    body.performanceScore,
    body.reflectionScore,
  )
  const tier = evaluateSRLMaturityTier(index)
  const gas = calculateGoalAttainmentScale(
    body.performanceScore / 10,
    body.reflectionScore >= 6,
    body.forethoughtScore / 10,
  )
  const challenge = body.challengeId ? CALIBRATED_SRL_CHALLENGES[body.challengeId] : null
  sendJson(res, 200, {
    ok: true,
    maturityIndex: index,
    maturityTier: tier,
    goalAttainmentScale: gas,
    challenge: challenge
      ? {
          id: challenge.id,
          title: challenge.title,
          domain: challenge.domain,
          complexityLevel: challenge.complexityLevel,
          taskDescription: challenge.taskDescription,
          forethoughtHeuristic: challenge.expertForethoughtHeuristic,
          selfReflectionPrompt: challenge.expertSelfReflectionPrompt,
        }
      : null,
  })
}

/** POST /cognitive/epistemic/analyze — Shaffer Epistemic Network Analysis */
async function postEpistemicAnalyze(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, epistemicAnalyzeBodySchema)
  const utterances = body.discourseTexts.map((text, idx) => ({
    id: `server_utt_${idx}`,
    unitId: 'server_unit',
    conversationId: 'server_conv',
    lineIndex: idx,
    timestamp: new Date().toISOString(),
    speaker: 'Learner',
    text,
    appliedCodes: [
      idx % 2 === 0 ? 'code_domain_principle' : 'code_empirical_evidence',
      'code_causal_reasoning',
    ],
  }))
  const model = buildEpistemicDiscourseModel(
    'server_ena_model',
    'REST Discourse Analysis',
    'Cognitive Systems',
    utterances,
  )
  const bridge = bridgeEpistemicToCurriculum(model, body.baseMastery)
  sendJson(res, 200, {
    ok: true,
    networkDensity: model.network.networkDensity,
    overallMaturityScore: model.overallMaturityScore,
    dimension1Coord: model.projection.dimension1Coord,
    dimension2Coord: model.projection.dimension2Coord,
    epistemicInterpretation: model.projection.epistemicInterpretation,
    curriculumTransferMultiplier: bridge.transferMultiplier,
    modulatedMastery: bridge.modulatedMastery,
    subtractiveGapsCount: model.subtractiveGaps.length,
  })
}

/** POST /cognitive/causal/counterfactual — Pearl SCM & counterfactual evaluation */
async function postCausalCounterfactual(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, causalCounterfactualBodySchema)
  const model = createStandardEducationSCM()
  const result = evaluateCounterfactual(model, {
    modelId: model.id,
    evidence: body.evidence,
    interventions: body.interventions,
    targetVariableId: body.targetVariableId,
  })
  const interventionKey = Object.keys(body.interventions)[0] ?? 'StudyHours'
  const backdoor = evaluateBackdoorAdmissibility(model, interventionKey, body.targetVariableId, [
    'Aptitude',
  ])
  const dsep = checkDSeparation(model, interventionKey, body.targetVariableId, ['Aptitude'])
  sendJson(res, 200, {
    ok: true,
    factualValue: result.factualValue,
    counterfactualValue: result.counterfactualValue,
    causalLift: result.causalLift,
    exogenousStates: result.exogenousStates,
    narrativeExplanation: result.narrativeExplanation,
    isBackdoorAdmissible: backdoor.isAdmissible,
    dSeparationPathsCount: dsep.paths.length,
  })
}

/** POST /cognitive/threshold/liminal — Meyer & Land threshold concepts liminal evaluation */
async function postThresholdLiminal(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, thresholdLiminalBodySchema)
  const concepts = getStandardThresholdConcepts()
  const concept = concepts.find((c) => c.id === body.conceptId) ?? concepts[0]!
  const diagnostic = evaluateLiminalTrajectory(concept.id, body.probeResponses)
  const bridge = bridgeThresholdToCurriculum(
    body.baseMastery,
    diagnostic.overallFluencyScore,
    diagnostic.phase,
    concept.id,
  )
  const tsi = computeThresholdSignificanceIndex(concept.criteriaScores)
  sendJson(res, 200, {
    ok: true,
    concept: {
      id: concept.id,
      title: concept.title,
      discipline: concept.discipline,
      tsiScore: tsi,
      unlockedDownstreamConcepts: concept.unlockedDownstreamConcepts,
    },
    diagnostic: {
      phase: diagnostic.phase,
      canCrossPortal: diagnostic.canCrossPortal,
      overallFluencyScore: diagnostic.overallFluencyScore,
      mimicryRiskScore: diagnostic.mimicryRiskScore,
      oscillationStability: diagnostic.oscillationStability,
      prescribedRemediation: diagnostic.prescribedRemediation,
    },
    bridge: {
      gatewayMultiplier: bridge.gatewayMultiplier,
      modulatedMastery: bridge.modulatedMastery,
    },
  })
}

// ── Route table + dispatcher ────────────────────────────────────────────────

/** One registered route: exact method + path match, query parsing left to the handler. */
export interface Route {
  method: 'GET' | 'POST'
  path: string
  summary: string
  handler: (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void> | void
}

/** All REST routes served by the headless server. */
export const routes: Route[] = [
  { method: 'GET', path: '/health', summary: 'liveness + resolved DB path', handler: health },
  { method: 'GET', path: '/decks', summary: 'decks with card/due/new counts', handler: listDecks },
  {
    method: 'GET',
    path: '/cards',
    summary: 'browse cards (?deckId=&due=1&limit=)',
    handler: listCards,
  },
  {
    method: 'POST',
    path: '/review',
    summary: 'grade one card (executeReview)',
    handler: postReview,
  },
  {
    method: 'POST',
    path: '/review/batch',
    summary: 'grade many cards atomically (executeBatchReview)',
    handler: postReviewBatch,
  },
  {
    method: 'GET',
    path: '/today',
    summary: 'due/new counts, today tallies, streak',
    handler: today,
  },
  {
    method: 'GET',
    path: '/stats',
    summary: 'retention, today tallies, 30-day forecast',
    handler: stats,
  },
  { method: 'GET', path: '/plugins', summary: 'loaded plugin names + versions', handler: plugins },
  {
    method: 'GET',
    path: '/cognitive/structural-invariance',
    summary: 'interleaved structural invariance plan (?mode=interleaved|blocked)',
    handler: getStructuralInvariance,
  },
  {
    method: 'POST',
    path: '/cognitive/generation/challenge',
    summary: 'create generation ladder challenge',
    handler: postGenerationChallenge,
  },
  {
    method: 'POST',
    path: '/cognitive/generation/eval',
    summary: 'evaluate generation attempt',
    handler: postGenerationEval,
  },
  {
    method: 'POST',
    path: '/cognitive/feynman-eval',
    summary: 'evaluate feynman teach-back explanation',
    handler: postFeynmanEval,
  },
  {
    method: 'GET',
    path: '/cognitive/metacognition',
    summary: 'metacognitive calibration from revlog (?deckId=&limit=)',
    handler: getMetacognition,
  },
  {
    method: 'POST',
    path: '/cognitive/metacognition',
    summary: 'metacognitive calibration from provided trials',
    handler: postMetacognition,
  },
  {
    method: 'GET',
    path: '/cognitive/metacognition/hypercorrection',
    summary: 'Butterfield-Metcalfe hypercorrection crucible + relearning queue (?limit=)',
    handler: getHypercorrection,
  },
  {
    method: 'GET',
    path: '/cognitive/tmr/plan',
    summary:
      "tonight's TMR consolidation plan from FSRS state (?bedtime=&wakeTime=&chronotype=&sleepDebtHours=&limit=)",
    handler: getTmrPlan,
  },
  {
    method: 'GET',
    path: '/cognitive/difficulty-audit',
    summary: 'measured desirable-difficulty telemetry audits (?tzOffset=)',
    handler: getDifficultyAudit,
  },
  {
    method: 'POST',
    path: '/cognitive/difficulty-audit',
    summary: 'full Dunlosky technique audit from self-reported minutes',
    handler: postDifficultyAudit,
  },
  {
    method: 'GET',
    path: '/cognitive/pretesting',
    summary: 'pretest questions for young, fragile cards (Kornell et al. 2009)',
    handler: getPretesting,
  },
  {
    method: 'POST',
    path: '/cognitive/analogy',
    summary: 'Gentner structure-mapping evaluation over the calibrated analogy suites',
    handler: postAnalogy,
  },
  {
    method: 'POST',
    path: '/cognitive/flexibility',
    summary: 'Spiro criss-crossing evaluation over the calibrated flexibility suites',
    handler: postFlexibility,
  },
  {
    method: 'POST',
    path: '/cognitive/interactivity',
    summary:
      'Sweller element-interactivity analysis + Paas efficiency (?suiteKey=&extraneousLoadFactor=&mentalEffort=&performance=)',
    handler: postInteractivity,
  },
  {
    method: 'GET',
    path: '/cognitive/skills/catalog',
    summary: 'canonical agent skills catalog (?category=)',
    handler: getSkillsCatalog,
  },
  {
    method: 'POST',
    path: '/cognitive/skills/audit',
    summary: 'audit code against AGENTS.md rules',
    handler: postSkillsAudit,
  },
  {
    method: 'POST',
    path: '/cognitive/skills/run',
    summary: 'simulate execution of an autonomous skill drill',
    handler: postSkillsRun,
  },
  {
    method: 'POST',
    path: '/cognitive/relearning/savings',
    summary: 'calculate Rawson & Dunlosky successive relearning & Ebbinghaus savings',
    handler: postRelearningSavings,
  },
  {
    method: 'POST',
    path: '/cognitive/srl/evaluate',
    summary: 'evaluate Zimmerman cyclical self-regulated learning (SRL) matrix',
    handler: postSrlEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/epistemic/analyze',
    summary: 'Shaffer epistemic network analysis (ENA) & quantitative ethnography',
    handler: postEpistemicAnalyze,
  },
  {
    method: 'POST',
    path: '/cognitive/causal/counterfactual',
    summary: 'Judea Pearl structural causal models & counterfactual evaluation',
    handler: postCausalCounterfactual,
  },
  {
    method: 'POST',
    path: '/cognitive/threshold/liminal',
    summary: 'Meyer & Land threshold concepts & liminal navigation evaluation',
    handler: postThresholdLiminal,
  },
]

/**
 * Match the incoming request against the route table and run the handler with
 * error mapping (400/404/500 envelope). Unknown method+path → 404.
 */
export async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const method = (req.method ?? 'GET').toUpperCase()
    const route = routes.find((r) => r.method === method && r.path === url.pathname)
    if (!route) {
      jsonError(res, 404, `Not found: ${method} ${url.pathname}`)
      return
    }
    await route.handler(req, res, url)
  } catch (err) {
    sendError(res, err)
  }
}
