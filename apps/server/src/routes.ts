/**
 * Learning HUB server — REST routes.
 *
 * Every route reuses the existing services (packages/db review engine +
 * packages/core session/stats helpers) rather than reimplementing SQL; the few
 * listing queries mirror the web app's route queries against the same shared
 * drizzle client. All bodies and query strings are zod-validated.
 */
import { and, asc, desc, eq, lte, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  db,
  cards,
  deriveMeasuredBehavior,
  executeReview,
  executeBatchReview,
  getDeckSummaries,
  getDueCardCount,
  getDueForecast,
  getNewCardCount,
  getRevlogTrialRows,
  getStreakRow,
  getTodayReviewTallies,
  getTrueRetention,
  reconstructCorrectionTrials,
  resolveDbPath,
  type ReviewPayload,
} from '@learning-hub/db'
import {
  dayKey,
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
  judgmentOfLearningFromRevlogRows,
  buildPretestQuestion,
  CALIBRATED_ANALOGICAL_SUITES,
  CALIBRATED_FLEXIBILITY_SUITES,
  evaluateStructureMappingAttempt,
  evaluateCognitiveFlexibility,
  exportFlexibilityToFSRSCards,
  CALIBRATED_INTERACTIVITY_SUITES,
  CALIBRATED_EQUILIBRIUM_SUITES,
  evaluateReflectiveEquilibrium,
  exportEquilibriumToFSRSCards,
  analyzeElementInteractivity,
  calculateInstructionalEfficiency,
  judgmentOfLearningSchema,
  pretestRelatedness,
  selectPretestCandidates,
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
  calculateZpdMetrics,
  listZpdScenarios,
  getZpdScenarioById,
  getGraduatedPromptAtTier,
  generateFSRSZpdDeck,
  getCanonicalPFScenarios,
  getPFScenarioById,
  calculatePFMetrics,
  evaluateStudentRepresentation,
  generatePFFSRSCards,
  getCanonicalConcepTestSuites,
  getConcepTestSuiteById,
  calculatePIMetrics,
  generatePIFSRSCards,
  getCanonicalInquiryLabs,
  getInquiryLabById,
  runInquiryTrial,
  calculateInquiryMetrics,
  generateInquiryFSRSCards,
  CANONICAL_TEXT_PASSAGES,
  classifyICAPEngagement,
  evaluateReciprocalSession,
  generatePeerDialogicTurn,
  generateReciprocalFSRSDeck,
  type DialogueTurn,
  CANONICAL_SCIENTIFIC_DEBATES,
  evaluateCERArgument,
  generateAdversarialCounterArgument,
  generateCERFSRSDeck,
  type CERArgumentSubmission,
  CANONICAL_MACROCONTEXT_CASES,
  evaluateAnchoredSolution,
  simulateAnchoredSensitivity,
  generateAnchoredFSRSDeck,
  type LearnerSolutionSubmission,
  CANONICAL_CONTRASTING_SETS,
  evaluateContrastingAttempt,
  generateContrastingFSRSDeck,
  type InventedMetricSubmission,
  CANONICAL_COLLABORATIVE_SCENARIOS,
  evaluateCollaborativeDiscourse,
  generateCollaborativePeerTurn,
  generateCollaborativeFSRSDeck,
  type DiscourseSubmission,
  CANONICAL_SYSTEM_DYNAMICS_SCENARIOS,
  evaluateLearnerModel,
  generateSystemDynamicsFSRSDeck,
  runEulerSimulation,
  type LearnerModelHypothesis,
  listGedankenScenarios,
  perturbExtremeCase,
  simulateMentalAnimation,
  evaluateInquirySession,
  generateModelInquiryFsrsDeck,
  type InquirySessionInput,
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

const zpdEvaluateBodySchema = z.object({
  scenarioId: z.string().default('algo_dynamic_programming'),
  preTestScore: z.number().min(0).max(100).default(25),
  postTestScore: z.number().min(0).max(100).default(80),
  promptsConsumed: z.number().int().min(0).max(5).default(2),
  transferScores: z.array(z.number().min(0).max(100)).default([85, 75, 70]),
})

const zpdPromptBodySchema = z.object({
  scenarioId: z.string().default('algo_dynamic_programming'),
  tierLevel: z.number().int().min(1).max(5).default(1),
})

const zpdDeckBodySchema = z.object({
  scenarioId: z.string().default('algo_dynamic_programming'),
  preTestScore: z.number().min(0).max(100).default(25),
  postTestScore: z.number().min(0).max(100).default(80),
  promptsConsumed: z.number().int().min(0).max(5).default(2),
  transferScores: z.array(z.number().min(0).max(100)).default([85, 75, 70]),
})

const pfEvaluateBodySchema = z.object({
  scenarioId: z.string().default('pf-variance-dispersion'),
  title: z.string().default('Intuitive Hypothesis'),
  description: z.string().default(''),
  mechanism: z.string().default(''),
  structuralFeatures: z.array(z.string()).default([]),
})

const pfMetricsBodySchema = z.object({
  scenarioId: z.string().default('pf-variance-dispersion'),
  representationCount: z.number().int().min(1).max(10).default(3),
  impasseEncountered: z.boolean().default(true),
  affectiveImpasseRating: z.number().min(1).max(5).default(4),
  impasseDepthScore: z.number().min(0).max(100).default(75),
  featureAlignment: z.number().min(0).max(100).default(85),
  parameterMapping: z.number().min(0).max(100).default(80),
  invariantGrasp: z.number().min(0).max(100).default(80),
  transferSuccessCount: z.number().int().min(0).max(3).default(3),
})

const pfDeckBodySchema = z.object({
  scenarioId: z.string().default('pf-variance-dispersion'),
  pfiScore: z.number().min(0).max(100).default(85),
  cigScore: z.number().min(0).max(100).default(80),
})

const piDialogueBodySchema = z.object({
  suiteId: z.string().default('ct-thermal-expansion-plate'),
})

const piEvaluateBodySchema = z.object({
  suiteId: z.string().default('ct-thermal-expansion-plate'),
  q1InitialOptionId: z.string().optional(),
  q1InitialConfidence: z.number().min(1).max(5).default(3),
  q1RevoteOptionId: z.string().optional(),
  q1RevoteConfidence: z.number().min(1).max(5).default(4),
  q2TransferOptionId: z.string().optional(),
  peerDiscussionOccurred: z.boolean().default(true),
  vote1AccuracyPct: z.number().min(0).max(100).default(38),
  vote2AccuracyPct: z.number().min(0).max(100).default(82),
})

const piDeckBodySchema = z.object({
  suiteId: z.string().default('ct-thermal-expansion-plate'),
  hakeGain: z.number().min(0).max(1).default(0.75),
  isomorphicCorrect: z.boolean().default(true),
})

const inquiryTrialBodySchema = z.object({
  labId: z.string().default('lab-pendulum-period'),
  trialIndex: z.number().int().nonnegative().default(0),
  variableSettings: z.record(z.string(), z.number()).default({}),
  previousSettings: z.record(z.string(), z.number()).optional(),
})

const inquiryEvaluateBodySchema = z.object({
  labId: z.string().default('lab-pendulum-period'),
  votatCompliantFraction: z.number().min(0).max(1).default(1.0),
  anomalousReaction: z
    .enum([
      'ignore',
      'reject',
      'exclude',
      'hold_in_abeyance',
      'reinterpretation',
      'peripheral_change',
      'theory_revision',
    ])
    .default('theory_revision'),
  falsificationTrialCount: z.number().int().min(0).default(1),
  finalHypothesisCapturesInvariant: z.boolean().default(true),
})

const inquiryDeckBodySchema = z.object({
  labId: z.string().default('lab-pendulum-period'),
  sdiScore: z.number().min(0).max(100).default(85),
})

const rtPeerBodySchema = z.object({
  passageId: z.string().default('passage-endosymbiosis'),
  preferredRole: z.enum(['questioner', 'clarifier', 'summarizer', 'predictor']).optional(),
  userText: z.string().default('What structural evidence proves endosymbiosis?'),
})

const rtEvaluateBodySchema = z.object({
  passageId: z.string().default('passage-endosymbiosis'),
  turns: z
    .array(
      z.object({
        role: z.enum(['questioner', 'clarifier', 'summarizer', 'predictor']),
        text: z.string(),
        resolvedMisconceptionId: z.string().optional(),
      }),
    )
    .default([
      {
        role: 'questioner',
        text: 'What specific structural evidence causally proves that the inner mitochondrial membrane is bacterial?',
      },
    ]),
})

const rtDeckBodySchema = z.object({
  passageId: z.string().default('passage-endosymbiosis'),
  sampleText: z.string().default('Cardiolipin proves endosymbiosis because eukaryotes lack it.'),
})

const cerCounterBodySchema = z.object({
  debateId: z.string().default('debate-amoc-tipping'),
  claimId: z.string().default('claim-amoc-tipping-near'),
})

const cerEvaluateBodySchema = z.object({
  debateId: z.string().default('debate-amoc-tipping'),
  selectedClaimId: z.string().default('claim-amoc-tipping-near'),
  claimStatement: z
    .string()
    .default(
      'The AMOC has crossed early-warning tipping thresholds and is on course for irreversible bi-stable shutdown this century.',
    ),
  selectedEvidenceIds: z
    .array(z.string())
    .default(['ev-amoc-sst-autocorr', 'ev-amoc-paleo-glacier', 'ev-amoc-cmip6-bias']),
  userEvidenceSynthesis: z
    .string()
    .default(
      'Subpolar SST fingerprints exhibit critical slowing down with increased variance, mirrored by Heinrich Stadial 1 paleorecords where freshwater pulses suppressed overturning by >70%. CMIP6 stability is an artifact of deep salinity restoring.',
    ),
  selectedPrincipleIds: z
    .array(z.string())
    .default(['princ-salt-advection', 'princ-critical-slowing']),
  userReasoningStatement: z
    .string()
    .default(
      'According to Stommel salt-advection feedback, high-latitude freshening lowers surface density; consequently, deep convection decelerates, which reduces northward transport of saline waters, creating runaway positive feedback. Furthermore, bifurcation theory demonstrates that increased autocorrelation causally indicates loss of dynamical resilience.',
    ),
  targetedCounterArgumentId: z.string().optional().default('counter-amoc-rapid'),
  userRebuttalStatement: z
    .string()
    .optional()
    .default(
      'Opponents cite the 2004–2022 RAPID-MOCHA mooring array as evidence of stability; however, this rebuttal is flawed because 18 years of instrumental data is statistically insufficient to disentangle multi-decadal Atlantic Multidecadal Variability from long-term centennial deceleration.',
    ),
})

const cerDeckBodySchema = z.object({
  debateId: z.string().default('debate-amoc-tipping'),
  ersBaseline: z.number().min(0).max(100).default(85),
})

const anchoredEvaluateBodySchema = z.object({
  caseId: z.string().default('case-jasper-flight'),
  extractedDataValues: z.record(z.string(), z.number()).default({}),
  subGoalSequence: z.array(z.string()).default([]),
  calculatedSubGoalOutputs: z.record(z.string(), z.number()).default({}),
  finalDecisionChoice: z.string().default('choice-direct-flight'),
  decisionJustification: z.string().default('Standard navigation flight plan.'),
})

const anchoredSensitivityBodySchema = z.object({
  caseId: z.string().default('case-jasper-flight'),
  parameterId: z.string().default('data-headwind-speed'),
  variedValue: z.number().default(25),
})

const anchoredDeckBodySchema = z.object({
  caseId: z.string().default('case-jasper-flight'),
  ikrsBaseline: z.number().min(0).max(100).default(85),
})

const contrastingEvaluateBodySchema = z.object({
  setId: z.string().default('set-density-buoyancy'),
  inventedMetricName: z.string().default('Density Ratio Invariant'),
  formulaDescription: z
    .string()
    .default('Ratio of object mass to displacement volume across contrasting variants.'),
  selectedDimensionIds: z.array(z.string()).default(['dim-mass', 'dim-volume']),
  variantRankings: z.array(z.string()).default([]),
  impasseEncountered: z.boolean().default(true),
  reflectionNotes: z
    .string()
    .default('Noticed that volume or mass alone fails, but mass/volume coordinates cases.'),
})

const contrastingDeckBodySchema = z.object({
  setId: z.string().default('set-density-buoyancy'),
  cdtsBaseline: z.number().min(0).max(100).default(85),
})

const collaborativePartnerBodySchema = z.object({
  scenarioId: z.string().default('collab-neuro-synaptic-plasticity'),
  learnerTurnText: z.string().default('Initial question regarding stability.'),
  turnIndex: z.number().int().min(0).default(0),
})

const collaborativeEvaluateBodySchema = z.object({
  scenarioId: z.string().default('collab-neuro-synaptic-plasticity'),
  learnerInitialPosition: z.string().default('Initial framing position.'),
  dialogueTurns: z
    .array(
      z.object({
        id: z.string(),
        speaker: z.enum(['learner', 'peer_partner', 'synthesizer_agent']),
        role: z.enum(['proposer', 'questioner', 'synthesizer', 'challenger']),
        text: z.string(),
        speechAct: z.enum([
          'transactive_critique',
          'transactive_extension',
          'transactive_synthesis',
          'transactive_justification',
          'non_transactive',
        ]),
        targetTurnId: z.string().optional(),
        epistemicKeywords: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  jointSynthesis: z.string().default('Joint invariant reconciliation statement.'),
  individualTransferAnswer: z.string().default('Transfer generalization application.'),
})

const collaborativeDeckBodySchema = z.object({
  scenarioId: z.string().default('collab-neuro-synaptic-plasticity'),
  ceiBaseline: z.number().min(0).max(100).default(85),
})

const systemDynamicsSimulateBodySchema = z.object({
  scenarioId: z.string().default('climate-permafrost-methane'),
  stepsCount: z.number().int().min(5).max(300).default(50),
  dt: z.number().min(0.01).max(10).default(1.0),
  policyMultipliers: z.record(z.string(), z.number()).optional(),
})

const systemDynamicsEvaluateBodySchema = z.object({
  scenarioId: z.string().default('climate-permafrost-methane'),
  classifiedVariables: z
    .array(
      z.object({
        id: z.string(),
        nature: z.enum(['stock', 'flow', 'auxiliary', 'parameter']),
      }),
    )
    .default([]),
  identifiedLoops: z
    .array(
      z.object({
        id: z.string(),
        polarity: z.enum(['reinforcing', 'balancing']),
        elementIds: z.array(z.string()),
        delayIdentified: z.boolean(),
      }),
    )
    .default([]),
  identifiedArchetype: z
    .enum([
      'limits_to_growth',
      'shifting_the_burden',
      'tragedy_of_the_commons',
      'fixes_that_fail',
      'eroding_goals',
      'escalation',
    ])
    .default('limits_to_growth'),
  proposedHighLeverageIntervention: z
    .string()
    .default('Rewire system rules and information channels.'),
  predictedBehavior: z
    .enum([
      'exponential_growth',
      's_shaped_growth',
      'overshoot_and_collapse',
      'damped_oscillation',
      'asymptotic_stability',
    ])
    .default('overshoot_and_collapse'),
})

const systemDynamicsDeckBodySchema = z.object({
  scenarioId: z.string().default('climate-permafrost-methane'),
  sdiBaseline: z.number().min(0).max(100).default(85),
})

const modelInquiryPerturbBodySchema = z.object({
  scenarioId: z.string().default('galileo_falling_bodies'),
  extremeCaseId: z.string().default('ec_feather_cannonball'),
  parameterLimit: z.string().optional(),
})

const modelInquirySimulateBodySchema = z.object({
  scenarioId: z.string().default('galileo_falling_bodies'),
  stepIds: z
    .array(z.string())
    .default([
      'step_drop_isolated',
      'step_connect_cord',
      'step_deduction_drag',
      'step_deduction_combined_mass',
      'step_contradiction_crucible',
    ]),
})

const modelInquiryEvaluateBodySchema = z.object({
  scenarioId: z.string().default('galileo_falling_bodies'),
  initialModelNotes: z.string().optional(),
  selectedExtremeCaseIds: z.array(z.string()).default([]),
  extremeCasePredictions: z.record(z.string(), z.string()).default({}),
  simulativeStepOrder: z.array(z.string()).default([]),
  identifiedContradictions: z.array(z.string()).default([]),
  selectedBridgingId: z.string().optional(),
  bridgingExplanation: z.string().optional(),
  revisedModelHypothesis: z.string().optional(),
})

const modelInquiryDeckBodySchema = z.object({
  scenarioId: z.string().default('galileo_falling_bodies'),
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
  // Shared stats repo — the web handler projects the same rows plus
  // hasCustomWeights; the aggregate query exists once (repos/stats).
  sendJson(res, 200, { decks: getDeckSummaries() })
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
  // Shared stats repo — one definition for web, MCP and CLI (repos/stats).
  const tallies = getTodayReviewTallies()
  const streakRow = getStreakRow()

  sendJson(res, 200, {
    ok: true,
    day: tallies.day,
    due: getDueCardCount(),
    newCards: getNewCardCount(),
    reviews: {
      count: tallies.reviews,
      correct: tallies.correct,
      avgTimeMs: tallies.avgTimeMs,
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
  // Shared stats repo — identical aggregation to the web /api/review/stats handler.
  sendJson(res, 200, {
    ok: true,
    trueRetention: getTrueRetention(),
    today: getTodayReviewTallies(),
    forecast: getDueForecast(),
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
  // Shared repo query (undone reviews excluded — parity with the web handler)
  // + core's canonical row→JOL mapping (one definition for every host).
  const rows = getRevlogTrialRows({ limit: q.limit ?? 100, deckId: q.deckId })
  const trials = judgmentOfLearningFromRevlogRows(rows)

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

/** GET /cognitive/zpd/scenarios — list canonical ZPD scenarios */
async function getZpdScenarios(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const scenarios = listZpdScenarios()
  sendJson(res, 200, {
    ok: true,
    scenarios: scenarios.map((s) => ({
      id: s.id,
      domain: s.domain,
      title: s.title,
      subtitle: s.subtitle,
      theoreticalCore: s.theoreticalCore,
    })),
  })
}

/** POST /cognitive/zpd/evaluate — evaluate ZPD metrics & learning potential */
async function postZpdEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, zpdEvaluateBodySchema)
  const scenario = getZpdScenarioById(body.scenarioId) || listZpdScenarios()[0]!
  const metrics = calculateZpdMetrics(
    body.preTestScore,
    body.postTestScore,
    body.promptsConsumed,
    body.transferScores,
  )
  sendJson(res, 200, {
    ok: true,
    scenario: {
      id: scenario.id,
      title: scenario.title,
      domain: scenario.domain,
    },
    metrics,
  })
}

/** POST /cognitive/zpd/prompt — request graduated prompt at tier level */
async function postZpdPrompt(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, zpdPromptBodySchema)
  const scenario = getZpdScenarioById(body.scenarioId) || listZpdScenarios()[0]!
  const prompt = getGraduatedPromptAtTier(scenario.mediatedProblem, body.tierLevel)
  sendJson(res, 200, {
    ok: true,
    scenarioTitle: scenario.title,
    tierLevel: body.tierLevel,
    prompt: prompt ?? null,
  })
}

/** POST /cognitive/zpd/deck — generate calibrated FSRS-6 review deck */
async function postZpdDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, zpdDeckBodySchema)
  const scenario = getZpdScenarioById(body.scenarioId) || listZpdScenarios()[0]!
  const metrics = calculateZpdMetrics(
    body.preTestScore,
    body.postTestScore,
    body.promptsConsumed,
    body.transferScores,
  )
  const deck = generateFSRSZpdDeck(scenario, metrics)
  sendJson(res, 200, {
    ok: true,
    scenarioTitle: scenario.title,
    metrics: {
      lps: metrics.learningPotentialScore,
      cmi: metrics.cognitiveModifiabilityIndex,
      typology: metrics.typology,
    },
    deck,
  })
}

/** GET /cognitive/pf/scenarios — list canonical Productive Failure scenarios */
async function getPFScenarios(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const scenarios = getCanonicalPFScenarios()
  sendJson(res, 200, {
    ok: true,
    scenarios: scenarios.map((s) => ({
      id: s.id,
      domain: s.domain,
      title: s.title,
      subtitle: s.subtitle,
      targetConcept: s.targetConcept,
    })),
  })
}

/** POST /cognitive/pf/evaluate — evaluate student representation against invariants */
async function postPFEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, pfEvaluateBodySchema)
  const scenario = getPFScenarioById(body.scenarioId) || getCanonicalPFScenarios()[0]!
  const representation = evaluateStudentRepresentation(scenario.id, {
    title: body.title,
    description: body.description,
    mechanism: body.mechanism,
    structuralFeatures: body.structuralFeatures,
  })
  sendJson(res, 200, {
    ok: true,
    scenarioId: scenario.id,
    representation,
  })
}

/** POST /cognitive/pf/metrics — compute quantitative Productive Failure metrics */
async function postPFMetrics(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, pfMetricsBodySchema)
  const scenario = getPFScenarioById(body.scenarioId) || getCanonicalPFScenarios()[0]!
  const representations = scenario.exemplarStudentRepresentations.slice(0, body.representationCount)
  const impasse = {
    impasseEncountered: body.impasseEncountered,
    failureModeIdentified: 'Boundary distortion breakdown',
    boundaryConditionsTested: ['Outliers', 'Zeros'],
    knowledgeGapArticulated: 'Need canonical invariant parameterization',
    affectiveImpasseRating: body.affectiveImpasseRating,
    impasseDepthScore: body.impasseDepthScore,
  }
  const consolidationRatings = {
    featureAlignment: body.featureAlignment,
    parameterMapping: body.parameterMapping,
    invariantGrasp: body.invariantGrasp,
  }
  const transferResults = scenario.transferProbes.map((probe, idx) => ({
    probeId: probe.probeId,
    isCorrect: idx < body.transferSuccessCount,
    confidence: 4,
  }))

  const metrics = calculatePFMetrics({
    representations,
    impasse,
    consolidationRatings,
    transferResults,
  })

  sendJson(res, 200, {
    ok: true,
    scenarioTitle: scenario.title,
    metrics,
  })
}

/** POST /cognitive/pf/deck — generate calibrated FSRS-6 deck */
async function postPFDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, pfDeckBodySchema)
  const scenario = getPFScenarioById(body.scenarioId) || getCanonicalPFScenarios()[0]!
  const dummyMetrics = calculatePFMetrics({
    representations: scenario.exemplarStudentRepresentations,
    impasse: {
      impasseEncountered: true,
      failureModeIdentified: 'Boundary limit',
      boundaryConditionsTested: ['Outliers'],
      knowledgeGapArticulated: 'Need invariant model',
      affectiveImpasseRating: 4,
      impasseDepthScore: 80,
    },
    consolidationRatings: {
      featureAlignment: body.cigScore,
      parameterMapping: body.cigScore,
      invariantGrasp: body.cigScore,
    },
    transferResults: scenario.transferProbes.map((p) => ({
      probeId: p.probeId,
      isCorrect: true,
      confidence: 4,
    })),
  })
  const deck = generatePFFSRSCards(scenario, dummyMetrics)
  sendJson(res, 200, {
    ok: true,
    scenarioTitle: scenario.title,
    cardsCount: deck.length,
    initialStabilityDays: deck[0]?.initialStabilityDays,
    initialDifficulty: deck[0]?.initialDifficulty,
    deck,
  })
}

/** GET /cognitive/pi/conceptests — list canonical ConcepTest suites */
async function getPIConceptests(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const suites = getCanonicalConcepTestSuites()
  sendJson(res, 200, {
    ok: true,
    suites: suites.map((s) => ({
      id: s.id,
      title: s.title,
      domain: s.domain,
      subtitle: s.subtitle,
      canonicalInvariant: s.canonicalInvariant,
      q1Prompt: s.q1Prompt,
      q2IsomorphicPrompt: s.q2IsomorphicPrompt,
      peerDialogueCount: s.simulatedPeers.length,
    })),
  })
}

/** POST /cognitive/pi/dialogue — retrieve simulated peer discussion dialogue */
async function postPIDialogue(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, piDialogueBodySchema)
  const suite = getConcepTestSuiteById(body.suiteId) ?? getCanonicalConcepTestSuites()[0]!
  sendJson(res, 200, {
    ok: true,
    suiteId: suite.id,
    suiteTitle: suite.title,
    classroomVoteDistribution: suite.q1ClassroomVoteDistribution,
    simulatedPeers: suite.simulatedPeers,
  })
}

