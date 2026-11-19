/**
 * FSRS-6 Spaced Repetition Deck Synthesis for Categorization Study
 *
 * Grounded in:
 * - Eleanor Rosch (1975) "Cognitive representations of semantic categories."
 *   Journal of Experimental Psychology: General 104(3): 192-233.
 * - Douglas L. Medin & Marguerite M. Schaffer (1978) "Context theory of
 *   classification learning." Psychological Review 85(3): 207-238.
 * - Robert M. Nosofsky (1986) "Attention, similarity, and the
 *   identification-categorization relationship." J. Exp. Psychol. Gen. 115(1): 39-57.
 * - F. Gregory Ashby et al. (1998) "A neuropsychological theory of multiple
 *   systems in category learning." Psychological Review 105(3): 442-481.
 * - Jarrett Ye (2024) "Free Spaced Repetition Scheduler (FSRS-6)."
 *
 * Synthesizes calibrated flashcards across 6 cognitive dimensions:
 * 1. Prototype Abstraction (central tendency)
 * 2. Exemplar Exceptions (items violating the centroid)
 * 3. Typicality Gradient (ordering items by prototype distance)
 * 4. Attention Strategy (dimension weighting & selective filtering)
 * 5. Boundary Fuzziness (Shannon boundary entropy & ambiguity)
 * 6. Dual-System Arbitration (explicit verbal rule vs procedural intuition)
 */

import { z } from 'zod'

// ── Zod Schemas ──────────────────────────────────────────────────────────────

export const categorizationCardTypeSchema = z.enum([
  'prototype_abstraction',
  'exemplar_exception',
  'typicality_gradient',
  'attention_strategy',
  'boundary_fuzziness',
  'dual_system_arbitration',
])
export type CategorizationCardType = z.infer<typeof categorizationCardTypeSchema>

export const categorizationFlashcardSchema = z.object({
  id: z.string(),
  cardType: categorizationCardTypeSchema,
  front: z.string(),
  back: z.string(),
  explanation: z.string(),
  stimulusId: z.string().optional(),
  targetCategory: z.string().optional(),
  fsrsParameters: z.object({
    stability: z.number().positive(), // in days
    difficulty: z.number().min(1).max(10), // FSRS difficulty 1-10
    retrievabilityTarget: z.number().min(0.7).max(0.99).default(0.9),
  }),
  tags: z.array(z.string()),
})
export type CategorizationFlashcard = z.infer<typeof categorizationFlashcardSchema>

export const enhancedCategorizationDeckSchema = z.object({
  deckId: z.string(),
  setId: z.string(),
  setTitle: z.string(),
  generatedAt: z.string(),
  criBaseline: z.number().min(0).max(100),
  cardCount: z.number().int(),
  cards: z.array(categorizationFlashcardSchema),
  fsrsSummary: z.object({
    meanStabilityDays: z.number(),
    meanDifficulty: z.number(),
    hardestCardId: z.string(),
  }),
})
export type EnhancedCategorizationDeck = z.infer<typeof enhancedCategorizationDeckSchema>

// ── FSRS-6 Parameter Calibration ──────────────────────────────────────────────

/**
 * Calibrate initial FSRS-6 stability (days) and difficulty (1-10) based on
 * stimulus typicality (1-7), boundary fuzziness (0-1), and CRI performance (0-100).
 *
 * High typicality + low fuzziness:
 *   High stability (9 - 14 days), low difficulty (2.0 - 3.5).
 * Borderline / high fuzziness / exemplar exception:
 *   Low stability (2.0 - 4.5 days), high difficulty (6.5 - 9.0).
 */
export function calibrateCategorizationFsrsParameters(options: {
  cardType: CategorizationCardType
  typicality?: number // 1-7
  normalizedFuzziness?: number // 0-1
  criBaseline?: number // 0-100
  isException?: boolean
}): { stability: number; difficulty: number } {
  const cri = options.criBaseline ?? 50
  const typ = options.typicality ?? 4.0
  const fuzz = options.normalizedFuzziness ?? 0.3

  let baseStability = 5.0
  let baseDifficulty = 5.0

  switch (options.cardType) {
    case 'prototype_abstraction': {
      // Prototypes are easiest to retain (Posner & Keele 1968)
      baseStability = 9.0 + (typ - 4) * 1.5 + (cri - 50) * 0.05
      baseDifficulty = 3.0 - (typ - 4) * 0.5 - (cri - 50) * 0.03
      break
    }
    case 'typicality_gradient': {
      baseStability = 6.5 + (typ - 4) * 1.0 + (cri - 50) * 0.04
      baseDifficulty = 4.2 - (typ - 4) * 0.4
      break
    }
    case 'exemplar_exception': {
      // Exceptions violate the prototype and require episodic exemplar memory
      baseStability = 3.0 + (cri - 50) * 0.03
      baseDifficulty = 7.5 + fuzz * 1.5 - (cri - 50) * 0.04
      break
    }
    case 'boundary_fuzziness': {
      // High boundary entropy creates interference
      baseStability = 3.5 * (1 - 0.4 * fuzz) + (cri - 50) * 0.03
      baseDifficulty = 6.0 + fuzz * 2.5
      break
    }
    case 'attention_strategy': {
      baseStability = 7.0 + (cri - 50) * 0.04
      baseDifficulty = 5.5 - (cri - 50) * 0.03
      break
    }
    case 'dual_system_arbitration': {
      baseStability = 4.5 + (cri - 50) * 0.04
      baseDifficulty = 7.0 + fuzz * 1.0
      break
    }
  }

  const stability = Math.round(Math.max(1.0, Math.min(21.0, baseStability)) * 10) / 10
  const difficulty = Math.round(Math.max(1.0, Math.min(10.0, baseDifficulty)) * 10) / 10

  return { stability, difficulty }
}

