/**
 * Reciprocal Teaching & Dialogic Questioning Engine
 *
 * Grounded in:
 * - Palincsar & Brown (1984): Reciprocal Teaching of Comprehension-Fostering
 *   and Comprehension-Monitoring Activities (d ≈ 0.88 effect size).
 * - Chi & Wylie (2014): The ICAP Framework: Linking Cognitive Engagement
 *   to Active Learning Outcomes (Interactive > Constructive > Active > Passive).
 * - Alison King (1990, 1994, 1999): Guided Reciprocal Peer Questioning
 *   and Thought-Provoking Question Stems.
 *
 * Implements:
 * 1. 4 Reciprocal Strategies (Questioner / Clarifier / Summarizer / Predictor)
 * 2. ICAP Taxonomy Classifier & Composite Score (ICS ∈ [0, 100])
 * 3. Reciprocal Strategy Balance Score (RSBS ∈ [0, 100], Shannon entropy-based)
 * 4. Elaboration Depth Index (EDI ∈ [0, 100]) with causal connector parsing
 * 5. Metacognitive Repair Ratio (MRR ∈ [0, 1])
 * 6. Reciprocal Dialogue Maturity Score (RDMS ∈ [0, 100])
 * 7. Deterministic Peer Dialogic Agent Simulation (Socratic co-learner)
 * 8. FSRS-6 Spaced Repetition Calibrated Deck Generator
 * 9. 5 Canonical Multidisciplinary Complex Texts
 */

import { z } from 'zod'

// TD-05: scenario corpora (cognitive lexicons + canonical text passages) are
// CONTENT, not logic — they live in ./content.ts so engine diffs stay about
// algorithms. Re-exported so every existing import path keeps working (the
// barrel does `export * from` this file).
import { CAUSAL_CONNECTORS, INTERACTIVE_MARKERS } from './content'
export { CAUSAL_CONNECTORS, INTERACTIVE_MARKERS, CANONICAL_TEXT_PASSAGES } from './content'

// ============================================================================
// 1. Zod Enums & Schemas
// ============================================================================

export const ReciprocalRoleEnum = z.enum(['questioner', 'clarifier', 'summarizer', 'predictor'])
export type ReciprocalRole = z.infer<typeof ReciprocalRoleEnum>

export const ICAPLevelEnum = z.enum(['passive', 'active', 'constructive', 'interactive'])
export type ICAPLevel = z.infer<typeof ICAPLevelEnum>

export const QuestionStemCategoryEnum = z.enum([
  'comprehension_thinking',
  'causal_explanation',
  'counterfactual_inference',
  'evaluative_epistemic',
])
export type QuestionStemCategory = z.infer<typeof QuestionStemCategoryEnum>

export const QuestionStemSchema = z.object({
  id: z.string(),
  category: QuestionStemCategoryEnum,
  role: ReciprocalRoleEnum,
  stem: z.string(),
  rationale: z.string(),
  icapTarget: ICAPLevelEnum,
})
export type QuestionStem = z.infer<typeof QuestionStemSchema>

export const MisconceptionItemSchema = z.object({
  id: z.string(),
  misconception: z.string(),
  clarification: z.string(),
  evidence: z.string(),
})
export type MisconceptionItem = z.infer<typeof MisconceptionItemSchema>

export const PredictivePromptSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  expectedMechanism: z.string(),
  falsificationScenario: z.string(),
})
export type PredictivePrompt = z.infer<typeof PredictivePromptSchema>

export const TextPassageSchema = z.object({
  id: z.string(),
  title: z.string(),
  discipline: z.enum([
    'evolutionary_biology',
    'computer_science',
    'astrophysics',
    'macroeconomics',
    'neurobiology',
  ]),
  difficulty: z.enum(['introductory', 'intermediate', 'advanced']),
  wordCount: z.number(),
  content: z.string(),
  coreThesis: z.string(),
  keyMechanisms: z.array(z.string()),
  commonMisconceptions: z.array(MisconceptionItemSchema),
  stems: z.array(QuestionStemSchema),
  predictivePrompts: z.array(PredictivePromptSchema),
})
export type TextPassage = z.infer<typeof TextPassageSchema>

