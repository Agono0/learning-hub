import { z } from 'zod'
/**
 * Claim-Evidence-Reasoning (CER) & Epistemic Argumentation Engine
 *
 * Grounded in:
 * - Katherine L. McNeill & Joseph Krajcik (2012): Supporting Grade 5–8 Students
 *   in Constructing Explanations in Science: The Claim, Evidence, and Reasoning Framework.
 * - Jonathan Osborne, Sibel Erduran, & Shirley Simon (2004): Enhancing the Quality of
 *   Argumentation in School Science (Toulmin Argument Pattern TAP 5-Level Rubric).
 * - Deanna Kuhn (1991, 2010): The Skills of Argument & Epistemic Metacognition.
 *
 * Implements:
 * 1. McNeill-Krajcik CER Framework (Claim, Evidence, Reasoning, Rebuttal)
 * 2. Erduran et al. (2004) TAP 5-Level Argument Quality Hierarchy
 * 3. Evidence Discrimination (Genuine empirical vs circular pseudo-evidence)
 * 4. Quantitative Metrics:
 *    - CER Completeness Score (CCS ∈ [0, 100])
 *    - Evidence Quality Index (EQI ∈ [0, 100])
 *    - Reasoning Depth Index (RDI ∈ [0, 100])
 *    - Toulmin Argument Pattern Level (TAP ∈ [1, 5])
 *    - Epistemic Rigor Score (ERS ∈ [0, 100])
 * 5. Deterministic Socratic Counter-Arguer Simulation
 * 6. FSRS-6 Calibrated Argumentation Spaced Repetition Deck
 * 7. 5 Canonical Multidisciplinary Scientific Debates
 */

// TD-05: the 5 canonical scientific debates are CONTENT, not logic — they live in
// ./content.ts so engine diffs stay about algorithms. Re-exported so every existing
// import path keeps working (the barrel does `export * from` this file).
export { CANONICAL_SCIENTIFIC_DEBATES } from './content'

// ============================================================================
// 1. Zod Enums & Schemas
// ============================================================================

export const EvidenceTypeEnum = z.enum([
  'empirical_observation',
  'statistical_data',
  'experimental_measurement',
  'pseudo_evidence',
  'anecdotal',
])
export type EvidenceType = z.infer<typeof EvidenceTypeEnum>

export const TAPLevelEnum = z.number().int().min(1).max(5)
export type TAPLevel = z.infer<typeof TAPLevelEnum>

export const CompetingClaimSchema = z.object({
  id: z.string(),
  claim: z.string(),
  theorist: z.string(),
  isCanonical: z.boolean(),
  summary: z.string(),
})
export type CompetingClaim = z.infer<typeof CompetingClaimSchema>

export const EvidenceItemSchema = z.object({
  id: z.string(),
  type: EvidenceTypeEnum,
  description: z.string(),
  reliabilityScore: z.number().min(0).max(100),
  supportsClaimId: z.string(),
  opposesClaimId: z.string().optional(),
  isGenuine: z.boolean(),
  methodologicalNote: z.string(),
})
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>

export const ScientificPrincipleSchema = z.object({
  id: z.string(),
  principle: z.string(),
  domainAxiom: z.string(),
  connectsMechanism: z.string(),
})
export type ScientificPrinciple = z.infer<typeof ScientificPrincipleSchema>

export const CounterArgumentSchema = z.object({
  id: z.string(),
  counterClaim: z.string(),
  presumedEvidence: z.string(),
  expectedRebuttalMechanism: z.string(),
})
export type CounterArgument = z.infer<typeof CounterArgumentSchema>

export const ScientificDebateCaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain: z.enum([
    'climatology',
    'quantum_physics',
    'evolutionary_genetics',
    'neuropharmacology',
    'cognitive_science',
  ]),
  difficulty: z.enum(['introductory', 'intermediate', 'advanced']),
  focalQuestion: string(),
  phenomenonContext: z.string(),
  competingClaims: z.array(CompetingClaimSchema),
  evidencePool: z.array(EvidenceItemSchema),
  scientificPrinciples: z.array(ScientificPrincipleSchema),
  counterArguments: z.array(CounterArgumentSchema),
})
export type ScientificDebateCase = z.infer<typeof ScientificDebateCaseSchema>