// ── Deck Synthesis Generator ──────────────────────────────────────────────────

/**
 * Generate a comprehensive, research-calibrated 6-card FSRS deck from
 * categorization diagnostics.
 */
export function generateEnhancedCategorizationDeck(options: {
  setId: string
  setTitle: string
  criBaseline: number
  fuzzinessIndex?: number
  borderlineStimuli?: string[]
  attendedDimension?: number
  dominantSystem?: 'verbal' | 'procedural' | 'dual_system'
}): EnhancedCategorizationDeck {
  const { setId, setTitle, criBaseline } = options
  const cards: CategorizationFlashcard[] = []

  // 1. Prototype Abstraction Card
  const protoParams = calibrateCategorizationFsrsParameters({
    cardType: 'prototype_abstraction',
    typicality: 6.8,
    normalizedFuzziness: 0.1,
    criBaseline,
  })
  cards.push({
    id: `fsrs-proto-${setId}-abstraction`,
    cardType: 'prototype_abstraction',
    front: `[Prototype Abstraction: ${setTitle}]\nWhat central feature profile defines the normative centroid of the primary category, and why is an unseen prototype often classified faster than studied peripheral exemplars?`,
    back: `The category centroid abstracts the central tendency across all studied instances (Reed 1972). Unseen prototypes enjoy maximal family resemblance and zero feature contradiction, producing the classic Posner & Keele (1968) prototype superiority effect.`,
    explanation: `Prototype models abstract average feature vectors. Even if never shown during training, the centroid produces the highest activation and lowest Euclidean distance.`,
    fsrsParameters: { ...protoParams, retrievabilityTarget: 0.9 },
    tags: ['categorization', 'prototype', 'central-tendency', setId],
  })

  // 2. Exemplar Exception Card
  const exceptParams = calibrateCategorizationFsrsParameters({
    cardType: 'exemplar_exception',
    isException: true,
    normalizedFuzziness: 0.7,
    criBaseline,
  })
  cards.push({
    id: `fsrs-proto-${setId}-exception`,
    cardType: 'exemplar_exception',
    front: `[Exemplar Exception: ${setTitle}]\nHow does an exemplar model (Nosofsky GCM) successfully classify category exceptions (e.g. Item 4 in the Medin 5-4 structure) that prototype models consistently misclassify?`,
    back: `The GCM sums similarity to individually stored instances: s(i, j) = exp(-c * d(i, j)). When an item is physically closer to contrasting instances but memorized as an exception, stored exemplar memory overrides the centroid (Medin & Schaffer 1978).`,
    explanation: `Prototype models only represent central tendencies; they cannot maintain exception pockets without distorting the centroid. Exemplar models excel whenever exception learning is required.`,
    fsrsParameters: { ...exceptParams, retrievabilityTarget: 0.9 },
    tags: ['categorization', 'gcm', 'exemplar-exception', setId],
  })

  // 3. Typicality Gradient Card
  const typParams = calibrateCategorizationFsrsParameters({
    cardType: 'typicality_gradient',
    typicality: 5.0,
    criBaseline,
  })
  cards.push({
    id: `fsrs-proto-${setId}-typicality`,
    cardType: 'typicality_gradient',
    front: `[Typicality Gradient: ${setTitle}]\nWhy does verification response time correlate directly with Eleanor Rosch's 1-7 typicality scale, and how does this contradict classical Aristotelian category theory?`,
    back: `Classical Aristotelian categories assume binary, all-or-nothing membership governed by necessary and sufficient features. Human cognition instead demonstrates graded structure: prototypical members share maximal attributes with the category and minimal with contrast classes (Rosch & Mervis 1975).`,
    explanation: `Typicality gradients reflect differential distance in psychological space. Robin is verified as a bird faster than penguin because its psychological distance to the bird centroid is minimal.`,
    fsrsParameters: { ...typParams, retrievabilityTarget: 0.9 },
    tags: ['categorization', 'rosch', 'typicality-gradient', setId],
  })

  // 4. Attention Strategy Card
  const attParams = calibrateCategorizationFsrsParameters({
    cardType: 'attention_strategy',
    criBaseline,
  })
  const dimNote =
    options.attendedDimension !== undefined
      ? `Dimension ${options.attendedDimension + 1}`
      : 'the diagnostic dimension'
  cards.push({
    id: `fsrs-proto-${setId}-attention`,
    cardType: 'attention_strategy',
    front: `[Attention Strategy: ${setTitle}]\nIn the Generalized Context Model (Nosofsky 1986), what mathematical operation represents selective attention, and how does weighting ${dimNote} warp psychological space?`,
    back: `Attention weights w_m scale the distance formula: d_ij = c * (sum w_m |x_im - x_jm|^r)^(1/r) with sum w_m = 1. Concentrating attention on a diagnostic dimension stretches that axis in psychological space while collapsing non-diagnostic variation, sharpening category discrimination.`,
    explanation: `Selective attention is a psychological distance multiplier. Weighting a dimension increases the perceived distance between items differing on that dimension.`,
    fsrsParameters: { ...attParams, retrievabilityTarget: 0.9 },
    tags: ['categorization', 'gcm', 'attention-weights', setId],
  })

  // 5. Boundary Fuzziness Card
  const fuzzParams = calibrateCategorizationFsrsParameters({
    cardType: 'boundary_fuzziness',
    normalizedFuzziness: options.fuzzinessIndex ?? 0.6,
    criBaseline,
  })
  const borderlineNote =
    options.borderlineStimuli && options.borderlineStimuli.length > 0
      ? ` (borderline items: ${options.borderlineStimuli.slice(0, 3).join(', ')})`
      : ''
  cards.push({
    id: `fsrs-proto-${setId}-boundary-fuzziness`,
    cardType: 'boundary_fuzziness',
    front: `[Boundary Fuzziness: ${setTitle}]\nWhat does high Shannon boundary entropy (H(x) -> 1.0) indicate about a stimulus on the category decision surface${borderlineNote}?`,
    back: `High boundary entropy reflects maximum ambiguity where membership probabilities approach parity (P(A) ~ P(B) ~ 0.50). These borderline items represent the discriminating frontier where feedback produces maximum learning gain and cognitive restructuring (Zadeh 1965, Hampton 1998).`,
    explanation: `Items on the boundary have diffuse membership. Practicing boundary contrasts forces the cognitive system to calibrate its decision criterion or store disambiguating exemplars.`,
    fsrsParameters: { ...fuzzParams, retrievabilityTarget: 0.9 },
    tags: ['categorization', 'fuzziness', 'boundary-entropy', setId],
  })

  // 6. Dual-System Arbitration Card
  const covisParams = calibrateCategorizationFsrsParameters({
    cardType: 'dual_system_arbitration',
    criBaseline,
  })
  cards.push({
    id: `fsrs-proto-${setId}-covis`,
    cardType: 'dual_system_arbitration',
    front: `[Dual-System Arbitration: ${setTitle}]\nAccording to Ashby's COVIS theory (1998), what differentiates the prefrontal explicit verbal system from the striatal implicit procedural system during category learning?`,
    back: `The explicit verbal system tests conscious, verbalizable hypothesis rules with executive working memory (win-stay, lose-shift). The implicit procedural system integrates continuous multi-dimensional information through striatal dopamine reinforcement learning, gradually consolidating into automaticity without conscious verbalization.`,
    explanation: `Rule-based categories activate the prefrontal/anterior cingulate circuit. Information-integration categories require procedural learning in the basal ganglia where verbal rules fail.`,
    fsrsParameters: { ...covisParams, retrievabilityTarget: 0.9 },
    tags: ['categorization', 'covis', 'dual-system', setId],
  })

  let totalStab = 0
  let totalDiff = 0
  let hardestCardId = cards[0]!.id
  let maxDiff = -1

  for (const c of cards) {
    totalStab += c.fsrsParameters.stability
    totalDiff += c.fsrsParameters.difficulty
    if (c.fsrsParameters.difficulty > maxDiff) {
      maxDiff = c.fsrsParameters.difficulty
      hardestCardId = c.id
    }
  }

  return {
    deckId: `deck-cat-${setId}-${Date.now()}`,
    setId,
    setTitle,
    generatedAt: new Date().toISOString(),
    criBaseline,
    cardCount: cards.length,
    cards,
    fsrsSummary: {
      meanStabilityDays: Math.round((totalStab / cards.length) * 10) / 10,
      meanDifficulty: Math.round((totalDiff / cards.length) * 10) / 10,
      hardestCardId,
    },
  }
}