export const DialogueTurnSchema = z.object({
  id: z.string(),
  speaker: z.enum(['user', 'peer_agent', 'tutor']),
  role: ReciprocalRoleEnum,
  turnIndex: z.number().int().nonnegative(),
  text: z.string().min(1),
  stemId: z.string().optional(),
  timestamp: z.number(),
  targetTurnId: z.string().optional(),
  icapLevel: ICAPLevelEnum,
  elaborationScore: z.number().min(0).max(100),
  resolvedMisconceptionId: z.string().optional(),
})
export type DialogueTurn = z.infer<typeof DialogueTurnSchema>

export const ICAPDistributionSchema = z.object({
  passiveRatio: z.number().min(0).max(1),
  activeRatio: z.number().min(0).max(1),
  constructiveRatio: z.number().min(0).max(1),
  interactiveRatio: z.number().min(0).max(1),
  ics: z.number().min(0).max(100),
})
export type ICAPDistribution = z.infer<typeof ICAPDistributionSchema>

export const StrategyBalanceSchema = z.object({
  roleFrequencies: z.record(ReciprocalRoleEnum, z.number()),
  rsbs: z.number().min(0).max(100),
  dominantRole: ReciprocalRoleEnum,
  neglectedRoles: z.array(ReciprocalRoleEnum),
})
export type StrategyBalance = z.infer<typeof StrategyBalanceSchema>

export const ElaborationMetricsSchema = z.object({
  avgScore: z.number().min(0).max(100),
  edi: z.number().min(0).max(100),
  causalConnectorsCount: z.number().int().nonnegative(),
  depthCategory: z.enum(['superficial', 'moderate', 'deep', 'profound']),
})
export type ElaborationMetrics = z.infer<typeof ElaborationMetricsSchema>

export const MetacognitiveRepairMetricsSchema = z.object({
  attemptedRepairs: z.number().int().nonnegative(),
  successfulRepairs: z.number().int().nonnegative(),
  mrr: z.number().min(0).max(1),
})
export type MetacognitiveRepairMetrics = z.infer<typeof MetacognitiveRepairMetricsSchema>

export const ReciprocalEvaluationSchema = z.object({
  totalTurns: z.number().int().nonnegative(),
  userTurnsCount: z.number().int().nonnegative(),
  icap: ICAPDistributionSchema,
  strategy: StrategyBalanceSchema,
  elaboration: ElaborationMetricsSchema,
  repair: MetacognitiveRepairMetricsSchema,
  rdms: z.number().min(0).max(100),
  masteryBand: z.enum([
    'novice_passive',
    'developing_active',
    'proficient_constructive',
    'mastery_interactive',
  ]),
  feedback: z.array(z.string()),
  recommendations: z.array(z.string()),
})
export type ReciprocalEvaluation = z.infer<typeof ReciprocalEvaluationSchema>

export const CalibratedReciprocalCardSchema = z.object({
  id: z.string(),
  role: ReciprocalRoleEnum,
  front: z.string(),
  back: z.string(),
  rationale: z.string(),
  icapLevel: ICAPLevelEnum,
  fsrsParameters: z.object({
    stability: z.number(),
    difficulty: z.number(),
  }),
  tags: z.array(z.string()),
})
export type CalibratedReciprocalCard = z.infer<typeof CalibratedReciprocalCardSchema>

export const CalibratedReciprocalDeckSchema = z.object({
  passageId: z.string(),
  passageTitle: z.string(),
  generatedAt: z.number(),
  rdmsBaseline: z.number(),
  cards: z.array(CalibratedReciprocalCardSchema),
})
export type CalibratedReciprocalDeck = z.infer<typeof CalibratedReciprocalDeckSchema>

