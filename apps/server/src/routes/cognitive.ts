/**
 * Learning HUB headless server — COGNITIVE routes. Split from the former routes.ts
 * monolith (TD-11): same handlers, same zod validation, same Route[] table
 * pattern; composition lives in ./index.ts.
 */
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  addConceptDagEdge,
  db,
  cards,
  deriveMeasuredBehavior,
  getConceptDag,
  getConceptDagNode,
  getRevlogTrialRows,
  reconstructCorrectionTrials,
  updateNodeMasteries,
  upsertConceptDagNode,
} from '@learning-hub/db'
import {
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
  sessionTelemetrySchema,
  sleepProfileSchema,
  toConsolidationCandidates,
  fragilityScore,
  judgmentOfLearningFromRevlogRows,
  buildPretestQuestion,
  CALIBRATED_ANALOGICAL_SUITES,
  CALIBRATED_FLEXIBILITY_SUITES,
  evaluateStructureMappingAttempt,
  evaluateCognitiveFlexibility,
  exportFlexibilityToFSRSCards,
  CALIBRATED_INTERACTIVITY_SUITES,
  CALIBRATED_COGNITIVE_LOAD_SCENARIOS,
  evaluateComprehensiveCognitiveLoad,
  evaluateFlowState,
  CALIBRATED_EQUILIBRIUM_SUITES,
  evaluateReflectiveEquilibrium,
  exportEquilibriumToFSRSCards,
  analyzeDualCoding,
  analyzeElementInteractivity,
  calculateInstructionalEfficiency,
  judgmentOfLearningSchema,
  pretestRelatedness,
  selectPretestCandidates,
  propagateGktBelief,
  topologicalSortGkt,
  wouldIntroduceCycle,
  type GktEdge,
  type GktNode,
} from '@learning-hub/core'
import { ApiError, sendJson, jsonError, readJson, readQuery } from '../http'
import type { Route } from './shared'

const generationChallengeSchema = z.object({
  concept: z.string().min(1),
  explanation: z.string().optional(),
  text: z.string().optional(),
  tier: generationTierEnum.default('stem_completion'),
})

/** JSON-encoded attempt array (?attempts=[...]) for confusion-matrix scoring. */
const metacognitionBodySchema = z.object({
  trials: z.array(judgmentOfLearningSchema).min(1),
})

const metacognitionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  deckId: z.coerce.number().int().positive().optional(),
})

/** GKT concept node id (trimmed, bounded — same validation as the web handler). */
const nodeIdSchema = z.string().trim().min(1).max(120)

/** POST /cognitive/gkt body — upsert_node | add_edge | evaluate_review (parity with the web handler). */
const gktPostSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('upsert_node'),
    courseId: z.number().int().positive().optional(),
    nodeData: z.object({
      id: nodeIdSchema,
      title: z.string().trim().min(1).max(200),
      description: z.string().max(2000).optional(),
      masteryProb: z.number().min(0.001).max(0.999).optional(),
    }),
  }),
  z.object({
    action: z.literal('add_edge'),
    edgeData: z.object({
      prerequisiteId: nodeIdSchema,
      dependentId: nodeIdSchema,
      weight: z.number().min(0.1).max(1).optional(),
    }),
  }),
  z.object({
    action: z.literal('evaluate_review'),
    courseId: z.number().int().positive().optional(),
    nodeId: nodeIdSchema,
    passed: z.boolean(),
  }),
])

/** GET /cognitive/gkt query. */
const gktQuerySchema = z.object({
  courseId: z.coerce.number().int().positive().optional(),
})

/** GET /cognitive/flow-state quick-assessment query (parity with the web handler). */
const flowQuerySchema = z.object({
  elapsedMinutes: z.coerce.number().min(0).default(0),
  accuracy: z.coerce.number().min(0).max(1).default(0.85),
})

/** GET /cognitive/dual-coding query (parity with the web handler). */
const dualCodingQuerySchema = z.object({
  cardId: z.coerce.number().int().positive().optional(),
  text: z.string().default(''),
})

/** POST /cognitive/dual-coding body (parity with the web handler). */
const dualCodingInputSchema = z.object({
  cardId: z.number().int().positive().optional(),
  text: z.string().min(1),
  hasImage: z.boolean().optional(),
  hasDiagram: z.boolean().optional(),
  verbalRetention: z.number().min(0).max(1).optional(),
  visualRetention: z.number().min(0).max(1).optional(),
})

// ── Handlers ────────────────────────────────────────────────────────────────

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
/** POST /cognitive/generation/eval — evaluates a learner's generation trial. */
async function postGenerationEval(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, generationTrialInputSchema)
  const result = evaluateGenerationTrial(body)
  sendJson(res, 200, { ok: true, result })
}