export const CERArgumentSubmissionSchema = z.object({
  debateId: z.string(),
  selectedClaimId: z.string(),
  claimStatement: z.string().min(5),
  selectedEvidenceIds: z.array(z.string()).min(1),
  userEvidenceSynthesis: z.string().min(10),
  selectedPrincipleIds: z.array(z.string()).min(1),
  userReasoningStatement: z.string().min(15),
  userRebuttalStatement: z.string().optional(),
  targetedCounterArgumentId: z.string().optional(),
})
export type CERArgumentSubmission = z.infer<typeof CERArgumentSubmissionSchema>

export const CEREvaluationSchema = z.object({
  ccs: z.number().min(0).max(100), // CER Completeness Score
  eqi: z.number().min(0).max(100), // Evidence Quality Index
  rdi: z.number().min(0).max(100), // Reasoning Depth Index
  tapLevel: TAPLevelEnum, // 1 to 5
  ers: z.number().min(0).max(100), // Epistemic Rigor Score
  masteryBand: z.enum([
    'naive_assertion',
    'empirically_grounded',
    'mechanistically_reasoned',
    'dialectic_mastery',
  ]),
  feedback: z.array(z.string()),
  epistemicStrengths: z.array(z.string()),
  vulnerabilities: z.array(z.string()),
})
export type CEREvaluation = z.infer<typeof CEREvaluationSchema>

export const CalibratedCERCardSchema = z.object({
  id: z.string(),
  cardType: z.enum(['claim_retrieval', 'evidence_audit', 'causal_reasoning', 'rebuttal_defense']),
  front: z.string(),
  back: z.string(),
  rationale: z.string(),
  fsrsParameters: z.object({
    stability: z.number(),
    difficulty: z.number(),
  }),
  tags: z.array(z.string()),
})
export type CalibratedCERCard = z.infer<typeof CalibratedCERCardSchema>

export const CalibratedCERDeckSchema = z.object({
  debateId: z.string(),
  debateTitle: z.string(),
  generatedAt: z.number(),
  ersBaseline: z.number(),
  cards: z.array(CalibratedCERCardSchema),
})
export type CalibratedCERDeck = z.infer<typeof CalibratedCERDeckSchema>

// Helper for schema definition
function string() {
  return z.string()
}

// ============================================================================
// 2. 5 Canonical Multidisciplinary Scientific Debates
// ============================================================================

// Corpus moved verbatim to ./content.ts (TD-05 — content, not logic); re-exported
// above so import paths are unchanged.

// ============================================================================
// 3. Quantitative CER & TAP Evaluation Engine
// ============================================================================

/**
 * Evaluates an argument submission against the McNeill-Krajcik CER framework
 * and the Osborne-Erduran-Simon TAP 5-level hierarchy.
 */