// ============================================================================
// 2. Causal Markers & Cognitive Lexicons
// ============================================================================
// Corpus (CAUSAL_CONNECTORS + INTERACTIVE_MARKERS) moved verbatim to ./content.ts
// (TD-05 — content, not logic); re-exported at the top of this file so import
// paths are unchanged.

// ============================================================================
// 3. 5 Canonical Multidisciplinary Text Passages
// ============================================================================
// Corpus (CANONICAL_TEXT_PASSAGES) moved verbatim to ./content.ts (TD-05 —
// content, not logic); re-exported at the top of this file so import paths are
// unchanged.

// ============================================================================
// 4. ICAP Classifier & Quantitative Evaluation Engine
// ============================================================================

/**
 * Classifies an individual dialogue turn into the Chi & Wylie (2014) ICAP taxonomy.
 */
export function classifyICAPEngagement(
  text: string,
  isResponsive: boolean,
  previousTurn?: DialogueTurn,
): {
  icapLevel: ICAPLevel
  rationale: string
  causalScore: number
} {
  const lower = text.toLowerCase()
  const wordCount = lower.split(/\s+/).filter(Boolean).length

  // Count causal connectors
  let causalCount = 0
  for (const connector of CAUSAL_CONNECTORS) {
    if (lower.includes(connector)) {
      causalCount++
    }
  }

  // Count interactive conversational markers
  let interactiveCount = 0
  for (const marker of INTERACTIVE_MARKERS) {
    if (lower.includes(marker)) {
      interactiveCount++
    }
  }

  // Check if responsive turn references words from previous turn
  let sharedWordRatio = 0
  if (previousTurn && previousTurn.text) {
    const prevWords = new Set(
      previousTurn.text
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4),
    )
    const currWords = lower.split(/\s+/).filter((w) => w.length > 4)
    if (prevWords.size > 0 && currWords.length > 0) {
      let matchCount = 0
      for (const w of currWords) {
        if (prevWords.has(w)) matchCount++
      }
      sharedWordRatio = matchCount / currWords.length
    }
  }

  const causalScore = Math.min(100, causalCount * 22 + (wordCount > 35 ? 20 : wordCount))

  // Decision Logic:
  // 1. Interactive: Turn is responsive, references previous speaker's ideas,
  //    and either builds on, critiques, or synthesizes with causal elaboration.
  if (
    isResponsive &&
    (interactiveCount > 0 || (sharedWordRatio > 0.15 && causalCount >= 1)) &&
    wordCount >= 15
  ) {
    return {
      icapLevel: 'interactive',
      rationale:
        'Turn exhibits dialogic co-construction: directly addresses prior peer contributions with causal or counterfactual justification.',
      causalScore,
    }
  }

  // 2. Constructive: Generates novel inferences, explanations, or questions
  //    with substantial causal structure, even if monologic.
  if (causalCount >= 2 || (causalCount >= 1 && wordCount >= 25)) {
    return {
      icapLevel: 'constructive',
      rationale:
        'Turn produces new cognitive artifacts: causal explanation, synthesis, or hypothesis exceeding given text.',
      causalScore,
    }
  }

  // 3. Active: Engages with the material via selection or summarization,
  //    but lacks deep causal elaboration.
  if (wordCount >= 10) {
    return {
      icapLevel: 'active',
      rationale:
        'Turn actively manipulates text or paraphrases concepts with limited causal depth.',
      causalScore,
    }
  }

  // 4. Passive: Very brief, verbatim repetition, or minimal confirmation.
  return {
    icapLevel: 'passive',
    rationale:
      'Turn is minimally generative, displaying passive observation or shallow confirmation.',
    causalScore: Math.min(causalScore, 20),
  }
}

/**
 * Computes comprehensive quantitative evaluation across all dialogue turns.
 */