/** POST /cognitive/feynman-eval — evaluates an explanation for reading ease, jargon, and causal depth. */
/** POST /cognitive/feynman-eval — evaluates an explanation for reading ease, jargon, and causal depth. */
async function postFeynmanEval(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, feynmanEvaluationInputSchema)
  const report = evaluateFeynmanExplanation(body)
  sendJson(res, 200, { ok: true, report })
}

/** GET /cognitive/metacognition — evaluates metacognitive calibration from revlog history. */
/** GET /cognitive/metacognition — evaluates metacognitive calibration from revlog history. */
async function getMetacognition(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const q = readQuery(url, metacognitionQuerySchema)
  // Shared repo query (undone reviews excluded — parity with the web handler)
  // + core's canonical row→JOL mapping (one definition for every host).
  const rows = getRevlogTrialRows({ limit: q.limit ?? 100, deckId: q.deckId })
  const trials = judgmentOfLearningFromRevlogRows(rows)

  const report = evaluateMetacognitiveProfile(trials)
  sendJson(res, 200, { ok: true, trialsCount: trials.length, report })
}

/** GET /cognitive/difficulty-audit — measured telemetry audits + prompt catalog. */
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

/** GET /cognitive/load/benchmarks — list CLT benchmark scenarios and capacity limits */
/** GET /cognitive/load/benchmarks — list CLT benchmark scenarios and capacity limits */
async function getCltBenchmarks(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, {
    ok: true,
    capacityLimit: 4.0,
    scenarios: Object.values(CALIBRATED_COGNITIVE_LOAD_SCENARIOS).map((s) => ({
      id: s.id,
      title: s.title,
      elementInteractivityScore: s.elementInteractivityScore,
    })),
  })
}

/** POST /cognitive/load/evaluate — full comprehensive cognitive load + Paas + flow evaluation */
/** POST /cognitive/load/evaluate — full comprehensive cognitive load + Paas + flow evaluation */
async function postCltEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(
    req,
    z.object({
      responseLatencyMs: z.number().min(0).default(3500),
      baselineLatencyMs: z.number().positive().optional(),
      backspaceCount: z.number().int().min(0).default(0),
      recentErrorsInLast5Cards: z.number().int().min(0).max(5).default(0),
      subjectiveMentalEffortRating: z.number().min(1).max(9).optional(),
      taskElementCount: z.number().int().min(1).max(20).optional(),
      learnerDomainMastery: z.number().min(0).max(1).optional(),
      targetTaskDifficulty: z.number().min(0).max(1).optional(),
      scenarioId: z.string().default('distributed_paxos_consensus'),
    }),
  )
  const scenario = CALIBRATED_COGNITIVE_LOAD_SCENARIOS[body.scenarioId]
  const evaluation = evaluateComprehensiveCognitiveLoad({
    responseLatencyMs: body.responseLatencyMs,
    baselineLatencyMs: body.baselineLatencyMs,
    backspaceCount: body.backspaceCount,
    recentErrorsInLast5Cards: body.recentErrorsInLast5Cards,
    subjectiveMentalEffortRating: body.subjectiveMentalEffortRating,
    taskElementCount: body.taskElementCount ?? scenario?.elementInteractivityScore,
    learnerDomainMastery: body.learnerDomainMastery,
    targetTaskDifficulty: body.targetTaskDifficulty,
  })
  sendJson(res, 200, { ok: true, evaluation })
}

/** POST /cognitive/equilibrium — Rawls reflective equilibrium + Tetlock calibration. */
/** POST /cognitive/equilibrium — Rawls reflective equilibrium + Tetlock calibration. */
async function postEquilibrium(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(
    req,
    z.object({
      suiteKey: z.string().optional(),
      sessionState: z
        .object({
          suiteId: z.string(),
          activeAdjustments: z.record(
            z.string(),
            z.object({
              adjustedConfidence: z.number().min(0.5).max(1),
              revisedStatement: z.string().optional(),
            }),
          ),
          resolvedTriadStrategies: z.record(
            z.string(),
            z.enum(['revise_principle', 'override_judgment', 'reformulate_theory']),
          ),
          recordedPredictions: z.array(
            z.object({
              propositionId: z.string(),
              propositionText: z.string(),
              subjectiveConfidence: z.number().min(0.5).max(1),
              actualOutcome: z.boolean(),
              domainContext: z.string(),
            }),
          ),
        })
        .optional(),
      exportCards: z.boolean().default(false),
    }),
  )

  if (!body.sessionState) {
    const suites = Object.entries(CALIBRATED_EQUILIBRIUM_SUITES).map(([key, suite]) => ({
      suiteId: key,
      name: suite.name,
      domain: suite.domain,
      nodes: suite.nodes.length,
      edges: suite.edges.length,
      dissonantTriads: suite.dissonantTriads.length,
      predictionBank: suite.predictionBank.length,
    }))
    sendJson(res, 200, { ok: true, suites })
    return
  }

  const suite = CALIBRATED_EQUILIBRIUM_SUITES[body.sessionState.suiteId]
  if (!suite) {
    jsonError(res, 404, `Unknown suite "${body.sessionState.suiteId}"`)
    return
  }
  const evaluation = evaluateReflectiveEquilibrium(suite, body.sessionState)
  const cards = body.exportCards ? exportEquilibriumToFSRSCards(suite, evaluation) : undefined
  sendJson(res, 200, { ok: true, evaluation, cards })
}