/** POST /cognitive/pi/evaluate — evaluate peer instruction trajectory metrics (Hake g, Mazur PI, DCR, ITP) */
async function postPIEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, piEvaluateBodySchema)
  const suite = getConcepTestSuiteById(body.suiteId) ?? getCanonicalConcepTestSuites()[0]!

  const q1Correct = suite.q1Options.find((o) => o.isCorrect)?.id
  const q2Correct = suite.q2Options.find((o) => o.isCorrect)?.id

  const q1Initial = body.q1InitialOptionId ?? suite.q1Options[0]!.id
  const q1Revote = body.q1RevoteOptionId ?? q1Correct ?? q1Initial
  const q2Transfer = body.q2TransferOptionId ?? q2Correct ?? suite.q2Options[0]!.id

  const metrics = calculatePIMetrics({
    suite,
    q1InitialOptionId: q1Initial,
    q1InitialConfidence: body.q1InitialConfidence,
    q1RevoteOptionId: q1Revote,
    q1RevoteConfidence: body.q1RevoteConfidence,
    q2TransferOptionId: q2Transfer,
    peerDiscussionOccurred: body.peerDiscussionOccurred,
    simulatedClassroomAccuracyVote1: body.vote1AccuracyPct,
    simulatedClassroomAccuracyVote2: body.vote2AccuracyPct,
  })

  sendJson(res, 200, {
    ok: true,
    suiteTitle: suite.title,
    metrics,
  })
}