export function evaluateReciprocalSession(
  turns: DialogueTurn[],
  passage: TextPassage,
): ReciprocalEvaluation {
  const userTurns = turns.filter((t) => t.speaker === 'user')
  const totalTurns = turns.length
  const userTurnsCount = userTurns.length

  if (userTurnsCount === 0) {
    return {
      totalTurns,
      userTurnsCount: 0,
      icap: {
        passiveRatio: 1,
        activeRatio: 0,
        constructiveRatio: 0,
        interactiveRatio: 0,
        ics: 10,
      },
      strategy: {
        roleFrequencies: {
          questioner: 0,
          clarifier: 0,
          summarizer: 0,
          predictor: 0,
        },
        rsbs: 0,
        dominantRole: 'questioner',
        neglectedRoles: ['clarifier', 'summarizer', 'predictor'],
      },
      elaboration: {
        avgScore: 0,
        edi: 0,
        causalConnectorsCount: 0,
        depthCategory: 'superficial',
      },
      repair: {
        attemptedRepairs: 0,
        successfulRepairs: 0,
        mrr: 0,
      },
      rdms: 10,
      masteryBand: 'novice_passive',
      feedback: ['No user turns recorded yet. Begin by selecting a reciprocal role.'],
      recommendations: ['Formulate a question using one of King’s thought-provoking stems.'],
    }
  }

  // 1. ICAP Distribution
  let passiveCount = 0
  let activeCount = 0
  let constructiveCount = 0
  let interactiveCount = 0

  for (const t of userTurns) {
    if (t.icapLevel === 'passive') passiveCount++
    else if (t.icapLevel === 'active') activeCount++
    else if (t.icapLevel === 'constructive') constructiveCount++
    else if (t.icapLevel === 'interactive') interactiveCount++
  }

  const passiveRatio = passiveCount / userTurnsCount
  const activeRatio = activeCount / userTurnsCount
  const constructiveRatio = constructiveCount / userTurnsCount
  const interactiveRatio = interactiveCount / userTurnsCount

  // Composite ICAP Score: weighted combination
  const ics = Math.min(
    100,
    Math.round(
      (passiveRatio * 0.1 +
        activeRatio * 0.35 +
        constructiveRatio * 0.75 +
        interactiveRatio * 1.0) *
        100,
    ),
  )

  // 2. Strategy Balance (RSBS - Shannon entropy across the 4 roles)
  const roleFrequencies: Record<ReciprocalRole, number> = {
    questioner: 0,
    clarifier: 0,
    summarizer: 0,
    predictor: 0,
  }

  for (const t of userTurns) {
    roleFrequencies[t.role] = (roleFrequencies[t.role] || 0) + 1
  }

  let entropy = 0
  const maxEntropy = Math.log(4) // ln(4) ≈ 1.38629
  let maxFreq = -1
  let dominantRole: ReciprocalRole = 'questioner'
  const neglectedRoles: ReciprocalRole[] = []

  for (const role of ['questioner', 'clarifier', 'summarizer', 'predictor'] as const) {
    const count = roleFrequencies[role]
    if (count > maxFreq) {
      maxFreq = count
      dominantRole = role
    }
    if (count === 0) {
      neglectedRoles.push(role)
    }
    if (count > 0) {
      const p = count / userTurnsCount
      entropy -= p * Math.log(p)
    }
  }

  const rsbs = Math.min(100, Math.round((entropy / maxEntropy) * 100))

  // 3. Elaboration Depth Index (EDI)
  let totalElaboration = 0
  let totalCausalConnectors = 0

  for (const t of userTurns) {
    totalElaboration += t.elaborationScore
    const lower = t.text.toLowerCase()
    for (const connector of CAUSAL_CONNECTORS) {
      if (lower.includes(connector)) totalCausalConnectors++
    }
  }

  const avgElaboration = Math.round(totalElaboration / userTurnsCount)
  const connectorDensity = totalCausalConnectors / userTurnsCount
  const edi = Math.min(100, Math.round(avgElaboration * 0.7 + Math.min(connectorDensity * 15, 30)))

  let depthCategory: 'superficial' | 'moderate' | 'deep' | 'profound' = 'superficial'
  if (edi >= 80) depthCategory = 'profound'
  else if (edi >= 60) depthCategory = 'deep'
  else if (edi >= 35) depthCategory = 'moderate'

  // 4. Metacognitive Repair Ratio (MRR)
  const clarifierTurns = userTurns.filter((t) => t.role === 'clarifier')
  const attemptedRepairs = clarifierTurns.length
  let successfulRepairs = 0

  for (const t of clarifierTurns) {
    if (t.resolvedMisconceptionId) {
      successfulRepairs++
    } else {
      // Check if text addresses any passage misconception
      const lower = t.text.toLowerCase()
      const matched = passage.commonMisconceptions.some(
        (m) =>
          lower.includes(m.misconception.toLowerCase().slice(0, 20)) ||
          lower.includes(m.clarification.toLowerCase().slice(0, 20)),
      )
      if (matched || t.elaborationScore >= 60) {
        successfulRepairs++
      }
    }
  }

  const mrr =
    attemptedRepairs > 0 ? Math.round((successfulRepairs / attemptedRepairs) * 100) / 100 : 0

  // 5. Reciprocal Dialogue Maturity Score (RDMS)
  // RDMS = 0.35 * ICS + 0.25 * RSBS + 0.25 * EDI + 0.15 * (MRR * 100)
  const rdms = Math.min(100, Math.round(ics * 0.35 + rsbs * 0.25 + edi * 0.25 + mrr * 100 * 0.15))

  let masteryBand:
    'novice_passive' | 'developing_active' | 'proficient_constructive' | 'mastery_interactive' =
    'novice_passive'
  if (rdms >= 80) masteryBand = 'mastery_interactive'
  else if (rdms >= 60) masteryBand = 'proficient_constructive'
  else if (rdms >= 40) masteryBand = 'developing_active'

  // 6. Feedback & Recommendations
  const feedback: string[] = []
  const recommendations: string[] = []

  if (interactiveRatio >= 0.35) {
    feedback.push(
      `Exemplary dialogic co-construction (${Math.round(interactiveRatio * 100)}% interactive turns). Responses directly challenge and build on peer assertions.`,
    )
  } else if (constructiveRatio >= 0.4) {
    feedback.push(
      `Strong constructive reasoning (${Math.round(constructiveRatio * 100)}% constructive turns), generating original causal explanations.`,
    )
  } else {
    feedback.push(
      `Engagement is primarily active/passive. Elevate participation into constructive and interactive modes by linking concepts causally.`,
    )
  }

  if (rsbs >= 75) {
    feedback.push(
      `Outstanding role flexibility (RSBS ${rsbs}/100). All reciprocal strategies (Questioner, Clarifier, Summarizer, Predictor) are exercised in balance.`,
    )
  } else {
    feedback.push(
      `Role distribution is skewed toward '${dominantRole}'. Diversify practice across the remaining reciprocal roles.`,
    )
  }

  if (neglectedRoles.length > 0) {
    recommendations.push(
      `Practice the neglected role(s): ${neglectedRoles.join(', ')} to maximize cognitive comprehension monitoring.`,
    )
  }

  if (edi < 60) {
    recommendations.push(
      'Incorporate explicit causal connectors ("consequently", "whereas", "because", "induces") to deepen mechanistic justification.',
    )
  }

  if (attemptedRepairs === 0) {
    recommendations.push(
      'Adopt the Clarifier role to actively detect and resolve known domain misconceptions in the text.',
    )
  }

  return {
    totalTurns,
    userTurnsCount,
    icap: {
      passiveRatio: Math.round(passiveRatio * 100) / 100,
      activeRatio: Math.round(activeRatio * 100) / 100,
      constructiveRatio: Math.round(constructiveRatio * 100) / 100,
      interactiveRatio: Math.round(interactiveRatio * 100) / 100,
      ics,
    },
    strategy: {
      roleFrequencies,
      rsbs,
      dominantRole,
      neglectedRoles,
    },
    elaboration: {
      avgScore: avgElaboration,
      edi,
      causalConnectorsCount: totalCausalConnectors,
      depthCategory,
    },
    repair: {
      attemptedRepairs,
      successfulRepairs,
      mrr,
    },
    rdms,
    masteryBand,
    feedback,
    recommendations,
  }
}

