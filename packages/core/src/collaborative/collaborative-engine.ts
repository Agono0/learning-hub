/**
 * Collaborative Scripts & Transactive Discourse Studio Engine
 *
 * Grounded in:
 * - Alison King (1997, 1999) "ASK to THINK - TEL WHY": Guided Reciprocal Peer Questioning
 * - Weinberger & Fischer (2006) Computer-Supported Collaborative Learning (CSCL) Scripts
 * - Berkowitz & Gibbs (1983) Transactive Discourse Analysis in Dialectical Dyads
 * - Teasley (1997) "Talking About Reasoning": High-Level Collaboration & Cognitive Change
 * - Fischer et al. (2013) The Script Theory of Guidance in CSCL
 *
 * Quantitative Telemetry:
 * - TDI: Transactive Discourse Index (proportion of turns operating on peer reasoning)
 * - EED: Epistemic Elaboration Depth (mechanistic/causal connective density)
 * - SCR: Script Compliance Rigor (alignment with 4-phase collaborative macro-script)
 * - CEI: Composite Collaborative Epistemic Index = 0.40 * TDI + 0.35 * EED + 0.25 * SCR
 * - 4 Maturity Tiers: parallel_individualist, cumulative_agreer, transactive_critic, dialectical_synthesizer
 */

import { z } from 'zod'

// TD-05: the canonical collaborative scenario corpus is CONTENT, not logic — it
// lives in ./content.ts so engine diffs stay about algorithms. Re-exported so
// every existing import path keeps working (the barrel does `export * from` this
// file).
export { CANONICAL_COLLABORATIVE_SCENARIOS } from './content'

// ── Enumerations & Schemas ───────────────────────────────────────────────────

export const TransactiveActEnum = z.enum([
  'transactive_critique',
  'transactive_extension',
  'transactive_synthesis',
  'transactive_justification',
  'non_transactive',
])
export type TransactiveAct = z.infer<typeof TransactiveActEnum>

export const CollaborativeRoleEnum = z.enum(['proposer', 'questioner', 'synthesizer', 'challenger'])
export type CollaborativeRole = z.infer<typeof CollaborativeRoleEnum>

export const KingStemCategoryEnum = z.enum(['comprehension', 'connection', 'strategic'])
export type KingStemCategory = z.infer<typeof KingStemCategoryEnum>

export const KingQuestionStemSchema = z.object({
  id: z.string(),
  category: KingStemCategoryEnum,
  stem: z.string(),
  purpose: z.string(),
})
export type KingQuestionStem = z.infer<typeof KingQuestionStemSchema>

export const CollaborativeTurnSchema = z.object({
  id: z.string(),
  speaker: z.enum(['learner', 'peer_partner', 'synthesizer_agent']),
  role: CollaborativeRoleEnum,
  text: z.string(),
  speechAct: TransactiveActEnum,
  targetTurnId: z.string().optional(),
  epistemicKeywords: z.array(z.string()).default([]),
})
export type CollaborativeTurn = z.infer<typeof CollaborativeTurnSchema>

export const CompetingPerspectiveSchema = z.object({
  id: z.string(),
  label: z.string(),
  advocate: z.string(),
  corePremise: z.string(),
  primaryEvidence: z.string(),
  vulnerability: z.string(),
})
export type CompetingPerspective = z.infer<typeof CompetingPerspectiveSchema>

export const InvariantReconciliationSchema = z.object({
  id: z.string(),
  name: z.string(),
  reconciliation: z.string(),
})
export type InvariantReconciliation = z.infer<typeof InvariantReconciliationSchema>

export const SimulatedPeerProfileSchema = z.object({
  name: z.string(),
  role: CollaborativeRoleEnum,
  initialStance: z.string(),
  epistemicStyle: z.string(),
  initialArgument: z.string(),
  counterArguments: z.array(z.string()),
})
export type SimulatedPeerProfile = z.infer<typeof SimulatedPeerProfileSchema>