/** POST /cognitive/pi/deck — generate calibrated FSRS-6 ConcepTest flashcards */
async function postPIDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, piDeckBodySchema)
  const suite = getConcepTestSuiteById(body.suiteId) ?? getCanonicalConcepTestSuites()[0]!
  const dummyMetrics = calculatePIMetrics({
    suite,
    q1InitialOptionId: suite.q1Options[0]!.id,
    q1InitialConfidence: 3,
    q1RevoteOptionId: suite.q1Options.find((o) => o.isCorrect)!.id,
    q1RevoteConfidence: 5,
    q2TransferOptionId: body.isomorphicCorrect
      ? suite.q2Options.find((o) => o.isCorrect)!.id
      : suite.q2Options[0]!.id,
    peerDiscussionOccurred: true,
    simulatedClassroomAccuracyVote1: 35,
    simulatedClassroomAccuracyVote2: 85,
  })
  const cards = generatePIFSRSCards(suite, dummyMetrics)
  sendJson(res, 200, {
    ok: true,
    suiteTitle: suite.title,
    count: cards.length,
    cards,
  })
}

/** GET /cognitive/inquiry/labs — list canonical scientific discovery inquiry laboratories */
async function getInquiryLabs(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const labs = getCanonicalInquiryLabs()
  sendJson(res, 200, {
    ok: true,
    labs: labs.map((l) => ({
      id: l.id,
      title: l.title,
      domain: l.domain,
      subtitle: l.subtitle,
      researchQuestion: l.researchQuestion,
      canonicalInvariantLaw: l.canonicalInvariantLaw,
      independentVariables: l.independentVariables,
      dependentOutputs: l.dependentOutputs,
      anomalousScenariosCount: l.anomalousScenarios.length,
    })),
  })
}