/** POST /cognitive/analogy — Gentner structure-mapping evaluation over the calibrated suites. */
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
/** POST /cognitive/metacognition — evaluates metacognitive calibration from provided trial payload. */
async function postMetacognition(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, metacognitionBodySchema)
  const report = evaluateMetacognitiveProfile(body.trials)
  sendJson(res, 200, { ok: true, trialsCount: body.trials.length, report })
}

/** GET /cognitive/tmr/plan — tonight's TMR consolidation plan over real FSRS state. */
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
/** GET /cognitive/metacognition/hypercorrection — Butterfield-Metcalfe crucible from revlog. */
async function getHypercorrection(
  _req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const q = readQuery(url, metacognitionQuerySchema)
  // Shared repo query + canonical core reconstruction (packages/db
  // repos/cognitive-trials): undone reviews excluded, FSRS state joined —
  // identical trials to the web handler and MCP tool for the same history.
  const { corrections, candidates } = reconstructCorrectionTrials(
    getRevlogTrialRows({ limit: q.limit ?? 200, deckId: q.deckId }),
  )

  const report = evaluateHypercorrection(corrections)
  const queue = prioritizeRelearningQueue(candidates, corrections)
  sendJson(res, 200, {
    ok: true,
    correctionsCount: corrections.length,
    report,
    queue: queue.slice(0, 12),
  })
}

// ── GKT (graph knowledge tracing) — parity with web handlers/cognitive/gkt ──

type GktDagRows = ReturnType<typeof getConceptDag>

/** DB row → core GktNode (nullable course/lastAssessedAt become undefined). */
function toCoreGktNode(n: GktDagRows['nodes'][number]): GktNode {
  return {
    id: n.id,
    title: n.title,
    courseId: n.courseId ?? undefined,
    masteryProb: n.masteryProb,
    slipProb: n.slipProb,
    guessProb: n.guessProb,
    transitProb: n.transitProb,
    lastAssessedAt: n.lastAssessedAt ?? undefined,
  }
}

/** DB row → core GktEdge. */
function toCoreGktEdge(e: GktDagRows['edges'][number]): GktEdge {
  return { prerequisiteId: e.prerequisiteId, dependentId: e.dependentId, weight: e.weight }
}

/** GET /cognitive/gkt — the (optionally course-scoped) concept DAG, nodes topologically sorted. */
async function getGkt(_req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const { courseId } = readQuery(url, gktQuerySchema)
  const { nodes, edges } = getConceptDag(courseId)
  const coreEdges = edges.map(toCoreGktEdge)
  sendJson(res, 200, {
    ok: true,
    nodes: topologicalSortGkt(nodes.map(toCoreGktNode), coreEdges),
    edges: coreEdges,
  })
}

/**
 * POST /cognitive/gkt — `upsert_node`, `add_edge` (refused with 409 when it would
 * create a cycle — a prerequisite graph must stay a DAG), or `evaluate_review`
 * (one pass/fail on a concept → BKT update + upstream blame / downstream credit,
 * persisted atomically, with a root-cause alert naming the weakest prerequisite).
 */
async function postGkt(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, gktPostSchema)

  switch (body.action) {
    case 'upsert_node': {
      const node = upsertConceptDagNode({
        id: body.nodeData.id,
        title: body.nodeData.title,
        description: body.nodeData.description,
        masteryProb: body.nodeData.masteryProb,
        courseId: body.courseId,
      })
      sendJson(res, 200, { ok: true, node })
      return
    }

    case 'add_edge': {
      const { prerequisiteId, dependentId, weight } = body.edgeData
      if (!getConceptDagNode(prerequisiteId) || !getConceptDagNode(dependentId)) {
        throw new ApiError(404, 'both concepts must exist before they can be linked')
      }
      // Cycle check against the WHOLE graph — prerequisites may span courses.
      const all = getConceptDag().edges.map(toCoreGktEdge)
      if (wouldIntroduceCycle(all, { prerequisiteId, dependentId })) {
        throw new ApiError(409, 'that link would create a prerequisite cycle')
      }
      const edge = addConceptDagEdge({ prerequisiteId, dependentId, weight })
      sendJson(res, 200, { ok: true, edge })
      return
    }

    case 'evaluate_review': {
      const { nodes, edges } = getConceptDag(body.courseId)
      const nodeMap = new Map(nodes.map((n) => [n.id, toCoreGktNode(n)]))
      if (!nodeMap.has(body.nodeId)) throw new ApiError(404, 'concept not found')

      const result = propagateGktBelief(nodeMap, edges.map(toCoreGktEdge), {
        nodeId: body.nodeId,
        passed: body.passed,
      })
      updateNodeMasteries(result.updatedMasteries, undefined, body.nodeId)

      sendJson(res, 200, {
        ok: true,
        updatedMasteries: result.updatedMasteries,
        rootCauseAlert: result.rootCauseAlert,
      })
      return
    }
  }
}