export const CollaborativeScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain: z.string(),
  difficulty: z.enum(['introductory', 'intermediate', 'advanced']),
  centralDilemma: z.string(),
  competingPerspectives: z.array(CompetingPerspectiveSchema),
  invariantsForSynthesis: z.array(InvariantReconciliationSchema),
  guidedKingStems: z.array(KingQuestionStemSchema),
  simulatedPeer: SimulatedPeerProfileSchema,
})
export type CollaborativeScenario = z.infer<typeof CollaborativeScenarioSchema>

export const DiscourseSubmissionSchema = z.object({
  scenarioId: z.string(),
  learnerInitialPosition: z.string(),
  dialogueTurns: z.array(CollaborativeTurnSchema),
  jointSynthesis: z.string(),
  individualTransferAnswer: z.string(),
})
export type DiscourseSubmission = z.infer<typeof DiscourseSubmissionSchema>

export const CollaborativeEvaluationSchema = z.object({
  tdi: z.number().min(0).max(100),
  eed: z.number().min(0).max(100),
  scr: z.number().min(0).max(100),
  cei: z.number().min(0).max(100),
  maturityBand: z.enum([
    'parallel_individualist',
    'cumulative_agreer',
    'transactive_critic',
    'dialectical_synthesizer',
  ]),
  transactiveCounts: z.record(z.string(), z.number()),
  synthesizedInvariantsIdentified: z.array(z.string()),
  strengths: z.array(z.string()),
  vulnerabilities: z.array(z.string()),
  pedagogicalFeedback: z.array(z.string()),
})
export type CollaborativeEvaluation = z.infer<typeof CollaborativeEvaluationSchema>

export const CalibratedCollaborativeCardSchema = z.object({
  id: z.string(),
  cardType: z.enum(['transactive_warrant', 'counter_rebuttal', 'joint_invariant', 'far_transfer']),
  front: z.string(),
  back: z.string(),
  scenarioTitle: z.string(),
  fsrsParameters: z.object({
    stability: z.number(),
    difficulty: z.number(),
  }),
})
export type CalibratedCollaborativeCard = z.infer<typeof CalibratedCollaborativeCardSchema>

export const CalibratedCollaborativeDeckSchema = z.object({
  scenarioId: z.string(),
  scenarioTitle: z.string(),
  ceiBaseline: z.number(),
  cards: z.array(CalibratedCollaborativeCardSchema),
})
export type CalibratedCollaborativeDeck = z.infer<typeof CalibratedCollaborativeDeckSchema>

// ── Canonical Collaborative Scenarios ────────────────────────────────────────

// Scenario corpus moved verbatim to ./content.ts (TD-05 — content, not logic);
// re-exported at the top of this file so import paths are unchanged.

// ── Transactive Evaluation & Feedback Engine ─────────────────────────────────

const TRANSACTIVE_KEYWORDS = [
  'because you stated',
  'building upon your',
  'contrary to what you proposed',
  'if we integrate',
  'however, your model overlooks',
  'to resolve this tension',
  'your point about',
  'whereas you argued',
  'to reconcile',
  'under the condition that',
  'as an extension of',
]

/**
 * Evaluates a learner's collaborative discourse dialogue against CSCL & Transactive Discourse principles.
 */
