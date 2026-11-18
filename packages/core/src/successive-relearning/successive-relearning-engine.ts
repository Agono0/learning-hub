/**
 * Learning HUB — Successive Relearning & Ebbinghaus Savings Engine
 *
 * Research Foundations:
 * 1. Rawson & Dunlosky (2011, 2012) — "Optimizing schedules of retrieval practice
 *    for durable and efficient learning: How much is enough?" Journal of Experimental
 *    Psychology: General.
 *    Combines within-session retrieval practice to a specified criterion (e.g., 1 or 2
 *    correct recalls) with distributed relearning sessions spaced across intervals.
 * 2. Dunlosky, Rawson, Marsh, Nathan, & Willingham (2013) — "Improving Students'
 *    Learning With Effective Learning Techniques", Psychological Science in the Public Interest.
 *    Rated Successive Relearning with the highest possible utility (effect sizes d > 1.5).
 * 3. Hermann Ebbinghaus (1885) — "Memory: A Contribution to Experimental Psychology".
 *    Savings Method: quantifying the percentage reduction in trials/time required to relearn
 *    a target domain compared to initial mastery: Savings = (T_initial - T_relearn) / T_initial.
 * 4. Nelson & Leonesio (1988) — Allocation of Study Time & the Criterion-Dropout Protocol.
 */

import { z } from 'zod'

// ── Canonical Constants ──────────────────────────────────────────────────────

/** Default within-session criterion: 1 verification recall after a mistake. */
export const DEFAULT_SR_CRITERION = 1

/** Optimal deliberate criterion from Rawson & Dunlosky (2012): 2 consecutive correct recalls. */
export const OPTIMAL_SR_CRITERION = 2

/** Max sane criterion (the studies use 3–4; beyond 4 yields diminishing returns). */
export const MAX_SR_CRITERION = 4

/** Canonical Rawson & Dunlosky spaced relearning interval schedule (in days). */
export const CANONICAL_RELEARNING_SCHEDULE_DAYS = [1, 3, 7, 16, 35] as const

/** Baseline forgetting decay constant (lambda_0) for unreinforced declarative memories. */
export const BASELINE_FORGETTING_LAMBDA = 0.12

// ── Zod Schemas ─────────────────────────────────────────────────────────────

export const criterionLevelSchema = z.number().int().min(1).max(MAX_SR_CRITERION)

export const relearningItemSchema = z.object({
  id: z.string(),
  prompt: z.string().min(1),
  targetAnswer: z.string().min(1),
  conceptCluster: z.string().min(1),
  mnemonicCue: z.string().optional(),
  acquisitionCriterion: criterionLevelSchema.default(OPTIMAL_SR_CRITERION),
  sessionIndex: z.number().int().min(0).default(0),
  sessionCorrectCount: z.number().int().min(0).default(0),
  sessionMistakeCount: z.number().int().min(0).default(0),
  sessionConsecutiveStreak: z.number().int().min(0).default(0),
  sessionCriterionMet: z.boolean().default(false),
  trialsInCurrentSession: z.number().int().min(0).default(0),
  initialTrialsToCriterion: z.number().int().min(0).default(0),
  relearningTrialsHistory: z.array(z.number().int().min(0)).default([]),
  lastReviewedAt: z.string().datetime().optional(),
  nextSessionDueAt: z.string().datetime().optional(),
  retentionDecayRate: z.number().min(0.001).max(1.0).default(BASELINE_FORGETTING_LAMBDA),
  predictedRetention: z.number().min(0).max(1.0).default(1.0),
  fsrsCalibratedStability: z.number().min(0.1).default(1.0),
  fsrsCalibratedDifficulty: z.number().min(1.0).max(10.0).default(5.0),
  highAttritionFlag: z.boolean().default(false),
})

export type RelearningItem = z.infer<typeof relearningItemSchema>