// ============================================================================
// 5. Deterministic Peer Dialogic Agent Simulation
// ============================================================================

/**
 * Generates an authentic Socratic peer dialogic turn responsive to the user's latest entry,
 * modeling Palincsar & Brown's reciprocal dialogue scaffolding.
 */
export function generatePeerDialogicTurn(
  passage: TextPassage,
  history: DialogueTurn[],
  preferredRole?: ReciprocalRole,
): {
  role: ReciprocalRole
  text: string
  stemId?: string
  icapLevel: ICAPLevel
} {
  const lastUserTurn = [...history].reverse().find((t) => t.speaker === 'user')

  // Choose complementary role
  let role: ReciprocalRole = 'clarifier'
  if (preferredRole) {
    role = preferredRole
  } else if (lastUserTurn) {
    switch (lastUserTurn.role) {
      case 'questioner':
        role = 'clarifier'
        break
      case 'clarifier':
        role = 'summarizer'
        break
      case 'summarizer':
        role = 'predictor'
        break
      case 'predictor':
        role = 'questioner'
        break
    }
  }

  // Generate responsive dialogic text
  let text = ''
  let stemId: string | undefined

  switch (role) {
    case 'questioner': {
      const stem = passage.stems.find((s) => s.role === 'questioner') || passage.stems[0]
      stemId = stem.id
      text = `Building on what you said, let's probe deeper into the causal core: ${stem.stem} Because if we cannot explain that mechanism, our thesis remains vulnerable.`
      break
    }
    case 'clarifier': {
      const misc = passage.commonMisconceptions[0]
      if (lastUserTurn) {
        text = `I agree with your point about "${lastUserTurn.text.slice(0, 45)}...", but consider this potential misconception: some argue that ${misc.misconception}. How does the text's evidence—specifically that ${misc.evidence}—refute that claim?`
      } else {
        text = `To clarify the text: an intuitive pitfall is believing ${misc.misconception}. In contrast, the factual mechanism is that ${misc.clarification}.`
      }
      break
    }
    case 'summarizer': {
      text = `To synthesize our dialogue so far: the overarching thesis is that ${passage.coreThesis} Crucially, this hinges on key mechanisms: ${passage.keyMechanisms.slice(0, 2).join(' and ')}. Does this capture the essence of what you were proposing?`
      break
    }
    case 'predictor': {
      const pred = passage.predictivePrompts[0]
      text = `Taking our conclusion to its logical next step: ${pred.prompt} If this hypothesis is sound, what would happen in the falsification scenario where ${pred.falsificationScenario}?`
      break
    }
  }

  return {
    role,
    text,
    stemId,
    icapLevel: 'interactive',
  }
}