/** POST /cognitive/inquiry/trial — execute simulation trial and check VOTAT isolation */
async function postInquiryTrial(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, inquiryTrialBodySchema)
  const lab = getInquiryLabById(body.labId) ?? getCanonicalInquiryLabs()[0]!
  const trial = runInquiryTrial(lab, body.trialIndex, body.variableSettings, body.previousSettings)
  sendJson(res, 200, {
    ok: true,
    labId: lab.id,
    labTitle: lab.title,
    trial,
  })
}

/** POST /cognitive/inquiry/evaluate — evaluate SDDS discovery metrics (VOTAT, CBI, ADRI, SDI) */
async function postInquiryEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, inquiryEvaluateBodySchema)
  const lab = getInquiryLabById(body.labId) ?? getCanonicalInquiryLabs()[0]!

  const t1 = runInquiryTrial(lab, 0, { length: 1.0, mass: 0.2, angle: 15, gravity: 9.81 })
  const t2Settings =
    body.votatCompliantFraction >= 0.5
      ? { length: 1.5, mass: 0.2, angle: 15, gravity: 9.81 }
      : { length: 1.5, mass: 0.8, angle: 45, gravity: 9.81 }
  const t2 = runInquiryTrial(lab, 1, t2Settings, t1.variableSettings)

  const metrics = calculateInquiryMetrics({
    lab,
    trials: [t1, t2],
    anomalousSubmissions: [
      {
        anomalyId: lab.anomalousScenarios[0]?.id ?? 'a1',
        reaction: body.anomalousReaction,
        articulatedExplanation: 'Accommodated invariant schema',
      },
    ],
    falsificationTrialCount: body.falsificationTrialCount,
    finalHypothesisCapturesInvariant: body.finalHypothesisCapturesInvariant,
  })

  sendJson(res, 200, {
    ok: true,
    labTitle: lab.title,
    metrics,
  })
}