// ── Flow state & ultradian rhythm — parity with web handlers/cognitive/flow-state ──

/** GET /cognitive/flow-state — quick assessment of the current focus block and ultradian phase. */
async function getFlowState(_req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const { elapsedMinutes, accuracy } = readQuery(url, flowQuerySchema)
  const evaluation = evaluateFlowState({
    accuracy,
    averageLatencyMs: 2500,
    expectedLatencyMs: 2500,
    cardsAnswered: Math.round(elapsedMinutes * 2),
    elapsedFocusMinutes: elapsedMinutes,
  })
  sendJson(res, 200, { ok: true, flow: evaluation })
}

/** POST /cognitive/flow-state — evaluate session telemetry (accuracy, latency, strain) for flow zone & recommendations. */
async function postFlowState(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, sessionTelemetrySchema)
  const evaluation = evaluateFlowState(body)
  sendJson(res, 200, { ok: true, flow: evaluation })
}

// ── Dual coding (Paivio) — parity with web handlers/cognitive/dual-coding ──

/** GET /cognitive/dual-coding — analyze a text snippet or card for dual-coding viability (?cardId=&text=). */
async function getDualCoding(_req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const { cardId, text } = readQuery(url, dualCodingQuerySchema)
  const analysis = analyzeDualCoding({
    cardId,
    text: text || 'Concept definition',
    hasImage: false,
    hasDiagram: false,
  })
  sendJson(res, 200, { ok: true, analysis })
}

/** POST /cognitive/dual-coding — evaluate composite retention, channel forgetting reduction, and modality suggestions. */
async function postDualCoding(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, dualCodingInputSchema)
  const analysis = analyzeDualCoding({
    cardId: body.cardId,
    text: body.text,
    hasImage: body.hasImage,
    hasDiagram: body.hasDiagram,
    verbalRetention: body.verbalRetention,
    visualRetention: body.visualRetention,
  })
  sendJson(res, 200, { ok: true, analysis })
}

/** GET /cognitive/skills/catalog — lists canonical agent skills */

/** Route table for this area — concatenated in ./index.ts in the original routes.ts order. */
export const cognitiveRoutes: Route[] = [
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
    path: '/cognitive/equilibrium',
    summary: 'Rawls reflective equilibrium + Tetlock calibration (philosophy suites)',
    handler: postEquilibrium,
  },
  {
    method: 'GET',
    path: '/cognitive/load/benchmarks',
    summary: 'list CLT benchmark scenarios and Cowan capacity limits',
    handler: getCltBenchmarks,
  },
  {
    method: 'POST',
    path: '/cognitive/load/evaluate',
    summary: 'evaluate comprehensive cognitive load, Paas efficiency, and Csikszentmihalyi flow',
    handler: postCltEvaluate,
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
    path: '/cognitive/gkt',
    summary: 'concept DAG, nodes topologically sorted (?courseId=)',
    handler: getGkt,
  },
  {
    method: 'POST',
    path: '/cognitive/gkt',
    summary: 'upsert_node, add_edge (409 on cycle) or evaluate_review BKT propagation',
    handler: postGkt,
  },
  {
    method: 'GET',
    path: '/cognitive/flow-state',
    summary: 'quick flow & ultradian phase assessment (?elapsedMinutes=&accuracy=)',
    handler: getFlowState,
  },
  {
    method: 'POST',
    path: '/cognitive/flow-state',
    summary: 'evaluate session telemetry for flow zone & recommendations',
    handler: postFlowState,
  },
  {
    method: 'GET',
    path: '/cognitive/dual-coding',
    summary: 'dual-coding viability analysis for a snippet (?cardId=&text=)',
    handler: getDualCoding,
  },
  {
    method: 'POST',
    path: '/cognitive/dual-coding',
    summary: 'composite retention, channel forgetting reduction, modality suggestions',
    handler: postDualCoding,
  },
]