export function evaluateCollaborativeDiscourse(
  scenario: CollaborativeScenario,
  submission: DiscourseSubmission,
): CollaborativeEvaluation {
  const pedagogicalFeedback: string[] = []
  const strengths: string[] = []
  const vulnerabilities: string[] = []

  const learnerTurns = submission.dialogueTurns.filter((t) => t.speaker === 'learner')
  const totalLearnerTurns = Math.max(learnerTurns.length, 1)

  // 1. Transactive Discourse Index (TDI)
  const transactiveCounts: Record<string, number> = {
    transactive_critique: 0,
    transactive_extension: 0,
    transactive_synthesis: 0,
    transactive_justification: 0,
    non_transactive: 0,
  }

  let weightedTransactiveScore = 0

  for (const turn of learnerTurns) {
    const textLower = turn.text.toLowerCase()
    let act = turn.speechAct

    // Auto-detect transactivity if not explicitly tagged
    const hasTransactiveStem = TRANSACTIVE_KEYWORDS.some((kw) => textLower.includes(kw))
    if (act === 'non_transactive' && hasTransactiveStem) {
      if (textLower.includes('however') || textLower.includes('contrary')) {
        act = 'transactive_critique'
      } else if (textLower.includes('reconcile') || textLower.includes('integrate')) {
        act = 'transactive_synthesis'
      } else {
        act = 'transactive_extension'
      }
    }

    transactiveCounts[act] = (transactiveCounts[act] ?? 0) + 1

    if (act === 'transactive_synthesis') weightedTransactiveScore += 100
    else if (act === 'transactive_critique') weightedTransactiveScore += 85
    else if (act === 'transactive_extension') weightedTransactiveScore += 80
    else if (act === 'transactive_justification') weightedTransactiveScore += 70
    else weightedTransactiveScore += 20 // non-transactive parallel talk
  }

  const tdi = Math.min(100, Math.round(weightedTransactiveScore / totalLearnerTurns))

  const transactiveTurnRatio =
    (totalLearnerTurns - (transactiveCounts.non_transactive ?? 0)) / totalLearnerTurns

  if (transactiveTurnRatio >= 0.75) {
    strengths.push(
      'High Transactivity (Berkowitz & Gibbs 1983): Demonstrated strong cognitive operations on partner’s reasoning rather than isolated monologues.',
    )
  } else {
    vulnerabilities.push(
      'Cumulative or Parallel Talk: Several turns presented standalone ideas without explicitly operating on or challenging peer premises.',
    )
  }

  // 2. Epistemic Elaboration Depth (EED)
  const causalConnectives = [
    'because',
    'therefore',
    'consequently',
    'leads to',
    'due to',
    'inhibits',
    'activates',
    'modulates',
    'mechanistically',
    'induces',
    'prevents',
    'scales with',
    'reconcil',
    'triggers',
    'depends on',
    'regulat',
    'integrat',
    'maintains',
  ]

  const allLearnerText = [
    submission.learnerInitialPosition,
    ...learnerTurns.map((t) => t.text),
    submission.jointSynthesis,
  ]
    .join(' ')
    .toLowerCase()

  let causalHits = 0
  for (const conn of causalConnectives) {
    if (allLearnerText.includes(conn)) causalHits++
  }

  // Check synthesis depth
  const synthesisWords = submission.jointSynthesis.trim().split(/\s+/).filter(Boolean).length
  const synthesisDepthScore = Math.min(40, (synthesisWords / 25) * 40)

  const causalDepthScore = Math.min(60, (causalHits / 4) * 60)
  const eed = Math.min(100, Math.round(causalDepthScore + synthesisDepthScore))

  if (eed >= 75) {
    strengths.push(
      'Rich Epistemic Elaboration (Weinberger & Fischer 2006): Employed causal connectives and mechanistic warrants to structure discourse.',
    )
  } else {
    vulnerabilities.push(
      'Superficial Epistemic Justification: Assertions lacked deep causal mechanisms; incorporate more connective explanations.',
    )
  }

  // 3. Script Compliance Rigor (SCR)
  // Check 4-phase completion: Initial Position -> Dialogue Turns >= 2 -> Joint Synthesis -> Individual Transfer
  let scrPoints = 0
  if (submission.learnerInitialPosition.trim().length >= 25) scrPoints += 25
  if (learnerTurns.length >= 2) scrPoints += 25
  if (submission.jointSynthesis.trim().length >= 40) scrPoints += 25
  if (submission.individualTransferAnswer.trim().length >= 30) scrPoints += 25
  const scr = scrPoints

  if (scr === 100) {
    strengths.push(
      'Flawless Script Adherence (Fischer et al. 2013): Fully navigated all 4 collaborative phases from individual framing to joint synthesis.',
    )
  } else {
    vulnerabilities.push(
      'Script Incompletion: Skipped or produced minimal responses in one of the required collaborative stages.',
    )
  }

  // 4. Invariant Identification in Synthesis
  const synthesizedInvariantsIdentified: string[] = []
  const synthesisTextLower = submission.jointSynthesis.toLowerCase()

  for (const inv of scenario.invariantsForSynthesis) {
    const invKeywords = inv.name
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
    const matched = invKeywords.some((k) => synthesisTextLower.includes(k))
    if (
      matched ||
      synthesisTextLower.includes('reconcil') ||
      synthesisTextLower.includes('hybrid')
    ) {
      synthesizedInvariantsIdentified.push(inv.name)
    }
  }

  // 5. Composite Collaborative Epistemic Index (CEI)
  // CEI = 0.40 * TDI + 0.35 * EED + 0.25 * SCR
  const cei = Math.min(100, Math.round(tdi * 0.4 + eed * 0.35 + scr * 0.25))

  // 6. Maturity Tiers
  let maturityBand: CollaborativeEvaluation['maturityBand'] = 'parallel_individualist'
  if (cei >= 85 && synthesizedInvariantsIdentified.length > 0) {
    maturityBand = 'dialectical_synthesizer'
  } else if (cei >= 70) {
    maturityBand = 'transactive_critic'
  } else if (cei >= 50) {
    maturityBand = 'cumulative_agreer'
  }

  // Pedagogical Guidance
  if (maturityBand === 'dialectical_synthesizer') {
    pedagogicalFeedback.push(
      'Exemplary Transactive Synthesis (King 1999, Teasley 1997): You successfully operated on your peer’s premises, identified reciprocal constraints, and formulated a shared invariant model.',
    )
  } else if (maturityBand === 'transactive_critic') {
    pedagogicalFeedback.push(
      'Strong Critical Transactivity: You effectively critiqued and differentiated your peer’s assumptions. In your synthesis, focus on bridging both perspectives into a unified theoretical architecture.',
    )
  } else if (maturityBand === 'cumulative_agreer') {
    pedagogicalFeedback.push(
      'Cumulative Discourse Pattern (Mercer 1996): High consensus but low transactive tension. Use Alison King’s connection stems to challenge peer premises rather than merely validating them.',
    )
  } else {
    pedagogicalFeedback.push(
      'Parallel Individualism: Focus on referencing your partner’s specific assertions ("Because you argued X, consider Y") before advancing new claims.',
    )
  }

  return {
    tdi,
    eed,
    scr,
    cei,
    maturityBand,
    transactiveCounts,
    synthesizedInvariantsIdentified,
    strengths,
    vulnerabilities,
    pedagogicalFeedback,
  }
}