/** POST /cognitive/inquiry/deck — generate calibrated FSRS-6 review flashcards */
async function postInquiryDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, inquiryDeckBodySchema)
  const lab = getInquiryLabById(body.labId) ?? getCanonicalInquiryLabs()[0]!
  const dummyMetrics = calculateInquiryMetrics({
    lab,
    trials: [
      runInquiryTrial(lab, 0, { length: 1.0, mass: 0.2, angle: 15, gravity: 9.81 }),
      runInquiryTrial(
        lab,
        1,
        { length: 1.5, mass: 0.2, angle: 15, gravity: 9.81 },
        { length: 1.0, mass: 0.2, angle: 15, gravity: 9.81 },
      ),
    ],
    anomalousSubmissions: [
      {
        anomalyId: lab.anomalousScenarios[0]?.id ?? 'a1',
        reaction: body.sdiScore >= 70 ? 'theory_revision' : 'ignore',
        articulatedExplanation: 'Calibrated model',
      },
    ],
    falsificationTrialCount: 1,
    finalHypothesisCapturesInvariant: body.sdiScore >= 60,
  })
  const cards = generateInquiryFSRSCards(lab, dummyMetrics)
  sendJson(res, 200, {
    ok: true,
    labTitle: lab.title,
    count: cards.length,
    cards,
  })
}

/** GET /cognitive/rt/passages — list canonical text passages */
async function getReciprocalPassages(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const passages = CANONICAL_TEXT_PASSAGES
  sendJson(res, 200, {
    ok: true,
    passages: passages.map((p) => ({
      id: p.id,
      title: p.title,
      discipline: p.discipline,
      difficulty: p.difficulty,
      wordCount: p.wordCount,
      coreThesis: p.coreThesis,
      stemsCount: p.stems.length,
      misconceptionsCount: p.commonMisconceptions.length,
    })),
  })
}

/** POST /cognitive/rt/peer — generate Socratic peer response */
async function postReciprocalPeer(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, rtPeerBodySchema)
  const passage =
    CANONICAL_TEXT_PASSAGES.find((p) => p.id === body.passageId) ?? CANONICAL_TEXT_PASSAGES[0]!
  const history: DialogueTurn[] = [
    {
      id: 'turn-user-hist',
      speaker: 'user',
      role: 'questioner',
      turnIndex: 0,
      text: body.userText,
      timestamp: Date.now() - 5000,
      icapLevel: 'constructive',
      elaborationScore: 70,
    },
  ]
  const peerTurn = generatePeerDialogicTurn(passage, history, body.preferredRole)
  sendJson(res, 200, {
    ok: true,
    passageTitle: passage.title,
    peerRole: peerTurn.role,
    peerText: peerTurn.text,
    stemId: peerTurn.stemId,
    icapLevel: peerTurn.icapLevel,
  })
}

/** POST /cognitive/rt/evaluate — evaluate dialogue session (ICAP, RSBS, EDI, MRR, RDMS) */
async function postReciprocalEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, rtEvaluateBodySchema)
  const passage =
    CANONICAL_TEXT_PASSAGES.find((p) => p.id === body.passageId) ?? CANONICAL_TEXT_PASSAGES[0]!
  const turns: DialogueTurn[] = body.turns.map((r, i) => {
    const { icapLevel, causalScore } = classifyICAPEngagement(r.text, i > 0)
    return {
      id: `turn-eval-${i}`,
      speaker: 'user',
      role: r.role,
      turnIndex: i,
      text: r.text,
      timestamp: Date.now() - (body.turns.length - i) * 10000,
      icapLevel,
      elaborationScore: causalScore,
      resolvedMisconceptionId: r.resolvedMisconceptionId,
    }
  })
  const evaluation = evaluateReciprocalSession(turns, passage)
  sendJson(res, 200, {
    ok: true,
    passageTitle: passage.title,
    rdms: evaluation.rdms,
    masteryBand: evaluation.masteryBand,
    icap: evaluation.icap,
    strategy: evaluation.strategy,
    elaboration: evaluation.elaboration,
    repair: evaluation.repair,
    feedback: evaluation.feedback,
    recommendations: evaluation.recommendations,
  })
}

/** POST /cognitive/rt/deck — generate calibrated FSRS-6 review deck */
async function postReciprocalDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, rtDeckBodySchema)
  const passage =
    CANONICAL_TEXT_PASSAGES.find((p) => p.id === body.passageId) ?? CANONICAL_TEXT_PASSAGES[0]!
  const turns: DialogueTurn[] = [
    {
      id: 'turn-sample',
      speaker: 'user',
      role: 'clarifier',
      turnIndex: 0,
      text: body.sampleText,
      timestamp: Date.now(),
      icapLevel: 'constructive',
      elaborationScore: 75,
    },
  ]
  const evaluation = evaluateReciprocalSession(turns, passage)
  const deck = generateReciprocalFSRSDeck(passage, turns, evaluation)
  sendJson(res, 200, {
    ok: true,
    passageTitle: passage.title,
    rdmsBaseline: deck.rdmsBaseline,
    cardsCount: deck.cards.length,
    cards: deck.cards,
  })
}

/** GET /cognitive/cer/debates — list canonical scientific debate cases */
async function getScientificDebates(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const debates = CANONICAL_SCIENTIFIC_DEBATES
  sendJson(res, 200, {
    ok: true,
    debates: debates.map((d) => ({
      id: d.id,
      title: d.title,
      domain: d.domain,
      phenomenon: d.phenomenonContext,
      claimsCount: d.competingClaims.length,
      evidenceCount: d.evidencePool.length,
      principlesCount: d.scientificPrinciples.length,
      countersCount: d.counterArguments.length,
    })),
  })
}

/** POST /cognitive/cer/counter — generate adversarial counter-argument */
async function postCERCounter(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, cerCounterBodySchema)
  const debate =
    CANONICAL_SCIENTIFIC_DEBATES.find((d) => d.id === body.debateId) ??
    CANONICAL_SCIENTIFIC_DEBATES[0]!
  const counter = generateAdversarialCounterArgument(debate, body.claimId)
  sendJson(res, 200, {
    ok: true,
    debateTitle: debate.title,
    counterArgument: counter,
  })
}

/** POST /cognitive/cer/evaluate — evaluate CER argument telemetry */
async function postCEREvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, cerEvaluateBodySchema)
  const debate =
    CANONICAL_SCIENTIFIC_DEBATES.find((d) => d.id === body.debateId) ??
    CANONICAL_SCIENTIFIC_DEBATES[0]!
  const submission: CERArgumentSubmission = {
    debateId: debate.id,
    selectedClaimId: body.selectedClaimId,
    claimStatement: body.claimStatement,
    selectedEvidenceIds: body.selectedEvidenceIds,
    userEvidenceSynthesis: body.userEvidenceSynthesis,
    selectedPrincipleIds: body.selectedPrincipleIds,
    userReasoningStatement: body.userReasoningStatement,
    targetedCounterArgumentId: body.targetedCounterArgumentId,
    userRebuttalStatement: body.userRebuttalStatement,
  }
  const evaluation = evaluateCERArgument(debate, submission)
  sendJson(res, 200, {
    ok: true,
    debateTitle: debate.title,
    evaluation,
  })
}

/** POST /cognitive/cer/deck — generate calibrated FSRS-6 review deck */
async function postCERDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, cerDeckBodySchema)
  const debate =
    CANONICAL_SCIENTIFIC_DEBATES.find((d) => d.id === body.debateId) ??
    CANONICAL_SCIENTIFIC_DEBATES[0]!
  const submission: CERArgumentSubmission = {
    debateId: debate.id,
    selectedClaimId: debate.competingClaims[0]!.id,
    claimStatement: debate.competingClaims[0]!.claim,
    selectedEvidenceIds: [debate.evidencePool[0]!.id],
    userEvidenceSynthesis: 'Primary empirical observational synthesis.',
    selectedPrincipleIds: [debate.scientificPrinciples[0]!.id],
    userReasoningStatement: 'Governing causal law links observational evidence to claim.',
    targetedCounterArgumentId: debate.counterArguments[0]?.id,
    userRebuttalStatement: 'Addressing counter-evidence with boundary conditions.',
  }
  const evaluation = evaluateCERArgument(debate, submission)
  const deck = generateCERFSRSDeck(debate, submission, evaluation)
  sendJson(res, 200, {
    ok: true,
    debateTitle: debate.title,
    ersBaseline: deck.ersBaseline,
    cardsCount: deck.cards.length,
    cards: deck.cards,
  })
}