export function evaluateCERArgument(
  debate: ScientificDebateCase,
  submission: CERArgumentSubmission,
): CEREvaluation {
  const feedback: string[] = []
  const epistemicStrengths: string[] = []
  const vulnerabilities: string[] = []

  // 1. Claim Completeness & Alignment
  const matchedClaim = debate.competingClaims.find((c) => c.id === submission.selectedClaimId)
  const claimHasContent = submission.claimStatement.trim().length >= 15
  const claimScore = matchedClaim ? (claimHasContent ? 100 : 70) : 40

  if (claimHasContent && matchedClaim) {
    epistemicStrengths.push(
      `Clear, testable claim formulated aligned with ${matchedClaim.theorist}.`,
    )
  } else {
    vulnerabilities.push('Claim statement is terse or lacks explicit theoretical positioning.')
  }

  // 2. Evidence Discrimination & Quality Index (EQI)
  const selectedEvidence = debate.evidencePool.filter((e) =>
    submission.selectedEvidenceIds.includes(e.id),
  )

  let genuineEvidenceCount = 0
  let pseudoEvidenceCount = 0
  let totalReliability = 0

  for (const ev of selectedEvidence) {
    if (ev.isGenuine) {
      genuineEvidenceCount++
      totalReliability += ev.reliabilityScore
    } else {
      pseudoEvidenceCount++
    }
  }

  const _evidenceSynthesisWordCount = submission.userEvidenceSynthesis
    .split(/\s+/)
    .filter(Boolean).length
  const avgReliability =
    selectedEvidence.length > 0 ? totalReliability / selectedEvidence.length : 0

  // EQI penalty for pseudo-evidence, bonus for genuine empirical evidence
  const eqi = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        avgReliability * 0.7 + Math.min(genuineEvidenceCount * 15, 30) - pseudoEvidenceCount * 45,
      ),
    ),
  )

  if (pseudoEvidenceCount > 0) {
    vulnerabilities.push(
      'Argument incorporates pseudo-evidence or anecdotal assertions lacking methodological rigor.',
    )
  } else if (genuineEvidenceCount >= 2) {
    epistemicStrengths.push(
      `Robust evidence triangulation: supported by ${genuineEvidenceCount} genuine empirical/experimental sources.`,
    )
  }

  // 3. Reasoning Depth Index (RDI)
  const selectedPrinciples = debate.scientificPrinciples.filter((p) =>
    submission.selectedPrincipleIds.includes(p.id),
  )
  const reasoningWordCount = submission.userReasoningStatement.split(/\s+/).filter(Boolean).length

  const CAUSAL_LEGAL_MARKERS = [
    'because',
    'consequently',
    'therefore',
    'thus',
    'mechanistically',
    'mediates',
    'catalyzes',
    'inhibits',
    'necessitates',
    'causally',
    'however',
    'whereas',
    'leads to',
    'due to',
    'furthermore',
  ]

  let causalMarkerCount = 0
  const combinedText =
    `${submission.userReasoningStatement} ${submission.userRebuttalStatement ?? ''}`.toLowerCase()
  for (const marker of CAUSAL_LEGAL_MARKERS) {
    if (combinedText.includes(marker)) causalMarkerCount++
  }

  const rdi = Math.min(
    100,
    Math.round(
      Math.min(selectedPrinciples.length * 35, 70) +
        Math.min(causalMarkerCount * 6, 18) +
        (reasoningWordCount >= 25 ? 12 : reasoningWordCount / 2),
    ),
  )

  if (selectedPrinciples.length > 0) {
    epistemicStrengths.push(
      `Mechanistic reasoning grounded in ${selectedPrinciples.map((p) => p.principle).join(', ')}.`,
    )
  } else {
    vulnerabilities.push('Reasoning lacks explicit scientific axioms or causal principles.')
  }

  // 4. Rebuttal Assessment
  const hasRebuttal = Boolean(
    submission.userRebuttalStatement && submission.userRebuttalStatement.trim().length >= 20,
  )
  const rebuttalScore = hasRebuttal ? 100 : 0

  if (hasRebuttal) {
    epistemicStrengths.push(
      'Active dialectic rebuttal addressing counterarguments or alternative interpretations.',
    )
  } else {
    vulnerabilities.push('Absence of counterargument anticipation or explicit rebuttal.')
  }

  // 5. CER Completeness Score (CCS)
  // CCS = 0.20 * Claim + 0.35 * Evidence + 0.30 * Reasoning + 0.15 * Rebuttal
  const ccs = Math.min(
    100,
    Math.round(
      claimScore * 0.2 +
        (genuineEvidenceCount > 0 ? 100 : 30) * 0.35 +
        (reasoningWordCount >= 20 ? 100 : reasoningWordCount * 4) * 0.3 +
        rebuttalScore * 0.15,
    ),
  )

  // 6. Erduran, Osborne & Simon (2004) TAP 5-Level Rubric
  // Level 1: Claim vs Counter-claim without data/warrant
  // Level 2: Claim + Data/Warrant, no rebuttal
  // Level 3: Claim + Data + Warrant + Weak/undeveloped rebuttal
  // Level 4: Claim + Data + Warrant + Clear, reasoned rebuttal
  // Level 5: Extended argument with multi-rebuttal synthesis
  let tapLevel: TAPLevel = 1
  if (genuineEvidenceCount > 0 && selectedPrinciples.length === 0 && !hasRebuttal) {
    tapLevel = 2
  } else if (genuineEvidenceCount > 0 && selectedPrinciples.length > 0 && !hasRebuttal) {
    tapLevel = 2 // Data + Warrant, still no rebuttal
  } else if (genuineEvidenceCount > 0 && selectedPrinciples.length > 0 && hasRebuttal) {
    if (
      submission.userRebuttalStatement &&
      submission.userRebuttalStatement.length > 80 &&
      causalMarkerCount >= 2
    ) {
      tapLevel = genuineEvidenceCount >= 3 ? 5 : 4
    } else {
      tapLevel = 3
    }
  }

  // 7. Composite Epistemic Rigor Score (ERS)
  // ERS = 0.30 * CCS + 0.25 * EQI + 0.25 * RDI + 0.20 * ((TAP / 5) * 100)
  const ers = Math.min(
    100,
    Math.round(ccs * 0.3 + eqi * 0.25 + rdi * 0.25 + (tapLevel / 5) * 100 * 0.2),
  )

  let masteryBand:
    'naive_assertion' | 'empirically_grounded' | 'mechanistically_reasoned' | 'dialectic_mastery' =
    'naive_assertion'
  if (ers >= 80) masteryBand = 'dialectic_mastery'
  else if (ers >= 60) masteryBand = 'mechanistically_reasoned'
  else if (ers >= 40) masteryBand = 'empirically_grounded'

  // Constructive pedagogical feedback
  if (tapLevel >= 4) {
    feedback.push(
      `Exemplary Level ${tapLevel} Toulmin Argument Pattern (TAP). Your argument coordinates empirical evidence with causal warrants and proactively refutes counter-claims.`,
    )
  } else if (tapLevel === 3) {
    feedback.push(
      `Solid Level 3 argument. Elevate to Level 4 by directly specifying the exact physiological/physical mechanism that invalidates the opposing hypothesis.`,
    )
  } else {
    feedback.push(
      `Currently at Level ${tapLevel} TAP. To advance, move beyond data citation to formulate explicit rebuttals that refute counter-hypotheses (Osborne et al. 2004).`,
    )
  }

  return {
    ccs,
    eqi,
    rdi,
    tapLevel,
    ers,
    masteryBand,
    feedback,
    epistemicStrengths,
    vulnerabilities,
  }
}