// ============================================================================
// 6. FSRS-6 Calibrated Spaced Repetition Deck Generator
// ============================================================================

/**
 * Synthesizes a calibrated FSRS-6 review deck from the reciprocal dialogue session.
 * Initial card stability and difficulty are dynamically calibrated from RDMS.
 */
export function generateReciprocalFSRSDeck(
  passage: TextPassage,
  turns: DialogueTurn[],
  evaluation: ReciprocalEvaluation,
): CalibratedReciprocalDeck {
  const cards: CalibratedReciprocalCard[] = []

  // Stability scaling: higher RDMS -> higher initial stability (S ∈ [1.8, 5.0] days)
  const baseStability = 1.8 + (evaluation.rdms / 100) * 3.2

  // Difficulty scaling: higher RDMS -> lower perceived difficulty (D ∈ [3.5, 7.5])
  const baseDifficulty = 7.5 - (evaluation.rdms / 100) * 4.0

  // 1. Questioner Socratic Card
  const qTurn = turns.find((t) => t.role === 'questioner' && t.speaker === 'user')
  const qStem = passage.stems.find((s) => s.role === 'questioner') || passage.stems[0]
  cards.push({
    id: `card-${passage.id}-questioner`,
    role: 'questioner',
    front: `[Reciprocal Questioning — ${passage.title}]\n\n${qTurn ? qTurn.text : qStem.stem}`,
    back: `**Causal Mechanism:**\n${passage.coreThesis}\n\n**Key Mechanism:**\n${passage.keyMechanisms[0]}`,
    rationale:
      'Requires active retrieval of causal explanations rather than passive recall (King 1999).',
    icapLevel: 'constructive',
    fsrsParameters: {
      stability: Math.round(baseStability * 1.1 * 10) / 10,
      difficulty: Math.round(baseDifficulty * 10) / 10,
    },
    tags: ['reciprocal-teaching', 'questioner', passage.discipline, passage.id],
  })

  // 2. Clarifier Misconception Disambiguation Card
  const misc = passage.commonMisconceptions[0]
  cards.push({
    id: `card-${passage.id}-clarifier`,
    role: 'clarifier',
    front: `[Reciprocal Clarification — Misconception Audit]\n\n**Misconception:** "${misc.misconception}"\n\nWhy is this intuitively appealing but scientifically flawed?`,
    back: `**Clarification:**\n${misc.clarification}\n\n**Decisive Empirical Evidence:**\n${misc.evidence}`,
    rationale:
      'Directly repairs flawed mental models and arrests cognitive interference (Palincsar & Brown 1984).',
    icapLevel: 'constructive',
    fsrsParameters: {
      stability: Math.round(baseStability * 10) / 10,
      difficulty: Math.round((baseDifficulty + 0.8) * 10) / 10,
    },
    tags: ['reciprocal-teaching', 'clarifier', passage.discipline, passage.id],
  })

  // 3. Summarizer Core Synthesis Card
  cards.push({
    id: `card-${passage.id}-summarizer`,
    role: 'summarizer',
    front: `[Reciprocal Summarization — Macro Synthesis]\n\nWhat is the central thesis of ${passage.title}, and what are its primary causal pillars?`,
    back: `**Core Thesis:**\n${passage.coreThesis}\n\n**Constituent Pillars:**\n${passage.keyMechanisms.map((m, i) => `${i + 1}. ${m}`).join('\n')}`,
    rationale: 'Forces macro-level cognitive compression and conceptual chunking.',
    icapLevel: 'constructive',
    fsrsParameters: {
      stability: Math.round(baseStability * 1.2 * 10) / 10,
      difficulty: Math.round((baseDifficulty - 0.5) * 10) / 10,
    },
    tags: ['reciprocal-teaching', 'summarizer', passage.discipline, passage.id],
  })

  // 4. Predictor Counterfactual Transfer Card
  const pred = passage.predictivePrompts[0]
  cards.push({
    id: `card-${passage.id}-predictor`,
    role: 'predictor',
    front: `[Reciprocal Prediction — Transfer & Counterfactual]\n\n${pred.prompt}`,
    back: `**Expected Mechanism:**\n${pred.expectedMechanism}\n\n**Falsification Benchmark:**\n${pred.falsificationScenario}`,
    rationale:
      'Tests boundary condition extrapolation and predictive hypothesis testing (Chi 2014 Interactive/Constructive).',
    icapLevel: 'interactive',
    fsrsParameters: {
      stability: Math.round(baseStability * 0.9 * 10) / 10,
      difficulty: Math.round((baseDifficulty + 1.2) * 10) / 10,
    },
    tags: ['reciprocal-teaching', 'predictor', passage.discipline, passage.id],
  })

  return {
    passageId: passage.id,
    passageTitle: passage.title,
    generatedAt: Date.now(),
    rdmsBaseline: evaluation.rdms,
    cards,
  }
}