/** GET /cognitive/anchored/cases — list canonical anchored macrocontexts */
async function getAnchoredCases(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const cases = CANONICAL_MACROCONTEXT_CASES
  sendJson(res, 200, {
    ok: true,
    cases: cases.map((c) => ({
      id: c.id,
      title: c.title,
      domain: c.domain,
      difficulty: c.difficulty,
      missionGoal: c.missionGoal,
      embeddedDataCount: c.embeddedData.length,
      subGoalsCount: c.subGoalHierarchy.length,
      constraintsCount: c.constraints.length,
    })),
  })
}

/** POST /cognitive/anchored/evaluate — evaluate situated problem-solving trajectory */
async function postAnchoredEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, anchoredEvaluateBodySchema)
  const macroCase =
    CANONICAL_MACROCONTEXT_CASES.find((c) => c.id === body.caseId) ??
    CANONICAL_MACROCONTEXT_CASES[0]!
  const submission: LearnerSolutionSubmission = {
    caseId: macroCase.id,
    extractedDataValues: body.extractedDataValues,
    subGoalSequence: body.subGoalSequence,
    calculatedSubGoalOutputs: body.calculatedSubGoalOutputs,
    finalDecisionChoice: body.finalDecisionChoice,
    decisionJustification: body.decisionJustification,
  }
  const evaluation = evaluateAnchoredSolution(macroCase, submission)
  sendJson(res, 200, {
    ok: true,
    caseTitle: macroCase.title,
    evaluation,
  })
}

/** POST /cognitive/anchored/sensitivity — what-if sensitivity simulator */
async function postAnchoredSensitivity(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, anchoredSensitivityBodySchema)
  const macroCase =
    CANONICAL_MACROCONTEXT_CASES.find((c) => c.id === body.caseId) ??
    CANONICAL_MACROCONTEXT_CASES[0]!
  const simulation = simulateAnchoredSensitivity(macroCase, body.parameterId, body.variedValue)
  sendJson(res, 200, {
    ok: true,
    simulation,
  })
}

/** POST /cognitive/anchored/deck — generate calibrated FSRS-6 review deck */
async function postAnchoredDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, anchoredDeckBodySchema)
  const macroCase =
    CANONICAL_MACROCONTEXT_CASES.find((c) => c.id === body.caseId) ??
    CANONICAL_MACROCONTEXT_CASES[0]!
  const dummySubmission: LearnerSolutionSubmission = {
    caseId: macroCase.id,
    extractedDataValues: {},
    subGoalSequence: macroCase.subGoalHierarchy.map((sg) => sg.id),
    calculatedSubGoalOutputs: {},
    finalDecisionChoice: 'optimal_decision',
    decisionJustification: 'Optimal calibrated pathway.',
  }
  const evaluation = evaluateAnchoredSolution(macroCase, dummySubmission)
  evaluation.ikrs = body.ikrsBaseline
  const deck = generateAnchoredFSRSDeck(macroCase, evaluation)
  sendJson(res, 200, {
    ok: true,
    caseTitle: macroCase.title,
    ikrsBaseline: deck.ikrsBaseline,
    cardsCount: deck.cards.length,
    cards: deck.cards,
  })
}

/** GET /cognitive/contrasting/sets — list canonical contrasting cases and invention sets */
async function getContrastingSets(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const sets = CANONICAL_CONTRASTING_SETS
  sendJson(res, 200, {
    ok: true,
    sets: sets.map((s) => ({
      id: s.id,
      title: s.title,
      domain: s.domain,
      difficulty: s.difficulty,
      problemOverview: s.problemOverview,
      variantsCount: s.variants.length,
      dimensionsCount: s.dimensions.length,
      canonicalGoal: s.canonicalTelling.formalLawName,
      canonicalEquation: s.canonicalTelling.formalEquation,
    })),
  })
}

/** POST /cognitive/contrasting/evaluate — evaluate contrasting cases invention attempt */
async function postContrastingEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, contrastingEvaluateBodySchema)
  const caseSet =
    CANONICAL_CONTRASTING_SETS.find((s) => s.id === body.setId) ?? CANONICAL_CONTRASTING_SETS[0]!
  const submission: InventedMetricSubmission = {
    setId: caseSet.id,
    inventedMetricName: body.inventedMetricName,
    formulaDescription: body.formulaDescription,
    selectedDimensionIds: body.selectedDimensionIds,
    variantRankings:
      body.variantRankings.length > 0
        ? body.variantRankings
        : [...caseSet.variants].sort((a, b) => a.outcomeValue - b.outcomeValue).map((v) => v.id),
    impasseEncountered: body.impasseEncountered,
    reflectionNotes: body.reflectionNotes,
  }
  const evaluation = evaluateContrastingAttempt(caseSet, submission)
  sendJson(res, 200, {
    ok: true,
    setTitle: caseSet.title,
    evaluation,
  })
}

/** POST /cognitive/contrasting/deck — generate calibrated FSRS-6 review deck */
async function postContrastingDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, contrastingDeckBodySchema)
  const caseSet =
    CANONICAL_CONTRASTING_SETS.find((s) => s.id === body.setId) ?? CANONICAL_CONTRASTING_SETS[0]!
  const dummySubmission: InventedMetricSubmission = {
    setId: caseSet.id,
    inventedMetricName: 'Ratio Invariant',
    formulaDescription: 'Invariant ratio coordinating variants across dimensions.',
    selectedDimensionIds: caseSet.dimensions.filter((d) => d.isDeepDimension).map((d) => d.id),
    variantRankings: [...caseSet.variants]
      .sort((a, b) => a.outcomeValue - b.outcomeValue)
      .map((v) => v.id),
    impasseEncountered: true,
    reflectionNotes: 'Productive impasse generated prior to canonical lecture.',
  }
  const evaluation = evaluateContrastingAttempt(caseSet, dummySubmission)
  evaluation.cdts = body.cdtsBaseline
  const deck = generateContrastingFSRSDeck(caseSet, evaluation)
  sendJson(res, 200, {
    ok: true,
    setTitle: caseSet.title,
    cdtsBaseline: deck.cdtsBaseline,
    cardsCount: deck.cards.length,
    cards: deck.cards,
  })
}

/** GET /cognitive/collaborative/scenarios — list canonical CSCL scenarios */
async function getCollaborativeScenarios(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const scenarios = CANONICAL_COLLABORATIVE_SCENARIOS
  sendJson(res, 200, {
    ok: true,
    scenarios: scenarios.map((s) => ({
      id: s.id,
      title: s.title,
      domain: s.domain,
      difficulty: s.difficulty,
      centralDilemma: s.centralDilemma,
      perspectivesCount: s.competingPerspectives.length,
      invariantsCount: s.invariantsForSynthesis.length,
      peerName: s.simulatedPeer.name,
      peerRole: s.simulatedPeer.role,
    })),
  })
}

/** POST /cognitive/collaborative/partner — generate automated Socratic peer response turn */
async function postCollaborativePartner(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, collaborativePartnerBodySchema)
  const scenario =
    CANONICAL_COLLABORATIVE_SCENARIOS.find((s) => s.id === body.scenarioId) ??
    CANONICAL_COLLABORATIVE_SCENARIOS[0]!
  const peerTurn = generateCollaborativePeerTurn(scenario, body.learnerTurnText, body.turnIndex)
  sendJson(res, 200, {
    ok: true,
    scenarioId: scenario.id,
    peerTurn,
  })
}