/**
 * Generates an automated, Socratic peer response turn based on the simulated peer profile and current discourse state.
 */
export function generateCollaborativePeerTurn(
  scenario: CollaborativeScenario,
  learnerTurnText: string,
  turnIndex: number,
): CollaborativeTurn {
  const peer = scenario.simulatedPeer
  const counterArg =
    peer.counterArguments[turnIndex % peer.counterArguments.length] ?? peer.counterArguments[0]!

  let responseText = ''
  let speechAct: TransactiveAct = 'transactive_critique'

  if (turnIndex === 0) {
    responseText = `${peer.initialArgument} Building upon that: how does your initial proposition address the vulnerability in ${scenario.competingPerspectives[0]?.label ?? 'your perspective'}?`
    speechAct = 'transactive_critique'
  } else {
    responseText = `I hear your reasoning, but consider this boundary condition: ${counterArg} How can we reconcile this without invalidating your primary premise?`
    speechAct = 'transactive_extension'
  }

  return {
    id: `turn-peer-${scenario.id}-${Date.now()}`,
    speaker: 'peer_partner',
    role: peer.role,
    text: responseText,
    speechAct,
    epistemicKeywords: ['boundary_condition', 'counter_evidence', 'reconciliation'],
  }
}

/**
 * Generates calibrated FSRS-6 spaced repetition cards derived from collaborative discourse insights.
 */