// ============================================================================
// 4. Socratic Adversarial Peer Counter-Arguer Simulation
// ============================================================================

/**
 * Generates an adversarial counter-argument challenging the user's selected claim,
 * forcing the learner to engage in Kuhn (1991) rebuttal construction.
 */
export function generateAdversarialCounterArgument(
  debate: ScientificDebateCase,
  selectedClaimId: string,
): {
  counterTheorist: string
  counterClaim: string
  counterEvidence: string
  rebuttalChallenge: string
} {
  // Select opposing claim
  const opposingClaim =
    debate.competingClaims.find((c) => c.id !== selectedClaimId) ?? debate.competingClaims[0]!

  // Find opposing evidence
  const opposingEvidence =
    debate.evidencePool.find((e) => e.supportsClaimId === opposingClaim.id && e.isGenuine) ??
    debate.evidencePool[0]!

  const counterArg = debate.counterArguments[0]!

  return {
    counterTheorist: opposingClaim.theorist,
    counterClaim: opposingClaim.claim,
    counterEvidence: opposingEvidence.description,
    rebuttalChallenge: `An opponent holding the ${opposingClaim.theorist} position argues: "${counterArg.counterClaim}" based on empirical observation that ${opposingEvidence.description}. How does your causal reasoning dismantle this counter-interpretation?`,
  }
}

// ============================================================================
// 5. FSRS-6 Calibrated Argumentation Deck Generator
// ============================================================================

/**
 * Generates spaced repetition flashcards from the scientific debate,
 * with initial stability and difficulty calibrated from the Epistemic Rigor Score (ERS).
 */