/** POST /cognitive/collaborative/evaluate — evaluate collaborative discourse (TDI, EED, SCR, CEI) */
async function postCollaborativeEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, collaborativeEvaluateBodySchema)
  const scenario =
    CANONICAL_COLLABORATIVE_SCENARIOS.find((s) => s.id === body.scenarioId) ??
    CANONICAL_COLLABORATIVE_SCENARIOS[0]!
  const evaluation = evaluateCollaborativeDiscourse(scenario, body as DiscourseSubmission)
  sendJson(res, 200, {
    ok: true,
    scenarioTitle: scenario.title,
    evaluation,
  })
}

/** POST /cognitive/collaborative/deck — generate calibrated FSRS-6 review deck */
async function postCollaborativeDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, collaborativeDeckBodySchema)
  const scenario =
    CANONICAL_COLLABORATIVE_SCENARIOS.find((s) => s.id === body.scenarioId) ??
    CANONICAL_COLLABORATIVE_SCENARIOS[0]!
  const dummySubmission: DiscourseSubmission = {
    scenarioId: scenario.id,
    learnerInitialPosition: 'Optimal initial positioning.',
    dialogueTurns: [
      {
        id: 'turn-dummy',
        speaker: 'learner',
        role: 'synthesizer',
        text: 'Because we coordinate both mechanisms, homeostatic plasticity prevents catastrophic saturation.',
        speechAct: 'transactive_synthesis',
        epistemicKeywords: [],
      },
    ],
    jointSynthesis: 'Integrated model coordinating both perspectives.',
    individualTransferAnswer: 'Applied to parallel domain.',
  }
  const evaluation = evaluateCollaborativeDiscourse(scenario, dummySubmission)
  evaluation.cei = body.ceiBaseline
  const deck = generateCollaborativeFSRSDeck(scenario, evaluation)
  sendJson(res, 200, {
    ok: true,
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    ceiBaseline: deck.ceiBaseline,
    cardsCount: deck.cards.length,
    cards: deck.cards,
  })
}

/** GET /cognitive/system-dynamics/scenarios — list canonical system dynamics scenarios */
async function getSystemDynamicsScenarios(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const scenarios = CANONICAL_SYSTEM_DYNAMICS_SCENARIOS
  sendJson(res, 200, {
    ok: true,
    scenarios: scenarios.map((s) => ({
      id: s.id,
      title: s.title,
      domain: s.domain,
      difficulty: s.difficulty,
      stocksCount: s.stocks.length,
      flowsCount: s.flows.length,
      loopsCount: s.canonicalLoops.length,
      archetype: s.canonicalArchetype,
      leveragePointsCount: s.leveragePoints.length,
    })),
  })
}

/** POST /cognitive/system-dynamics/simulate — run deterministic Euler numerical integration */
async function postSystemDynamicsSimulate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req, systemDynamicsSimulateBodySchema)
  const scenario =
    CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.find((s) => s.id === body.scenarioId) ??
    CANONICAL_SYSTEM_DYNAMICS_SCENARIOS[0]!
  const simulationRun = runEulerSimulation(scenario, body.stepsCount, body.dt, {
    flowRateMultipliers: body.policyMultipliers,
  })
  sendJson(res, 200, {
    ok: true,
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    simulationRun,
  })
}

/** POST /cognitive/system-dynamics/evaluate — evaluate systems model (SFDR, FLIA, DAM, ARS, SDI) */
async function postSystemDynamicsEvaluate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req, systemDynamicsEvaluateBodySchema)
  const scenario =
    CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.find((s) => s.id === body.scenarioId) ??
    CANONICAL_SYSTEM_DYNAMICS_SCENARIOS[0]!
  const evaluation = evaluateLearnerModel(scenario, body as LearnerModelHypothesis)
  sendJson(res, 200, {
    ok: true,
    scenarioTitle: scenario.title,
    evaluation,
  })
}

/** POST /cognitive/system-dynamics/deck — generate calibrated FSRS-6 review deck */
async function postSystemDynamicsDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, systemDynamicsDeckBodySchema)
  const scenario =
    CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.find((s) => s.id === body.scenarioId) ??
    CANONICAL_SYSTEM_DYNAMICS_SCENARIOS[0]!
  const mockEvaluation = {
    sfdr: body.sdiBaseline,
    flia: body.sdiBaseline,
    dam: body.sdiBaseline,
    ars: body.sdiBaseline,
    sdi: body.sdiBaseline,
    maturityTier:
      body.sdiBaseline >= 85 ? ('leverage_strategist' as const) : ('dynamic_simulator' as const),
    strengths: ['Headless server synthesized baseline.'],
    systemicFeedback: [],
    archetypeDiscrepancies: [],
    leveragePointAnalysis: 'Direct REST deck synthesis.',
  }
  const deck = generateSystemDynamicsFSRSDeck(scenario, mockEvaluation)
  sendJson(res, 200, {
    ok: true,
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    sdiBaseline: deck.sdi,
    cardsCount: deck.cards.length,
    cards: deck.cards,
  })
}

/** GET /cognitive/model-inquiry/scenarios — list canonical Gedankenexperiment scenarios */
async function getModelInquiryScenarios(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const scenarios = listGedankenScenarios()
  sendJson(res, 200, {
    ok: true,
    scenarios: scenarios.map((s) => ({
      id: s.id,
      title: s.title,
      domain: s.domain,
      historicalOrigin: s.historicalOrigin,
      targetPhenomenon: s.targetPhenomenon,
      folkConception: s.folkConception,
      extremeCasesCount: s.extremeCases.length,
      simulativeStepsCount: s.simulativeSteps.length,
      bridgingCount: s.bridgingAnalogies.length,
      canonicalResolution: s.canonicalResolution.title,
    })),
  })
}

/** POST /cognitive/model-inquiry/perturb — simulate extreme case perturbation */
async function postModelInquiryPerturb(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, modelInquiryPerturbBodySchema)
  const result = perturbExtremeCase(body.scenarioId, body.extremeCaseId, body.parameterLimit)
  sendJson(res, 200, {
    ok: true,
    result,
  })
}

/** POST /cognitive/model-inquiry/simulate — run mental animation sequence */
async function postModelInquirySimulate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, modelInquirySimulateBodySchema)
  const result = simulateMentalAnimation(body.scenarioId, body.stepIds)
  sendJson(res, 200, {
    ok: true,
    result,
  })
}

/** POST /cognitive/model-inquiry/evaluate — evaluate model-based inquiry session */
async function postModelInquiryEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, modelInquiryEvaluateBodySchema)
  const evaluation = evaluateInquirySession(body as InquirySessionInput)
  const deck = generateModelInquiryFsrsDeck(body.scenarioId, evaluation)
  sendJson(res, 200, {
    ok: true,
    evaluation,
    cardsCount: deck.length,
    cards: deck,
  })
}