export function generateCollaborativeFSRSDeck(
  scenario: CollaborativeScenario,
  evaluation: CollaborativeEvaluation,
): CalibratedCollaborativeDeck {
  const ceiFactor = evaluation.cei / 100
  const baseStability = parseFloat((4.0 + ceiFactor * 4.0).toFixed(1)) // 4.0d to 8.0d
  const baseDifficulty = parseFloat((6.5 - ceiFactor * 2.5).toFixed(1)) // 6.5 down to 4.0

  const cards: CalibratedCollaborativeCard[] = [
    {
      id: `collab-card-${scenario.id}-1`,
      cardType: 'transactive_warrant',
      front: `[Collaborative Dialectics: ${scenario.title}]\nWhat is the primary vulnerability in the "${scenario.competingPerspectives[0]?.label}" stance, and how did your transactive critique expose it?`,
      back: `Core Vulnerability:\n${scenario.competingPerspectives[0]?.vulnerability}\n\nTransactive Counter-Evidence:\n${scenario.competingPerspectives[1]?.primaryEvidence}`,
      scenarioTitle: scenario.title,
      fsrsParameters: {
        stability: baseStability,
        difficulty: baseDifficulty,
      },
    },
    {
      id: `collab-card-${scenario.id}-2`,
      cardType: 'counter_rebuttal',
      front: `[Transactive Defense: ${scenario.title}]\nWhen your partner argued "${scenario.simulatedPeer.counterArguments[0]}", what mechanistic warrant preserves system stability?`,
      back: `Mechanistic Warrant:\n${scenario.invariantsForSynthesis[0]?.reconciliation ?? 'Coordinated homeostatic regulation prevents runaway instability.'}`,
      scenarioTitle: scenario.title,
      fsrsParameters: {
        stability: baseStability,
        difficulty: baseDifficulty,
      },
    },
    {
      id: `collab-card-${scenario.id}-3`,
      cardType: 'joint_invariant',
      front: `[Joint Dialectical Synthesis: ${scenario.title}]\nWhat invariant principle reconciles both competing perspectives in ${scenario.title}?`,
      back: `Invariant Synthesis:\n${scenario.invariantsForSynthesis.map((inv) => `• ${inv.name}: ${inv.reconciliation}`).join('\n\n')}`,
      scenarioTitle: scenario.title,
      fsrsParameters: {
        stability: parseFloat((baseStability * 1.15).toFixed(1)),
        difficulty: parseFloat((baseDifficulty * 0.9).toFixed(1)),
      },
    },
    {
      id: `collab-card-${scenario.id}-4`,
      cardType: 'far_transfer',
      front: `[Far Transfer Application: ${scenario.title}]\nHow does the synthesized invariant from ${scenario.title} apply when scaling to unexpected extreme boundary conditions?`,
      back: `Transfer Rule:\nCoordinating the fast local response with slow global homeostatic thresholds preserves dynamic range and prevents catastrophe across any complex adaptive network.`,
      scenarioTitle: scenario.title,
      fsrsParameters: {
        stability: baseStability,
        difficulty: baseDifficulty,
      },
    },
  ]

  return {
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    ceiBaseline: evaluation.cei,
    cards,
  }
}

// ── Route-level input schemas (TD-02) ──────────────────────────────────────

export const collaborativePartnerInputSchema = z.object({
  scenarioId: z.string(),
  learnerTurnText: z.string().min(1).default(''),
  turnIndex: z.number().int().nonnegative().default(0),
})
export type CollaborativePartnerInput = z.infer<typeof collaborativePartnerInputSchema>

export const collaborativeDeckInputSchema = z.object({
  scenarioId: z.string(),
  ceiBaseline: z.number().min(0).max(100).optional(),
})
export type CollaborativeDeckInput = z.infer<typeof collaborativeDeckInputSchema>