export function generateCERFSRSDeck(
  debate: ScientificDebateCase,
  submission: CERArgumentSubmission,
  evaluation: CEREvaluation,
): CalibratedCERDeck {
  const cards: CalibratedCERCard[] = []

  // Stability scaling: higher ERS -> higher initial stability (S0 ∈ [2.0, 5.5] days)
  const baseStability = 2.0 + (evaluation.ers / 100) * 3.5

  // Difficulty scaling: higher ERS -> lower perceived difficulty (D0 ∈ [3.0, 7.5])
  const baseDifficulty = 7.5 - (evaluation.ers / 100) * 4.5

  // 1. Claim Retrieval Card
  const matchedClaim =
    debate.competingClaims.find((c) => c.id === submission.selectedClaimId) ??
    debate.competingClaims[0]!
  cards.push({
    id: `card-${debate.id}-claim`,
    cardType: 'claim_retrieval',
    front: `[CER Argumentation — ${debate.title}]\n\nWhat is the core scientific claim of the ${matchedClaim.theorist} paradigm regarding ${debate.focalQuestion}?`,
    back: `**Scientific Claim:**\n${matchedClaim.claim}\n\n**Theoretical Summary:**\n${matchedClaim.summary}`,
    rationale:
      'Requires accurate retrieval of focal scientific claims without strawman simplification.',
    fsrsParameters: {
      stability: Math.round(baseStability * 1.1 * 10) / 10,
      difficulty: Math.round(baseDifficulty * 10) / 10,
    },
    tags: ['argumentation', 'cer-claim', debate.domain, debate.id],
  })

  // 2. Evidence Discrimination & Audit Card
  const genuineEv = debate.evidencePool.find((e) => e.isGenuine) ?? debate.evidencePool[0]!
  const pseudoEv = debate.evidencePool.find((e) => !e.isGenuine) ?? debate.evidencePool[1]!
  cards.push({
    id: `card-${debate.id}-evidence-audit`,
    cardType: 'evidence_audit',
    front: `[CER Evidence Audit — Epistemic Discrimination]\n\nIn investigating ${debate.title}, why does:\n(A) "${genuineEv.description.slice(0, 70)}..." constitute valid empirical evidence, whereas\n(B) "${pseudoEv.description.slice(0, 70)}..." is disqualified as pseudo-evidence?`,
    back: `**Valid Evidence Criteria:**\n${genuineEv.methodologicalNote} (Reliability: ${genuineEv.reliabilityScore}%)\n\n**Disqualification Rationale:**\n${pseudoEv.methodologicalNote}`,
    rationale:
      'Trains epistemic discrimination between reliable empirical instrumentation and anecdotal pseudo-evidence (Kuhn 1991).',
    fsrsParameters: {
      stability: Math.round(baseStability * 10) / 10,
      difficulty: Math.round((baseDifficulty + 0.8) * 10) / 10,
    },
    tags: ['argumentation', 'cer-evidence', debate.domain, debate.id],
  })

  // 3. Causal Reasoning & Mechanism Card
  const principle = debate.scientificPrinciples[0]!
  cards.push({
    id: `card-${debate.id}-reasoning`,
    cardType: 'causal_reasoning',
    front: `[CER Scientific Reasoning — Mechanistic Warrant]\n\nHow does the principle of **${principle.principle}** connect empirical data to the claim in ${debate.title}?`,
    back: `**Domain Axiom:**\n${principle.domainAxiom}\n\n**Causal Connection:**\n${principle.connectsMechanism}`,
    rationale:
      'Enforces articulation of theoretical warrants and mechanistic chains connecting data to assertions (McNeill & Krajcik 2012).',
    fsrsParameters: {
      stability: Math.round(baseStability * 1.2 * 10) / 10,
      difficulty: Math.round((baseDifficulty - 0.4) * 10) / 10,
    },
    tags: ['argumentation', 'cer-reasoning', debate.domain, debate.id],
  })

  // 4. Dialectic Rebuttal Card
  const counter = debate.counterArguments[0]!
  cards.push({
    id: `card-${debate.id}-rebuttal`,
    cardType: 'rebuttal_defense',
    front: `[CER Rebuttal Crucible — Counter-Argument Refutation]\n\n**Counter-Claim:** "${counter.counterClaim}"\n\nPresumed Basis: ${counter.presumedEvidence}\n\nWhat is the decisive causal rebuttal that neutralizes this objection?`,
    back: `**Rebuttal Mechanism:**\n${counter.expectedRebuttalMechanism}`,
    rationale:
      'Develops Level 4 & 5 Toulmin Argumentation (TAP) by explicitly refuting plausible counter-theories (Osborne et al. 2004).',
    fsrsParameters: {
      stability: Math.round(baseStability * 0.9 * 10) / 10,
      difficulty: Math.round((baseDifficulty + 1.2) * 10) / 10,
    },
    tags: ['argumentation', 'cer-rebuttal', debate.domain, debate.id],
  })

  return {
    debateId: debate.id,
    debateTitle: debate.title,
    generatedAt: Date.now(),
    ersBaseline: evaluation.ers,
    cards,
  }
}

// ── Route-level input schemas (TD-02) ──────────────────────────────────────

export const cerCounterInputSchema = z.object({
  debateId: z.string(),
  claimId: z.string(),
})
export type CerCounterInput = z.infer<typeof cerCounterInputSchema>

export const cerDeckInputSchema = z.object({
  debateId: z.string(),
  ersBaseline: z.number().min(0).max(100).optional(),
})
export type CerDeckInput = z.infer<typeof cerDeckInputSchema>