/** POST /cognitive/model-inquiry/deck — generate calibrated FSRS-6 review deck */
async function postModelInquiryDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, modelInquiryDeckBodySchema)
  const deck = generateModelInquiryFsrsDeck(body.scenarioId)
  sendJson(res, 200, {
    ok: true,
    scenarioId: body.scenarioId,
    cardsCount: deck.length,
    cards: deck,
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
    path: '/cognitive/equilibrium',
    summary: 'Rawls reflective equilibrium + Tetlock calibration (philosophy suites)',
    handler: postEquilibrium,
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
  {
    method: 'GET',
    path: '/cognitive/zpd/scenarios',
    summary: 'list Vygotsky & Feuerstein canonical dynamic assessment scenarios',
    handler: getZpdScenarios,
  },
  {
    method: 'POST',
    path: '/cognitive/zpd/evaluate',
    summary: 'evaluate ZPD actual/potential levels, Budoff LPS, and Feuerstein CMI',
    handler: postZpdEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/zpd/prompt',
    summary: 'retrieve Campione & Brown 5-tier graduated prompt',
    handler: postZpdPrompt,
  },
  {
    method: 'POST',
    path: '/cognitive/zpd/deck',
    summary: 'generate FSRS-6 review deck with stability scaled by learning potential',
    handler: postZpdDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/pf/scenarios',
    summary: 'list Manu Kapur & Tanmay Sinha canonical productive failure scenarios',
    handler: getPFScenarios,
  },
  {
    method: 'POST',
    path: '/cognitive/pf/evaluate',
    summary: 'evaluate intuitive student-generated representation against invariants',
    handler: postPFEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/pf/metrics',
    summary: 'compute quantitative productive failure metrics (PFI, GDI, ISS, CIG, ATS)',
    handler: postPFMetrics,
  },
  {
    method: 'POST',
    path: '/cognitive/pf/deck',
    summary: 'generate calibrated FSRS-6 review deck scaled by productive failure index',
    handler: postPFDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/pi/conceptests',
    summary: 'list canonical ConcepTest suites for peer instruction',
    handler: getPIConceptests,
  },
  {
    method: 'POST',
    path: '/cognitive/pi/dialogue',
    summary: 'retrieve simulated peer deliberation dialogue for ConcepTest suite',
    handler: postPIDialogue,
  },
  {
    method: 'POST',
    path: '/cognitive/pi/evaluate',
    summary: 'evaluate peer instruction trajectory metrics (Hake g, Mazur PI, DCR, ITP)',
    handler: postPIEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/pi/deck',
    summary: 'generate calibrated FSRS-6 review deck for ConcepTest suite',
    handler: postPIDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/inquiry/labs',
    summary: 'list canonical scientific discovery inquiry laboratories',
    handler: getInquiryLabs,
  },
  {
    method: 'POST',
    path: '/cognitive/inquiry/trial',
    summary: 'execute simulation trial and check VOTAT isolation',
    handler: postInquiryTrial,
  },
  {
    method: 'POST',
    path: '/cognitive/inquiry/evaluate',
    summary: 'evaluate SDDS discovery metrics (VOTAT, CBI, ADRI, SDI)',
    handler: postInquiryEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/inquiry/deck',
    summary: 'generate calibrated FSRS-6 review flashcards for inquiry lab',
    handler: postInquiryDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/rt/passages',
    summary: 'list canonical complex text passages for reciprocal teaching',
    handler: getReciprocalPassages,
  },
  {
    method: 'POST',
    path: '/cognitive/rt/peer',
    summary: 'generate responsive Socratic peer dialogic response (Palincsar scaffolding)',
    handler: postReciprocalPeer,
  },
  {
    method: 'POST',
    path: '/cognitive/rt/evaluate',
    summary: 'evaluate reciprocal dialogue session (ICAP, RSBS, EDI, MRR, RDMS)',
    handler: postReciprocalEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/rt/deck',
    summary: 'generate calibrated FSRS-6 review deck for reciprocal dialogue session',
    handler: postReciprocalDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/cer/debates',
    summary: 'list canonical scientific debate cases for claim-evidence-reasoning',
    handler: getScientificDebates,
  },
  {
    method: 'POST',
    path: '/cognitive/cer/counter',
    summary: 'generate adversarial Toulmin counter-argument for chosen claim',
    handler: postCERCounter,
  },
  {
    method: 'POST',
    path: '/cognitive/cer/evaluate',
    summary: 'evaluate CER argument telemetry (CCS, EQI, RDI, TAP level, ERS)',
    handler: postCEREvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/cer/deck',
    summary: 'generate calibrated FSRS-6 review deck for scientific debate',
    handler: postCERDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/anchored/cases',
    summary: 'list canonical anchored macrocontext problem-solving cases (CTGV 1990, 1992)',
    handler: getAnchoredCases,
  },
  {
    method: 'POST',
    path: '/cognitive/anchored/evaluate',
    summary: 'evaluate situated problem-solving solution (SGAI, EIER, CPR, IKRS)',
    handler: postAnchoredEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/anchored/sensitivity',
    summary: 'simulate what-if parameter sensitivity across macrocontext constraints',
    handler: postAnchoredSensitivity,
  },
  {
    method: 'POST',
    path: '/cognitive/anchored/deck',
    summary: 'generate calibrated FSRS-6 review deck for anchored macrocontext',
    handler: postAnchoredDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/contrasting/sets',
    summary:
      'list canonical contrasting case sets for invention and perceptual differentiation (Schwartz & Bransford 1998, 2004)',
    handler: getContrastingSets,
  },
  {
    method: 'POST',
    path: '/cognitive/contrasting/evaluate',
    summary: 'evaluate contrasting cases invention attempt (FDRS, IMI, PFRI, CDTS)',
    handler: postContrastingEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/contrasting/deck',
    summary: 'generate calibrated FSRS-6 review deck for contrasting cases',
    handler: postContrastingDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/collaborative/scenarios',
    summary:
      'list canonical CSCL collaborative dilemmas and scripts (King 1997, 1999; Weinberger & Fischer 2006)',
    handler: getCollaborativeScenarios,
  },
  {
    method: 'POST',
    path: '/cognitive/collaborative/partner',
    summary: 'generate automated Socratic peer response turn',
    handler: postCollaborativePartner,
  },
  {
    method: 'POST',
    path: '/cognitive/collaborative/evaluate',
    summary: 'evaluate collaborative discourse (TDI, EED, SCR, CEI)',
    handler: postCollaborativeEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/collaborative/deck',
    summary: 'generate calibrated FSRS-6 review deck for collaborative dialectics',
    handler: postCollaborativeDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/system-dynamics/scenarios',
    summary:
      'list canonical system dynamics scenarios (Forrester 1968, Sterman 2000, Meadows 2008)',
    handler: getSystemDynamicsScenarios,
  },
  {
    method: 'POST',
    path: '/cognitive/system-dynamics/simulate',
    summary: 'run deterministic Euler numerical integration for system dynamics',
    handler: postSystemDynamicsSimulate,
  },
  {
    method: 'POST',
    path: '/cognitive/system-dynamics/evaluate',
    summary: 'evaluate systems thinking model (SFDR, FLIA, DAM, ARS, SDI)',
    handler: postSystemDynamicsEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/system-dynamics/deck',
    summary: 'generate calibrated FSRS-6 review deck for system dynamics',
    handler: postSystemDynamicsDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/model-inquiry/scenarios',
    summary: 'list canonical Gedankenexperiment scenarios (Clement 2008, Nersessian 2002)',
    handler: getModelInquiryScenarios,
  },
  {
    method: 'POST',
    path: '/cognitive/model-inquiry/perturb',
    summary: 'simulate extreme case boundary perturbation for Gedankenexperimente',
    handler: postModelInquiryPerturb,
  },
  {
    method: 'POST',
    path: '/cognitive/model-inquiry/simulate',
    summary: 'run simulative mental animation step sequence and expose contradictions',
    handler: postModelInquirySimulate,
  },
  {
    method: 'POST',
    path: '/cognitive/model-inquiry/evaluate',
    summary: 'evaluate model-based inquiry session (ECDI, SAF, BAS, MMS, MBRI)',
    handler: postModelInquiryEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/model-inquiry/deck',
    summary: 'generate calibrated FSRS-6 review deck for model-based inquiry',
    handler: postModelInquiryDeck,
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