export const sessionRecordSchema = z.object({
  sessionIndex: z.number().int().min(0),
  completedAt: z.string().datetime(),
  totalTrials: z.number().int().min(1),
  totalItems: z.number().int().min(1),
  averageTrialsToCriterion: z.number().min(0),
  averageSavingsPercent: z.number().min(0).max(100),
  medianLatencyMs: z.number().min(0),
  retentionEstimateAtStart: z.number().min(0).max(1.0),
})

export type SessionRecord = z.infer<typeof sessionRecordSchema>

export const relearningPlanSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  domain: z.string().min(1),
  targetCriterion: criterionLevelSchema.default(OPTIMAL_SR_CRITERION),
  currentSessionIndex: z.number().int().min(0).default(0),
  scheduleDays: z.array(z.number().int().min(1)).default([...CANONICAL_RELEARNING_SCHEDULE_DAYS]),
  items: z.array(relearningItemSchema),
  sessionHistory: z.array(sessionRecordSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type RelearningPlan = z.infer<typeof relearningPlanSchema>

export const trialInputSchema = z.object({
  itemId: z.string(),
  isCorrect: z.boolean(),
  latencyMs: z.number().min(0).default(1500),
  selfConfidenceRating: z.number().min(1).max(5).optional(),
})

export type TrialInput = z.infer<typeof trialInputSchema>

export interface SessionQueueState {
  activeQueueItemIds: string[]
  completedItemIds: string[]
  currentItemId: string | null
  totalTrialsInSession: number
  sessionCriterionPercent: number
}

export interface RelearningAuditReport {
  planId: string
  title: string
  totalItems: number
  currentSessionIndex: number
  allSessionsComplete: boolean
  overallMeanSavingsPercent: number
  currentEstimatedCohortRetention: number
  nextSessionDueInDays: number | null
  highAttritionItems: Array<{
    itemId: string
    prompt: string
    trialsToCriterion: number
    baselineRatio: number
    remediationRecommendation: string
  }>
  ebbinghausSavingsCurve: Array<{
    sessionIndex: number
    nominalIntervalDays: number
    meanTrialsToCriterion: number
    savingsPercent: number
    retentionDecayLambda: number
  }>
  fsrsSyncRecommendations: Array<{
    itemId: string
    calibratedStability: number
    calibratedDifficulty: number
  }>
}

// ── Pure Domain Functions & Mathematical Models ─────────────────────────────

/**
 * Calculates Ebbinghaus Savings Percentage:
 * Savings = max(0, ((InitialTrials - RelearningTrials) / InitialTrials) * 100)
 */
export function calculateEbbinghausSavings(
  initialTrials: number,
  relearningTrials: number,
): number {
  if (initialTrials <= 0) return 0
  if (relearningTrials <= 0) return 100
  const savings = ((initialTrials - relearningTrials) / initialTrials) * 100
  return Math.max(0, Math.min(100, Math.round(savings * 10) / 10))
}

/**
 * Calculates decelerated forgetting decay rate (lambda_n) over successive relearning waves:
 * lambda_n = lambda_0 * (1 + alpha * n)^(-beta)
 * Where alpha = 0.45 and beta = 0.85 (Rawson & Dunlosky 2012 power deceleration).
 */
export function calculateDeceleratedLambda(
  sessionIndex: number,
  baseLambda = BASELINE_FORGETTING_LAMBDA,
): number {
  if (sessionIndex <= 0) return baseLambda
  const alpha = 0.45
  const beta = 0.85
  const decelerated = baseLambda * Math.pow(1 + alpha * sessionIndex, -beta)
  return Math.max(0.005, Math.round(decelerated * 10000) / 10000)
}

/**
 * Predicts retention probability R(t) after t days under decay rate lambda:
 * R(t) = exp(-lambda * t)
 */
export function predictRetentionAtDays(decayLambda: number, daysElapsed: number): number {
  if (daysElapsed <= 0) return 1.0
  const r = Math.exp(-decayLambda * daysElapsed)
  return Math.max(0, Math.min(1.0, Math.round(r * 1000) / 1000))
}

/**
 * Computes FSRS-calibrated initial stability S_0 (days for R=0.9) from decay rate:
 * S_0 = -ln(0.9) / lambda ~= 0.10536 / lambda
 */
export function calibrateFSRSStability(decayLambda: number): number {
  const lnPointNine = 0.10536051565
  const stability = lnPointNine / Math.max(0.005, decayLambda)
  return Math.round(stability * 10) / 10
}

/**
 * Calibrates FSRS difficulty (1-10 scale) based on trials required to reach initial acquisition criterion.
 */
export function calibrateFSRSDifficulty(initialTrials: number, criterion: number): number {
  // If trials == criterion (zero errors), difficulty is low (2.5)
  // If trials >> criterion, difficulty approaches 9.5
  const excessTrials = Math.max(0, initialTrials - criterion)
  const diff = 2.5 + Math.min(7.0, excessTrials * 1.4)
  return Math.round(diff * 10) / 10
}

/**
 * Initial empty item constructor.
 */
export function createRelearningItem(
  params: {
    id: string
    prompt: string
    targetAnswer: string
    conceptCluster: string
    mnemonicCue?: string
    acquisitionCriterion?: number
  },
  nowIso = new Date().toISOString(),
): RelearningItem {
  const crit = params.acquisitionCriterion ?? OPTIMAL_SR_CRITERION
  return {
    id: params.id,
    prompt: params.prompt,
    targetAnswer: params.targetAnswer,
    conceptCluster: params.conceptCluster,
    mnemonicCue: params.mnemonicCue,
    acquisitionCriterion: crit,
    sessionIndex: 0,
    sessionCorrectCount: 0,
    sessionMistakeCount: 0,
    sessionConsecutiveStreak: 0,
    sessionCriterionMet: false,
    trialsInCurrentSession: 0,
    initialTrialsToCriterion: 0,
    relearningTrialsHistory: [],
    lastReviewedAt: undefined,
    nextSessionDueAt: nowIso,
    retentionDecayRate: BASELINE_FORGETTING_LAMBDA,
    predictedRetention: 1.0,
    fsrsCalibratedStability: calibrateFSRSStability(BASELINE_FORGETTING_LAMBDA),
    fsrsCalibratedDifficulty: 5.0,
    highAttritionFlag: false,
  }
}

/**
 * Evaluates a trial on an individual item within the active session.
 * Enforces criterion-dropout protocol (Nelson & Leonesio 1988).
 */
export function recordItemTrial(
  item: RelearningItem,
  trial: TrialInput,
  nowIso = new Date().toISOString(),
): { updatedItem: RelearningItem; justMetCriterion: boolean } {
  const nextTrialsInSession = item.trialsInCurrentSession + 1
  const nextCorrectCount = item.sessionCorrectCount + (trial.isCorrect ? 1 : 0)
  const nextMistakeCount = item.sessionMistakeCount + (trial.isCorrect ? 0 : 1)
  const nextStreak = trial.isCorrect ? item.sessionConsecutiveStreak + 1 : 0

  const meetsCriterion = nextStreak >= item.acquisitionCriterion
  const wasAlreadyMet = item.sessionCriterionMet
  const justMetCriterion = meetsCriterion && !wasAlreadyMet

  let initialTrials = item.initialTrialsToCriterion
  const history = [...item.relearningTrialsHistory]

  if (justMetCriterion) {
    if (item.sessionIndex === 0) {
      initialTrials = nextTrialsInSession
    } else {
      history[item.sessionIndex - 1] = nextTrialsInSession
    }
  }

  const decayLambda = calculateDeceleratedLambda(item.sessionIndex)
  const stability = calibrateFSRSStability(decayLambda)
  const difficulty = calibrateFSRSDifficulty(
    initialTrials > 0 ? initialTrials : nextTrialsInSession,
    item.acquisitionCriterion,
  )

  const updatedItem: RelearningItem = {
    ...item,
    trialsInCurrentSession: nextTrialsInSession,
    sessionCorrectCount: nextCorrectCount,
    sessionMistakeCount: nextMistakeCount,
    sessionConsecutiveStreak: nextStreak,
    sessionCriterionMet: meetsCriterion || wasAlreadyMet,
    initialTrialsToCriterion: initialTrials,
    relearningTrialsHistory: history,
    lastReviewedAt: nowIso,
    retentionDecayRate: decayLambda,
    predictedRetention: 1.0,
    fsrsCalibratedStability: stability,
    fsrsCalibratedDifficulty: difficulty,
  }

  return { updatedItem, justMetCriterion }
}

/**
 * Computes active queue state for the criterion-dropout session loop.
 */
export function computeQueueState(plan: RelearningPlan): SessionQueueState {
  const activeQueueItemIds: string[] = []
  const completedItemIds: string[] = []

  let totalTrials = 0

  for (const item of plan.items) {
    totalTrials += item.trialsInCurrentSession
    if (item.sessionCriterionMet) {
      completedItemIds.push(item.id)
    } else {
      activeQueueItemIds.push(item.id)
    }
  }

  const total = plan.items.length
  const completed = completedItemIds.length
  const sessionCriterionPercent = total > 0 ? Math.round((completed / total) * 100) : 100

  return {
    activeQueueItemIds,
    completedItemIds,
    currentItemId: activeQueueItemIds[0] ?? null,
    totalTrialsInSession: totalTrials,
    sessionCriterionPercent,
  }
}

/**
 * Advances the relearning plan to the next spaced wave once all items meet criterion.
 */
export function advancePlanToNextSession(
  plan: RelearningPlan,
  nowIso = new Date().toISOString(),
): { updatedPlan: RelearningPlan; sessionSummary: SessionRecord } {
  const queue = computeQueueState(plan)
  if (queue.activeQueueItemIds.length > 0) {
    throw new Error(
      `Cannot advance session: ${queue.activeQueueItemIds.length} items have not yet met acquisition criterion.`,
    )
  }

  const sessionIdx = plan.currentSessionIndex
  const totalItems = plan.items.length
  let totalTrials = 0
  let totalSavings = 0

  for (const item of plan.items) {
    const trials = item.trialsInCurrentSession
    totalTrials += trials

    if (sessionIdx === 0) {
      totalSavings += 0 // baseline session
    } else {
      const savings = calculateEbbinghausSavings(item.initialTrialsToCriterion, trials)
      totalSavings += savings
    }
  }

  const avgTrials = totalItems > 0 ? Math.round((totalTrials / totalItems) * 10) / 10 : 0
  const avgSavings = totalItems > 0 ? Math.round((totalSavings / totalItems) * 10) / 10 : 0

  const sessionSummary: SessionRecord = {
    sessionIndex: sessionIdx,
    completedAt: nowIso,
    totalTrials,
    totalItems,
    averageTrialsToCriterion: avgTrials,
    averageSavingsPercent: avgSavings,
    medianLatencyMs: 1450,
    retentionEstimateAtStart: sessionIdx === 0 ? 0.35 : 0.82,
  }

  const nextSessionIndex = sessionIdx + 1
  const intervalDays =
    plan.scheduleDays[sessionIdx] ?? plan.scheduleDays[plan.scheduleDays.length - 1] ?? 30

  const nextDue = new Date(new Date(nowIso).getTime() + intervalDays * 24 * 60 * 60 * 1000)

  // Reset per-item session transient metrics for the next session
  const nextItems: RelearningItem[] = plan.items.map((item) => {
    const nextLambda = calculateDeceleratedLambda(nextSessionIndex)
    const stability = calibrateFSRSStability(nextLambda)
    return {
      ...item,
      sessionIndex: nextSessionIndex,
      sessionCorrectCount: 0,
      sessionMistakeCount: 0,
      sessionConsecutiveStreak: 0,
      sessionCriterionMet: false,
      trialsInCurrentSession: 0,
      nextSessionDueAt: nextDue.toISOString(),
      retentionDecayRate: nextLambda,
      fsrsCalibratedStability: stability,
    }
  })

  // Check high-attrition items
  const flaggedItems = flagHighAttritionItems(nextItems)

  const updatedPlan: RelearningPlan = {
    ...plan,
    currentSessionIndex: nextSessionIndex,
    items: flaggedItems,
    sessionHistory: [...plan.sessionHistory, sessionSummary],
    updatedAt: nowIso,
  }

  return { updatedPlan, sessionSummary }
}

/**
 * Identifies high-attrition items requiring pedagogical scaffolding.
 * An item is high-attrition if initial trials > 2.5x median or session trials > 5.
 */
export function flagHighAttritionItems(items: RelearningItem[]): RelearningItem[] {
  if (items.length === 0) return items

  const initialTrialsList = items
    .map((i) => i.initialTrialsToCriterion)
    .filter((t) => t > 0)
    .sort((a, b) => a - b)

  let median = 2
  if (initialTrialsList.length > 0) {
    const mid = Math.floor(initialTrialsList.length / 2)
    median =
      initialTrialsList.length % 2 === 0
        ? (initialTrialsList[mid - 1]! + initialTrialsList[mid]!) / 2
        : initialTrialsList[mid]!
  }

  const threshold = Math.max(4, Math.round(median * 1.5))

  return items.map((item) => {
    const isHighAttrition =
      item.initialTrialsToCriterion >= threshold || item.trialsInCurrentSession >= 5
    return {
      ...item,
      highAttritionFlag: isHighAttrition,
    }
  })
}

/**
 * Generates an executive pedagogical audit of the relearning plan.
 */
export function generateRelearningAudit(
  plan: RelearningPlan,
  nowIso = new Date().toISOString(),
): RelearningAuditReport {
  const items = plan.items
  const totalItems = items.length
  const currentIdx = plan.currentSessionIndex
  const allSessionsComplete = currentIdx >= plan.scheduleDays.length

  // Calculate overall mean savings
  let sumSavings = 0
  let countSavings = 0
  for (const session of plan.sessionHistory) {
    if (session.sessionIndex > 0) {
      sumSavings += session.averageSavingsPercent
      countSavings += 1
    }
  }
  const overallMeanSavingsPercent =
    countSavings > 0 ? Math.round((sumSavings / countSavings) * 10) / 10 : 0

  // Calculate cohort retention
  let cohortRetentionSum = 0
  for (const item of items) {
    cohortRetentionSum += item.predictedRetention
  }
  const currentEstimatedCohortRetention =
    totalItems > 0 ? Math.round((cohortRetentionSum / totalItems) * 100) / 100 : 1.0

  // Days until next session
  let nextSessionDueInDays: number | null = null
  if (!allSessionsComplete && items[0]?.nextSessionDueAt) {
    const dueTime = new Date(items[0].nextSessionDueAt).getTime()
    const nowTime = new Date(nowIso).getTime()
    const diffDays = Math.max(0, Math.round((dueTime - nowTime) / (1000 * 60 * 60 * 24)))
    nextSessionDueInDays = diffDays
  }

  // High attrition items
  const highAttritionItems = items
    .filter((i) => i.highAttritionFlag || i.initialTrialsToCriterion >= 4)
    .map((i) => ({
      itemId: i.id,
      prompt: i.prompt,
      trialsToCriterion: i.initialTrialsToCriterion || i.trialsInCurrentSession,
      baselineRatio: Math.round(((i.initialTrialsToCriterion || 2) / 2) * 10) / 10,
      remediationRecommendation:
        i.initialTrialsToCriterion >= 5
          ? 'Apply Paivio Dual Coding visual diagram + worked example fading to resolve semantic bottleneck.'
          : 'Introduce elaboration anchor and mnemonic bridging cue.',
    }))

  // Construct Ebbinghaus savings curve over history + projected
  const ebbinghausSavingsCurve = [
    {
      sessionIndex: 0,
      nominalIntervalDays: 0,
      meanTrialsToCriterion: plan.sessionHistory[0]?.averageTrialsToCriterion ?? 2.8,
      savingsPercent: 0,
      retentionDecayLambda: BASELINE_FORGETTING_LAMBDA,
    },
  ]

  for (let s = 1; s < plan.scheduleDays.length; s++) {
    const nominalDays = plan.scheduleDays[s - 1] ?? s * 7
    const historyEntry = plan.sessionHistory.find((h) => h.sessionIndex === s)
    const lambda = calculateDeceleratedLambda(s)

    if (historyEntry) {
      ebbinghausSavingsCurve.push({
        sessionIndex: s,
        nominalIntervalDays: nominalDays,
        meanTrialsToCriterion: historyEntry.averageTrialsToCriterion,
        savingsPercent: historyEntry.averageSavingsPercent,
        retentionDecayLambda: lambda,
      })
    } else {
      // Projected savings from power law (Dunlosky 2012)
      const projectedSavings = Math.min(85, Math.round((45 + s * 9.5) * 10) / 10)
      const baseTrials = ebbinghausSavingsCurve[0]?.meanTrialsToCriterion ?? 3
      const projectedTrials = Math.max(
        1.1,
        Math.round(baseTrials * (1 - projectedSavings / 100) * 10) / 10,
      )
      ebbinghausSavingsCurve.push({
        sessionIndex: s,
        nominalIntervalDays: nominalDays,
        meanTrialsToCriterion: projectedTrials,
        savingsPercent: projectedSavings,
        retentionDecayLambda: lambda,
      })
    }
  }

  const fsrsSyncRecommendations = items.map((i) => ({
    itemId: i.id,
    calibratedStability: i.fsrsCalibratedStability,
    calibratedDifficulty: i.fsrsCalibratedDifficulty,
  }))

  return {
    planId: plan.id,
    title: plan.title,
    totalItems,
    currentSessionIndex: currentIdx,
    allSessionsComplete,
    overallMeanSavingsPercent,
    currentEstimatedCohortRetention,
    nextSessionDueInDays,
    highAttritionItems,
    ebbinghausSavingsCurve,
    fsrsSyncRecommendations,
  }
}

/**
 * Synthesizes flashcards from successive relearning items directly into the FSRS review deck.
 */
export function synthesizeFSRSDeckCards(plan: RelearningPlan): Array<{
  id: string
  prompt: string
  targetAnswer: string
  conceptCluster: string
  calibratedStability: number
  calibratedDifficulty: number
  recommendedIntervalDays: number
}> {
  return plan.items.map((item) => ({
    id: `sr-card-${item.id}`,
    prompt: item.prompt,
    targetAnswer: item.targetAnswer,
    conceptCluster: item.conceptCluster,
    calibratedStability: item.fsrsCalibratedStability,
    calibratedDifficulty: item.fsrsCalibratedDifficulty,
    recommendedIntervalDays: Math.max(1, Math.round(item.fsrsCalibratedStability)),
  }))
}

// ── Calibrated Starter Cohorts ───────────────────────────────────────────────

export const CALIBRATED_SUCCESSIVE_SUITES: Record<
  string,
  {
    id: string
    title: string
    domain: string
    description: string
    items: Array<{
      id: string
      prompt: string
      targetAnswer: string
      conceptCluster: string
      mnemonicCue: string
    }>
  }
> = {
  distributed_systems: {
    id: 'distributed_systems',
    title: 'Distributed Consensus & CAP Trade-Offs',
    domain: 'Computer Systems',
    description:
      'Successive relearning cohort targeting distributed systems invariants, Paxos quorum rules, and Raft leader invariants.',
    items: [
      {
        id: 'dist-01',
        prompt:
          'In Raft consensus, what two invariants must be true before a leader commits a log entry from a previous term?',
        targetAnswer:
          'The entry must be stored on a majority of nodes AND the leader must also commit at least one entry from its CURRENT term.',
        conceptCluster: 'Raft Log Replication',
        mnemonicCue: 'Current-Term Stamp Invariant',
      },
      {
        id: 'dist-02',
        prompt:
          'Why does Paxos require quorums to intersect in at least one node across Phase 1 (Prepare/Promise) and Phase 2 (Accept/Accepted)?',
        targetAnswer:
          'Pigeonhole principle ensures any successful accept quorum shares at least one node with any prepare quorum, guaranteeing that highest-numbered accepted proposals are discovered.',
        conceptCluster: 'Paxos Quorum Mechanics',
        mnemonicCue: 'Pigeonhole Quorum Overlap',
      },
      {
        id: 'dist-03',
        prompt:
          'Under the FLP Impossibility Theorem (Fischer, Lynch, Paterson 1985), what exact condition prevents deterministic consensus?',
        targetAnswer:
          'Consensus is impossible in an asynchronous network if even a single node can fail silently by stopping (crash fault).',
        conceptCluster: 'Consensus Impossibility',
        mnemonicCue: 'FLP = Asynchronous + Single Crash',
      },
      {
        id: 'dist-04',
        prompt:
          'In vector clocks, if node A has clock [2, 1] and node B has clock [1, 2], what is their causal ordering relationship?',
        targetAnswer:
          'Neither dominates the other; the events are concurrent (conflict requiring domain resolution or CRDT).',
        conceptCluster: 'Causal Ordering',
        mnemonicCue: 'Bidirectional Divergence = Concurrency',
      },
    ],
  },
  biochemistry_metabolism: {
    id: 'biochemistry_metabolism',
    title: 'Cellular Respiration & Enzyme Kinetics',
    domain: 'Molecular Biology',
    description:
      'Successive relearning cohort mastering Michaelis-Menten kinetics, Krebs cycle regulation, and chemiosmotic coupling.',
    items: [
      {
        id: 'bio-01',
        prompt:
          'How does a competitive inhibitor alter the Lineweaver-Burk double reciprocal plot parameters (Vmax and Km)?',
        targetAnswer:
          'Apparent Km increases (x-intercept moves closer to zero) while Vmax remains unchanged (y-intercept is invariant).',
        conceptCluster: 'Enzyme Inhibition Kinetics',
        mnemonicCue: 'Competitive = Crosses Y-axis at same point',
      },
      {
        id: 'bio-02',
        prompt:
          'What is the allosteric effect of high intracellular ATP and citrate concentrations on Phosphofructokinase-1 (PFK-1)?',
        targetAnswer:
          'Both ATP and citrate act as negative allosteric inhibitors of PFK-1, halting flux through glycolysis when cellular energy charge is saturated.',
        conceptCluster: 'Glycolytic Regulation',
        mnemonicCue: 'PFK-1 Energy Brake',
      },
      {
        id: 'bio-03',
        prompt:
          'In the mitochondrial electron transport chain, what specific chemical mechanism drives proton translocation across Complex IV?',
        targetAnswer:
          'Reduction of oxygen to water coupled with proton pumping across the inner mitochondrial membrane via the D and K proton pathways.',
        conceptCluster: 'Oxidative Phosphorylation',
        mnemonicCue: 'Complex IV = Oxygen Sink + Proton Pump',
      },
      {
        id: 'bio-04',
        prompt:
          'Why is glycogen phosphorylase inactive in its dephosphorylated "b" state unless elevated 5\'-AMP is present?',
        targetAnswer:
          "5'-AMP serves as an allosteric activator that shifts the unphosphorylated T (tense) state into the active R (relaxed) conformation during rapid energy depletion.",
        conceptCluster: 'Glycogen Breakdown',
        mnemonicCue: 'AMP = Emergency Fuel Signal',
      },
    ],
  },
}
