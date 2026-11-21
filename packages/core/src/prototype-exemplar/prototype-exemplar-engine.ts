/**
 * Prototype & Exemplar Categorization Engine
 *
 * Grounded in:
 * - Eleanor Rosch (1975) "Cognitive Representations of Semantic Categories",
 *   Journal of Experimental Psychology: General, 104(3), 192-233.
 *   Typicality norms: members of natural categories are graded, not equal —
 *   a robin is verified faster and rated a "better" bird than a penguin
 *   (Rosch's Appendix norms, 1 = very good example … 7 = very poor example),
 *   and category-name priming speeds typicality-graded verification decisions.
 * - Rosch & Carolyn Mervis (1975) "Family Resemblances: Studies in the Internal
 *   Structure of Categories", Cognitive Psychology, 7(4), 573-605.
 *   Family resemblance: an item's centrality is the summed attribute-sharing
 *   with the other members of its category; no single feature is necessary.
 * - Michael I. Posner & Stephen W. Keele (1968, 1970) "On the Genesis of
 *   Abstract Ideas" / "Retention of Abstract Ideas". After training on
 *   distorted patterns, learners classify the never-seen prototype about as
 *   well as trained items — the prototype-abstraction effect.
 * - Steven K. Reed (1972) "Pattern Recognition and Categorization",
 *   Cognitive Psychology, 3(3), 382-407 — first head-to-head comparison of
 *   averaging (prototype) vs stored-instance (exemplar) classification rules.
 * - Douglas L. Medin & Marguerite M. Schaffer (1978) "Context Theory of
 *   Classification Learning", Psychological Review, 85(3), 207-238 — the 5-4
 *   binary category structure (as reproduced in Smith & Minda 2000, Table 1,
 *   and Chen et al. 2024, Table 1): exemplar storage captures the A/B
 *   asymmetry that a pure prototype summary misses.
 * - Robert M. Nosofsky (1986) "Attention, Similarity, and the
 *   Identification-Categorization Relationship", JEP: General, 115(1), 39-57.
 *   The Generalized Context Model (GCM): attention-weighted Minkowski
 *   distance, exponential similarity gradient, exemplar-sum classification.
 *   Separable dimensions fit with r = 1 (city-block); integral with r = 2.
 * - Roger N. Shepard (1987) "Toward a Universal Law of Generalization for
 *   Psychological Science", Science, 237, 1317-1323 — the exponential
 *   similarity gradient η = exp(−c·d).
 * - F. Gregory Ashby & Randy E. Gott (1988) "Decision Rules in the Perception
 *   and Categorization of Multidimensional Stimuli", JEP: Learning, Memory,
 *   and Cognition, 14(1), 56-77 — rule-based (decision-bound) strategies as
 *   the third family of categorization representations.
 *
 * Quantitative telemetry:
 * - TSC: Typicality Sensitivity Correlation (0-100) — Pearson r (×100) between
 *   the learner's 1-7 typicality ratings and normative (Rosch 1975) or
 *   model-predicted ratings. Typicality gradients are the classic signature of
 *   probabilistic category representations.
 * - CTS: Classification Transfer Score (0-100) — accuracy on never-studied
 *   transfer items (falls back to overall accuracy when none were classified).
 * - MCD: Model Consistency Diagnostic (0-100) — share of classification
 *   choices reproduced by the better-fitting formal model.
 * - CRI: Categorical Representation Index = 0.35·TSC + 0.40·CTS + 0.25·MCD.
 * - 4 Maturity Bands: featural_guesser, typicality_sensate, boundary_tracer,
 *   dual_model_theorist.
 *
 * Purity: every function here is deterministic and side-effect free — no I/O,
 * no clocks, no randomness. Model fitting is a bounded exhaustive grid search,
 * so repeated calls on identical input return identical output (unit-testable).
 */

import { z } from 'zod'

import { clamp } from '../math'

// TD-05: scenario corpora (canonical category sets) are CONTENT, not logic — they
// live in ./content.ts so engine diffs stay about algorithms. The engine still
// consumes CANONICAL_CATEGORIZATION_SETS and re-exports the whole corpus, so every
// existing import path keeps working (the barrel does `export * from` this file).
import { CANONICAL_CATEGORIZATION_SETS } from './content'

export {
  BIRD_TYPICALITY_SET,
  PROTOTYPE_DISTORTION_SET,
  FIVE_FOUR_STRUCTURE_SET,
  NOSOFSKY_ATTENTION_SET,
  RULE_BOUNDARY_SET,
  CANONICAL_CATEGORIZATION_SETS,
  defineStimulus,
} from './content'

// ── Enumerations & Schemas ───────────────────────────────────────────────────

export const categoryEnum = z.enum(['A', 'B'])
export type Category = z.infer<typeof categoryEnum>

export const structureKindEnum = z.enum([
  /** Natural categories with Rosch-style typicality norms (binary attributes). */
  'natural_typicality',
  /** Artificial multidimensional categories studied from distortions. */
  'artificial_dimensional',
  /** Binary-dimensional structures in the Medin & Schaffer tradition. */
  'binary_structure',
  /** Linear decision-bound problems where a simple rule separates categories. */
  'rule_boundary',
])
export type StructureKind = z.infer<typeof structureKindEnum>

export const stimulusSchema = z.object({
  id: z.string(),
  label: z.string(),
  /**
   * Feature vector on the set's dimensions (continuous 0-1) or binary
   * attribute indicators (0/1). Order matches `dimensionLabels`.
   */
  features: z.array(z.number().min(0).max(1)).min(1),
  category: categoryEnum,
  /**
   * Normative typicality on Rosch's (1975) 1-7 scale when the literature
   * reports it (1 = very good example, 7 = very poor example). Optional —
   * items without norms are scored against model predictions instead.
   */
  normativeTypicality: z.number().min(1).max(7).optional(),
  /** True when the item appears only at test time (never studied). */
  isTransfer: z.boolean().default(false),
})
export type Stimulus = z.infer<typeof stimulusSchema>

export const decisionRuleSchema = z.object({
  /** Index into `dimensionLabels` of the rule dimension. */
  dimensionIndex: z.number().int().min(0),
  /** Criterion value on the normalized 0-1 scale. */
  threshold: z.number().min(0).max(1),
  /** 'above' routes values ≥ threshold to `categoryIfTrue`, 'below' < threshold. */
  direction: z.enum(['above', 'below']),
  categoryIfTrue: categoryEnum,
  /** Human-readable statement of the rule (shown to the learner at test). */
  description: z.string(),
})
export type DecisionRule = z.infer<typeof decisionRuleSchema>

export const categorySetSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain: z.string(),
  difficulty: z.enum(['introductory', 'intermediate', 'advanced']),
  structureKind: structureKindEnum,
  /** One label per feature dimension (or attribute name for binary sets). */
  dimensionLabels: z.array(z.string()).min(1),
  categoryLabels: z.object({ A: z.string(), B: z.string() }),
  /** Research-grounded framing shown before the study phase. */
  pedagogicalFraming: z.string(),
  /** Items shown with their category labels during the study phase. */
  studyItems: z.array(stimulusSchema).min(1),
  /** Old + transfer items presented for rating and classification at test. */
  testItems: z.array(stimulusSchema).min(1),
  /** Optional explicit linear rule (Ashby & Gott 1988 rule-boundary sets). */
  decisionRule: decisionRuleSchema.optional(),
})
export type CategorySet = z.infer<typeof categorySetSchema>

export const similarityParamsSchema = z.object({
  /** Sensitivity/specificity of the exponential similarity gradient (Shepard 1987). */
  c: z.number().min(0.05).max(20),
  /** Minkowski exponent: 1 = city-block (separable dims), 2 = euclidean (integral). */
  r: z.union([z.literal(1), z.literal(2)]),
  /** Attention weights per dimension (Nosofsky 1986); normalized to sum 1. */
  weights: z.array(z.number().min(0).max(1)).min(1),
  /** Response-scaling exponent on similarities (γ); 1 = the plain GCM ratio. */
  gamma: z.number().min(0.5).max(10).default(1),
})
export type SimilarityParams = z.infer<typeof similarityParamsSchema>

export const categorizationSubmissionSchema = z.object({
  setId: z.string(),
  /** stimulusId → learner's typicality rating on Rosch's 1-7 scale. */
  typicalityRatings: z.record(z.string(), z.number().int().min(1).max(7)).default({}),
  /** stimulusId → the category the learner assigned at test. */
  classifications: z.record(z.string(), categoryEnum).default({}),
})
export type CategorizationSubmission = z.infer<typeof categorizationSubmissionSchema>
/**
 * Input shape (both records optional — they default to empty at the zod
 * boundary). Use this for direct engine calls; HTTP callers go through the
 * schema anyway.
 */
export type CategorizationSubmissionInput = z.input<typeof categorizationSubmissionSchema>

export const modelFitSchema = z.object({
  /** Fitted/assumed parameters (see {@link similarityParamsSchema}). */
  parameters: similarityParamsSchema,
  /** Σ ln P_model(observed choice | stimulus) — higher fits the learner better. */
  logLikelihood: z.number(),
  /** Akaike information criterion: 2k − 2LL (lower = better, penalizes k). */
  aic: z.number(),
  /** Bayesian information criterion: k·ln(n) − 2LL (lower = better). */
  bic: z.number(),
  /** Share of observed choices reproduced by this model (0-1). */
  agreement: z.number().min(0).max(1),
})
export type ModelFit = z.infer<typeof modelFitSchema>

export const modelComparisonSchema = z.object({
  prototype: modelFitSchema,
  exemplar: modelFitSchema,
  betterRepresentation: z.enum(['prototype', 'exemplar', 'tie']),
  /** ΔLL = LL_exemplar − LL_prototype; > 0 favors exemplars (Medin & Schaffer). */
  logLikelihoodGap: z.number(),
  interpretation: z.string(),
  /** Present only for rule_boundary sets (Ashby & Gott 1988). */
  ruleFit: modelFitSchema.optional(),
})
export type ModelComparison = z.infer<typeof modelComparisonSchema>

export const itemDiagnosticSchema = z.object({
  stimulusId: z.string(),
  label: z.string(),
  isTransfer: z.boolean(),
  trueCategory: categoryEnum,
  learnerCategory: categoryEnum.optional(),
  isCorrect: z.boolean().optional(),
  /** Prototype-model P(category A | item) with canonical parameters. */
  prototypePA: z.number().min(0).max(1),
  /** GCM P(category A | item) with canonical parameters. */
  gcmPA: z.number().min(0).max(1),
  /** Explicit-rule P(category A | item) when the set declares one. */
  rulePA: z.number().min(0).max(1).optional(),
  /** Model-predicted typicality rating (1 = very good example … 7 = very poor). */
  predictedTypicality: z.number().min(1).max(7),
  learnerTypicality: z.number().min(1).max(7).optional(),
  normativeTypicality: z.number().min(1).max(7).optional(),
})
export type ItemDiagnostic = z.infer<typeof itemDiagnosticSchema>

export const categorizationEvaluationSchema = z.object({
  setId: z.string(),
  setTitle: z.string(),
  /** Typicality Sensitivity Correlation, 0-100. */
  tsc: z.number().min(0).max(100),
  /** Whether TSC was computed against Rosch norms or model predictions. */
  typicalityReference: z.enum(['normative', 'model', 'insufficient_ratings']),
  /** Classification Transfer Score, 0-100. */
  cts: z.number().min(0).max(100),
  /** Overall classification accuracy (old + transfer), 0-100. */
  overallAccuracy: z.number().min(0).max(100),
  /** Model Consistency Diagnostic, 0-100. */
  mcd: z.number().min(0).max(100),
  /** Categorical Representation Index, 0-100. */
  cri: z.number().min(0).max(100),
  maturityBand: z.enum([
    'featural_guesser',
    'typicality_sensate',
    'boundary_tracer',
    'dual_model_theorist',
  ]),
  modelComparison: modelComparisonSchema,
  itemDiagnostics: z.array(itemDiagnosticSchema),
  /** Items where prototype and exemplar models diverge most, sorted descending. */
  divergentItems: z.array(
    z.object({
      stimulusId: z.string(),
      label: z.string(),
      prototypePA: z.number(),
      gcmPA: z.number(),
      /** |P_prototype − P_gcm| with canonical parameters. */
      divergence: z.number(),
    }),
  ),
  /** Share of never-seen transfer items the learner classified correctly. */
  transferAccuracy: z.number().min(0).max(100),
  strengths: z.array(z.string()),
  vulnerabilities: z.array(z.string()),
  pedagogicalFeedback: z.array(z.string()),
})
export type CategorizationEvaluation = z.infer<typeof categorizationEvaluationSchema>

export const discriminatingTrialPlanSchema = z.object({
  setId: z.string(),
  trials: z.array(
    z.object({
      stimulusId: z.string(),
      label: z.string(),
      isTransfer: z.boolean(),
      /** max(|P_proto − P_gcm|, |P_rule − P_gcm|) — how diagnostic the trial is. */
      divergence: z.number(),
      rationale: z.string(),
    }),
  ),
  note: z.string(),
})
export type DiscriminatingTrialPlan = z.infer<typeof discriminatingTrialPlanSchema>

export const categorizationDeckSchema = z.object({
  setId: z.string(),
  setTitle: z.string(),
  criBaseline: z.number(),
  cards: z.array(
    z.object({
      id: z.string(),
      cardType: z.enum([
        'typicality_gradient',
        'prototype_abstraction',
        'exemplar_exception',
        'attention_strategy',
      ]),
      front: z.string(),
      back: z.string(),
      fsrsParameters: z.object({
        stability: z.number(),
        difficulty: z.number(),
      }),
    }),
  ),
})
export type CategorizationDeck = z.infer<typeof categorizationDeckSchema>

// ── Distance & Similarity Math (Shepard 1987; Nosofsky 1986) ─────────────────

/** Round to `digits` decimals (deterministic output hygiene for comparisons). */
function roundTo(value: number, digits = 4): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function normalizeWeights(weights: number[], dimCount: number): number[] {
  const raw = weights.length === dimCount ? weights : new Array(dimCount).fill(1 / dimCount)
  const sum = raw.reduce((acc, w) => acc + w, 0)
  if (sum <= 0 || !Number.isFinite(sum)) return new Array(dimCount).fill(1 / dimCount)
  return raw.map((w) => w / sum)
}

/**
 * Attention-weighted Minkowski distance (Nosofsky 1986, Eq. 1):
 * `d(x,y) = (Σ_m w_m · |x_m − y_m|^r)^(1/r)` with `w_m ≥ 0, Σ w_m = 1`.
 * r = 1 (city-block) fits separable dimensions; r = 2 (euclidean) fits
 * integral dimensions — the choice changes classification predictions.
 */
export function minkowskiDistance(a: number[], b: number[], r = 2, weights?: number[]): number {
  const dimCount = Math.min(a.length, b.length)
  const w = normalizeWeights(weights ?? [], dimCount)
  let acc = 0
  for (let m = 0; m < dimCount; m++) {
    acc += w[m]! * Math.abs((a[m] ?? 0) - (b[m] ?? 0)) ** r
  }
  return acc ** (1 / r)
}

/**
 * Exponential similarity gradient (Shepard 1987): `η = exp(−c·d)`.
 * The gradient is the "universal law" generalization kernel — flat far away,
 * steep near the reference point, with sensitivity `c` controlling the slope.
 */
export function exponentialSimilarity(distance: number, sensitivity: number): number {
  return Math.exp(-sensitivity * distance)
}

// ── Representation Models ────────────────────────────────────────────────────

/** Per-dimension arithmetic mean — the category prototype (Reed 1972). */
export function computePrototypeVector(exemplarFeatures: number[][]): number[] {
  if (exemplarFeatures.length === 0) return []
  const dimCount = exemplarFeatures[0]!.length
  const sums = new Array(dimCount).fill(0)
  for (const exemplar of exemplarFeatures) {
    for (let m = 0; m < dimCount; m++) sums[m]! += exemplar[m] ?? 0
  }
  return sums.map((s) => s / exemplarFeatures.length)
}

function similaritiesTo(
  features: number[],
  exemplarFeatures: number[][],
  params: Pick<SimilarityParams, 'c' | 'r' | 'weights'>,
): number[] {
  return exemplarFeatures.map((exemplar) =>
    exponentialSimilarity(
      minkowskiDistance(features, exemplar, params.r, params.weights),
      params.c,
    ),
  )
}

/**
 * Generalized Context Model classification probability (Nosofsky 1986):
 * `P(A|x) = Σ_{y∈A} η(x,y)^γ / (Σ_{y∈A} η(x,y)^γ + Σ_{y∈B} η(x,y)^γ)`.
 * Classification is a similarity-weighted vote of ALL stored exemplars —
 * which is why atypical exemplars can pull predictions that a category
 * average alone cannot produce (Medin & Schaffer 1978).
 */
export function gcmProbabilityA(
  features: number[],
  exemplarsA: number[][],
  exemplarsB: number[][],
  params: SimilarityParams,
): number {
  const numA = similaritiesTo(features, exemplarsA, params).reduce(
    (a, s) => a + s ** params.gamma,
    0,
  )
  const numB = similaritiesTo(features, exemplarsB, params).reduce(
    (a, s) => a + s ** params.gamma,
    0,
  )
  const total = numA + numB
  if (total <= 0) return 0.5
  return roundTo(numA / total, 6)
}

/**
 * Prototype (averaging) classification rule (Reed 1972; Posner & Keele 1968):
 * compare the item only to each category's summary prototype.
 */
export function prototypeProbabilityA(
  features: number[],
  prototypeA: number[],
  prototypeB: number[],
  params: SimilarityParams,
): number {
  const paramsFull: SimilarityParams = { ...params }
  const simA =
    exponentialSimilarity(
      minkowskiDistance(features, prototypeA, paramsFull.r, paramsFull.weights),
      paramsFull.c,
    ) ** paramsFull.gamma
  const simB =
    exponentialSimilarity(
      minkowskiDistance(features, prototypeB, paramsFull.r, paramsFull.weights),
      paramsFull.c,
    ) ** paramsFull.gamma
  const total = simA + simB
  if (total <= 0) return 0.5
  return roundTo(simA / total, 6)
}

/**
 * Explicit unidimensional decision rule (Ashby & Gott 1988): P(A|x) ∈ {0, 1}.
 * Values exactly at the threshold route to `rule.categoryIfTrue`. Rule-based
 * categorization is confident far from the exemplar cloud where exemplar
 * similarity is unreliable — the model families diverge exactly there.
 */
export function ruleProbabilityA(features: number[], rule: DecisionRule): number {
  const value = features[rule.dimensionIndex] ?? 0
  const goesToTrue = rule.direction === 'above' ? value >= rule.threshold : value < rule.threshold
  return goesToTrue ? (rule.categoryIfTrue === 'A' ? 1 : 0) : rule.categoryIfTrue === 'A' ? 0 : 1
}

// ── Typicality Machinery (Rosch 1975; Rosch & Mervis 1975) ───────────────────

function featuresEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, m) => v === b[m])
}

/**
 * Family resemblance score (Rosch & Mervis 1975): the summed count of
 * (binary) attributes the item shares with each other member of its category.
 * Features count as "present" when ≥ 0.5. This is the canonical centrality
 * measure behind the typicality gradient: robins share many attributes with
 * other birds; penguins share almost nothing but "has feathers".
 *
 * @param itemFeatures the evaluated item's binary/indicator vector
 * @param ownExemplarFeatures OTHER members of the item's category (exclude the
 *   item itself when it is part of the study list — self-sharing inflates FR)
 */
export function familyResemblance(itemFeatures: number[], ownExemplarFeatures: number[][]): number {
  let score = 0
  for (const other of ownExemplarFeatures) {
    for (let m = 0; m < Math.min(itemFeatures.length, other.length); m++) {
      if ((itemFeatures[m] ?? 0) >= 0.5 && (other[m] ?? 0) >= 0.5) score += 1
    }
  }
  return score
}

/**
 * Predicted typicality rating on Rosch's (1975) 1-7 scale (1 = very good
 * example, 7 = very poor example), relative to the item's category.
 *
 * - 'family-resemblance' scale: Rosch & Mervis (1975) attribute-sharing
 *   centrality. Use for binary attribute sets (natural categories, 5-4
 *   structure).
 * - 'similarity' scale: mean exponential similarity to the category's
 *   exemplars (Reed 1972 averaging logic) — use for continuous dimensional
 *   sets.
 *
 * Centrality is min-max normalized over the category's exemplar pool PLUS the
 * evaluated item, then mapped to the 1-7 scale. Min-max (rather than
 * divide-by-max) normalization is what keeps the gradient linear: divide-by-
 * max saturates ratings toward 1 whenever any single member dominates the
 * category. An item more central than every pool member still maps to 1
 * (clamped); an item less central than everyone maps to 7. An empty pool
 * (the item is the only known member) rates 1 by definition.
 */
export function predictedTypicalityRating(
  itemFeatures: number[],
  categoryExemplarFeatures: number[][],
  params: Pick<SimilarityParams, 'c' | 'r' | 'weights'>,
  scale: 'family-resemblance' | 'similarity',
): number {
  const others = categoryExemplarFeatures.filter((f) => !featuresEqual(itemFeatures, f))
  if (others.length === 0) return 1

  const itemCentrality =
    scale === 'family-resemblance'
      ? familyResemblance(itemFeatures, others)
      : similaritiesTo(itemFeatures, others, params).reduce((a, s) => a + s, 0) / others.length

  const poolCentralities = others.map((other) => {
    const poolOthers = others.filter((f) => !featuresEqual(other, f))
    if (poolOthers.length === 0) return scale === 'family-resemblance' ? 0 : 0
    return scale === 'family-resemblance'
      ? familyResemblance(other, poolOthers)
      : similaritiesTo(other, poolOthers, params).reduce((a, s) => a + s, 0) / poolOthers.length
  })

  const centralities = [...poolCentralities, itemCentrality]
  const min = Math.min(...centralities)
  const max = Math.max(...centralities)
  if (max <= min) return 4
  const normalized = (itemCentrality - min) / (max - min)
  return clamp(Math.round(1 + 6 * (1 - normalized)), 1, 7)
}

/**
 * Pearson product-moment correlation. Returns null when either array has
 * fewer than 2 entries or zero variance (a constant series carries no
 * gradient information — callers decide the fallback semantics).
 */
export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return null
  const meanX = xs.slice(0, n).reduce((a, v) => a + v, 0) / n
  const meanY = ys.slice(0, n).reduce((a, v) => a + v, 0) / n
  let cov = 0
  let varX = 0
  let varY = 0
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] ?? 0) - meanX
    const dy = (ys[i] ?? 0) - meanY
    cov += dx * dy
    varX += dx * dx
    varY += dy * dy
  }
  if (varX <= 0 || varY <= 0) return null
  return clamp(cov / Math.sqrt(varX * varY), -1, 1)
}

// ── Deterministic Model Fitting (grid search) ────────────────────────────────

export interface ObservedTrial {
  features: number[]
  /** The category the learner actually chose on this trial. */
  chosen: Category
}

export interface FitOptions {
  /** Exhaustive weight lattice when dimensionCount ≤ 4 (Nosofsky 1986 fitting). */
  fitAttentionWeights: boolean
  /** Attention weight factors per dimension before normalization. */
  weightLattice: number[]
  /** Sensitivity grid for the exponential gradient. */
  sensitivityGrid: number[]
  /** Prototype response-scaling grid (γ). GCM is fit with γ = 1. */
  gammaGrid: number[]
}

const DEFAULT_FIT_OPTIONS: FitOptions = {
  fitAttentionWeights: true,
  weightLattice: [0.25, 0.5, 1, 2, 4],
  sensitivityGrid: [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8],
  gammaGrid: [1, 2, 3],
}

const LL_FLOOR = 1e-9

function fitStatistics(
  params: SimilarityParams,
  trials: ObservedTrial[],
  predict: (features: number[], params: SimilarityParams) => number,
  freeParamCount: number,
): ModelFit {
  let ll = 0
  let hits = 0
  for (const trial of trials) {
    const pA = predict(trial.features, params)
    const pChosen = clamp(trial.chosen === 'A' ? pA : 1 - pA, LL_FLOOR, 1 - LL_FLOOR)
    ll += Math.log(pChosen)
    const predicted = pA >= 0.5 ? 'A' : 'B'
    if (predicted === trial.chosen) hits += 1
  }
  const k = freeParamCount
  return {
    parameters: params,
    logLikelihood: roundTo(ll, 4),
    aic: roundTo(2 * k - 2 * ll, 4),
    bic: roundTo(k * Math.log(Math.max(trials.length, 1)) - 2 * ll, 4),
    agreement: trials.length > 0 ? roundTo(hits / trials.length, 4) : 0,
  }
}

/** Enumerate normalized weight vectors from the factor lattice (sum = 1). */
function enumerateWeightVectors(dimCount: number, lattice: number[]): number[][] {
  if (dimCount === 1) return [[1]]
  const combos: number[][] = []
  const product = (prefix: number[], remaining: number): void => {
    if (remaining === 0) {
      const sum = prefix.reduce((a, v) => a + v, 0)
      combos.push(prefix.map((v) => v / sum))
      return
    }
    for (const factor of lattice) product([...prefix, factor], remaining - 1)
  }
  product([], dimCount)
  return combos
}

/**
 * Fit the GCM (Nosofsky 1986) to observed classification choices by bounded
 * exhaustive grid search over sensitivity c, Minkowski exponent r and — when
 * `fitAttentionWeights` is on and dimensionCount ≤ 4 — the attention-weight
 * simplex lattice. Free parameters k = 1 (c) + 1 (r choice) + (D − 1 when
 * weights are fitted). Deterministic: identical input → identical output.
 */
export function fitGcmParameters(
  trials: ObservedTrial[],
  exemplarsA: number[][],
  exemplarsB: number[][],
  dimCount: number,
  options: Partial<FitOptions> = {},
): ModelFit {
  if (trials.length === 0) {
    return fitStatistics(
      { c: 3, r: 2, weights: normalizeWeights([], dimCount), gamma: 1 },
      [],
      () => 0.5,
      dimCount,
    )
  }
  const opts: FitOptions = { ...DEFAULT_FIT_OPTIONS, ...options }
  const useWeights = opts.fitAttentionWeights && dimCount <= 4
  const weightVectors = useWeights
    ? enumerateWeightVectors(dimCount, opts.weightLattice)
    : [normalizeWeights([], dimCount)]
  const rOptions: Array<1 | 2> = [1, 2]

  let best: ModelFit | null = null
  for (const r of rOptions) {
    for (const c of opts.sensitivityGrid) {
      for (const weights of weightVectors) {
        const params: SimilarityParams = { c, r, weights, gamma: 1 }
        const fit = fitStatistics(
          params,
          trials,
          (features, p) => gcmProbabilityA(features, exemplarsA, exemplarsB, p),
          useWeights ? 1 + 1 + (dimCount - 1) : 2,
        )
        if (!best || fit.logLikelihood > best.logLikelihood) best = fit
      }
    }
  }
  return best!
}

/**
 * Fit the prototype (averaging) model (Reed 1972) by grid search over
 * sensitivity c and response scaling γ (r = 2, uniform weights — a summary
 * representation has no selective attention over instances). Free k = 2.
 */
export function fitPrototypeParameters(
  trials: ObservedTrial[],
  exemplarsA: number[][],
  exemplarsB: number[][],
  options: Partial<FitOptions> = {},
): ModelFit {
  if (trials.length === 0) {
    return fitStatistics({ c: 3, r: 2, weights: [0.5, 0.5], gamma: 1 }, [], () => 0.5, 2)
  }
  const opts: FitOptions = { ...DEFAULT_FIT_OPTIONS, ...options }
  const protoA = computePrototypeVector(exemplarsA)
  const protoB = computePrototypeVector(exemplarsB)
  const dimCount = Math.max(protoA.length, protoB.length, 1)
  let best: ModelFit | null = null
  for (const c of opts.sensitivityGrid) {
    for (const gamma of opts.gammaGrid) {
      const params: SimilarityParams = { c, r: 2, weights: normalizeWeights([], dimCount), gamma }
      const fit = fitStatistics(
        params,
        trials,
        (features, p) => prototypeProbabilityA(features, protoA, protoB, p),
        2,
      )
      if (!best || fit.logLikelihood > best.logLikelihood) best = fit
    }
  }
  return best!
}

// ── Canonical Parameter Defaults ─────────────────────────────────────────────

/**
 * Canonical prediction parameters per structure kind: binary attribute sets
 * (separable features) use the city-block metric r = 1; continuous
 * dimensional sets use the euclidean metric r = 2 (Nosofsky 1986); the
 * sensitivity c = 3 is a mid-gradient compromise and attention is uniform.
 */
export function canonicalParams(
  set: Pick<CategorySet, 'structureKind'>,
  dimCount: number,
): SimilarityParams {
  const r: 1 | 2 =
    set.structureKind === 'natural_typicality' || set.structureKind === 'binary_structure' ? 1 : 2
  return { c: 3, r, weights: normalizeWeights([], dimCount), gamma: 1 }
}

/**
 * Stored-exemplar feature vectors for a category. Only STUDY items form the
 * representation (classification and typicality predictions are made against
 * what was studied — never against the test items being classified, which
 * would leak the answer through self-similarity).
 */
function exemplarFeaturesFor(
  set: CategorySet,
  category: Category,
  excludeStimulusId?: string,
): number[][] {
  return set.studyItems
    .filter((s) => s.category === category && s.id !== excludeStimulusId)
    .map((s) => s.features)
}

// ── Session Evaluation ───────────────────────────────────────────────────────

function typicalityScaleFor(set: CategorySet): 'family-resemblance' | 'similarity' {
  return set.structureKind === 'natural_typicality' || set.structureKind === 'binary_structure'
    ? 'family-resemblance'
    : 'similarity'
}

function predictedTypicalityFor(
  set: CategorySet,
  stimulus: Stimulus,
  params: SimilarityParams,
): number {
  const scale = typicalityScaleFor(set)
  return predictedTypicalityRating(
    stimulus.features,
    exemplarFeaturesFor(set, stimulus.category),
    params,
    scale,
  )
}

/**
 * Evaluate a complete categorization session against the two formal
 * representation models.
 *
 * What is computed and why:
 * 1. TSC — the learner's typicality ratings are correlated with Rosch (1975)
 *    norms when ≥ 3 rated items carry norms, otherwise with the engine's
 *    model predictions (Rosch & Mervis 1975 family resemblance for binary
 *    sets, Reed 1972 similarity averaging for dimensional sets). A strong
 *    positive correlation is the behavioral fingerprint of a probabilistic
 *    category representation rather than a memorized list.
 * 2. CTS — accuracy on never-studied transfer items. Generalization, not
 *    recognition, distinguishes abstraction from exemplar memorization
 *    (Posner & Keele 1970).
 * 3. Model comparison — both the prototype model (Reed 1972) and the GCM
 *    (Nosofsky 1986) are fitted to the learner's own classification choices
 *    by deterministic grid search; log-likelihood, AIC and BIC decide which
 *    representation better explains THIS learner (the Medin & Schaffer 1978
 *    methodology on the 5-4 structure).
 * 4. Divergent items — where the two models disagree most; those are the
 *    trials that discriminate representations and make the best review
 *    material.
 *
 * Deterministic: no randomness, no clock — same input, same evaluation.
 */
export function evaluateCategorizationSession(
  set: CategorySet,
  submission: CategorizationSubmissionInput,
): CategorizationEvaluation {
  const parsed = categorizationSubmissionSchema.parse(submission)
  const dimCount = Math.max(...[...set.studyItems, ...set.testItems].map((s) => s.features.length))
  const canon = canonicalParams(set, dimCount)
  const protoA = computePrototypeVector(exemplarFeaturesFor(set, 'A'))
  const protoB = computePrototypeVector(exemplarFeaturesFor(set, 'B'))

  const strengths: string[] = []
  const vulnerabilities: string[] = []
  const pedagogicalFeedback: string[] = []

  // ── Per-item diagnostics (classification + typicality) ─────────────────────
  const itemDiagnostics: ItemDiagnostic[] = set.testItems.map((stimulus) => {
    const learnerCategory = parsed.classifications[stimulus.id]
    const predictedTypicality = predictedTypicalityFor(set, stimulus, canon)
    return {
      stimulusId: stimulus.id,
      label: stimulus.label,
      isTransfer: stimulus.isTransfer,
      trueCategory: stimulus.category,
      learnerCategory,
      isCorrect: learnerCategory === undefined ? undefined : learnerCategory === stimulus.category,
      prototypePA: prototypeProbabilityA(stimulus.features, protoA, protoB, canon),
      gcmPA: gcmProbabilityA(
        stimulus.features,
        exemplarFeaturesFor(set, 'A'),
        exemplarFeaturesFor(set, 'B'),
        canon,
      ),
      rulePA: set.decisionRule ? ruleProbabilityA(stimulus.features, set.decisionRule) : undefined,
      predictedTypicality,
      learnerTypicality: parsed.typicalityRatings[stimulus.id],
      normativeTypicality: stimulus.normativeTypicality,
    }
  })

  // ── 1. Typicality Sensitivity Correlation (TSC) ────────────────────────────
  const rated = itemDiagnostics.filter((d) => d.learnerTypicality !== undefined)
  const normativeRated = rated.filter((d) => d.normativeTypicality !== undefined)
  let tsc = 0
  let typicalityReference: CategorizationEvaluation['typicalityReference'] = 'insufficient_ratings'
  let ratingNote = ''
  if (normativeRated.length >= 3) {
    const r = pearsonCorrelation(
      normativeRated.map((d) => d.learnerTypicality!),
      normativeRated.map((d) => d.normativeTypicality!),
    )
    tsc = r === null ? 0 : Math.round(r * 100)
    typicalityReference = 'normative'
    ratingNote = 'Rosch (1975) normative ratings'
  } else if (rated.length >= 3) {
    const r = pearsonCorrelation(
      rated.map((d) => d.learnerTypicality!),
      rated.map((d) => d.predictedTypicality),
    )
    tsc = r === null ? 0 : Math.round(r * 100)
    typicalityReference = 'model'
    ratingNote = 'model-predicted typicality (family resemblance / similarity averaging)'
  } else {
    ratingNote = 'rate at least 3 items to measure a typicality gradient'
  }

  if (typicalityReference !== 'insufficient_ratings' && tsc >= 60) {
    strengths.push(
      `Strong typicality gradient (r = ${(tsc / 100).toFixed(2)} vs ${ratingNote}): your ratings track the graded structure of the category, the classic signature of probabilistic representation (Rosch 1975).`,
    )
  } else if (typicalityReference !== 'insufficient_ratings') {
    vulnerabilities.push(
      'Flat or inverted typicality gradient: your ratings did not follow the graded structure of the category. Contrast the most and least typical members feature by feature (Rosch & Mervis 1975).',
    )
  }

  // ── 2. Classification accuracy & transfer ──────────────────────────────────
  const classified = itemDiagnostics.filter((d) => d.isCorrect !== undefined)
  const overallAccuracy =
    classified.length > 0
      ? Math.round((classified.filter((d) => d.isCorrect).length / classified.length) * 100)
      : 0
  const transferTrials = classified.filter((d) => d.isTransfer)
  const cts =
    transferTrials.length > 0
      ? Math.round((transferTrials.filter((d) => d.isCorrect).length / transferTrials.length) * 100)
      : overallAccuracy

  if (transferTrials.length > 0 && cts >= 75) {
    strengths.push(
      `High transfer accuracy (${cts}% on never-studied items): your category knowledge generalizes beyond the studied exemplars (Posner & Keele 1970).`,
    )
  } else if (transferTrials.length > 0) {
    vulnerabilities.push(
      'Transfer errors on novel items: study the dimension structure of your errors — are they concentrated on atypical members near the category boundary?',
    )
  }

  // ── 3. Model comparison on the learner's own choices ───────────────────────
  const observedTrials: ObservedTrial[] = classified.map((d) => ({
    features: set.testItems.find((s) => s.id === d.stimulusId)!.features,
    chosen: d.learnerCategory!,
  }))
  const exemplarFit = fitGcmParameters(
    observedTrials,
    exemplarFeaturesFor(set, 'A'),
    exemplarFeaturesFor(set, 'B'),
    dimCount,
    { fitAttentionWeights: dimCount <= 4 },
  )
  const prototypeFit = fitPrototypeParameters(
    observedTrials,
    exemplarFeaturesFor(set, 'A'),
    exemplarFeaturesFor(set, 'B'),
  )
  const gap = roundTo(exemplarFit.logLikelihood - prototypeFit.logLikelihood, 4)
  const betterRepresentation: ModelComparison['betterRepresentation'] =
    Math.abs(gap) < 0.25 ? 'tie' : gap > 0 ? 'exemplar' : 'prototype'
  const comparisonInterpretation =
    betterRepresentation === 'exemplar'
      ? 'Your choices are better reproduced by the exemplar model (GCM, Nosofsky 1986): similarity-weighted votes of stored instances — including their atypical quirks — explain you better than a category average (Medin & Schaffer 1978).'
      : betterRepresentation === 'prototype'
        ? 'Your choices are better reproduced by the prototype model (Reed 1972): you behave as if you compare items to a category summary, not to a library of stored instances.'
        : 'The two formal models fit your choices equally well — your response pattern does not yet discriminate a prototype from an exemplar representation.'

  let ruleFit: ModelFit | undefined
  let ruleConsistencyNote = ''
  if (set.decisionRule && observedTrials.length > 0) {
    const rule = set.decisionRule
    ruleFit = fitStatistics(
      { c: canon.c, r: canon.r, weights: canon.weights, gamma: 1 },
      observedTrials,
      (features) => ruleProbabilityA(features, rule),
      0,
    )
    ruleConsistencyNote = ` Explicit-rule consistency (Ashby & Gott 1988): ${Math.round(ruleFit.agreement * 100)}% of your choices match the rule "${rule.description}".`
  }

  const bestFit =
    betterRepresentation === 'prototype'
      ? prototypeFit
      : betterRepresentation === 'exemplar'
        ? exemplarFit
        : exemplarFit.agreement >= prototypeFit.agreement
          ? exemplarFit
          : prototypeFit
  const mcd = Math.round(bestFit.agreement * 100)

  if (mcd >= 80) {
    strengths.push(
      `Coherent representation strategy: the better-fitting model reproduces ${mcd}% of your choices.${ruleConsistencyNote}`,
    )
  } else {
    vulnerabilities.push(
      `Mixed strategy signature: the best model reproduces only ${mcd}% of your choices — consistent strategies beat guesswork on boundary items (Ashby & Gott 1988).${ruleConsistencyNote}`,
    )
  }

  // ── 4. Divergent items — where the models disagree ──────────────────────────
  const divergentItems = itemDiagnostics
    .map((d) => ({
      stimulusId: d.stimulusId,
      label: d.label,
      prototypePA: d.prototypePA,
      gcmPA: d.gcmPA,
      divergence: roundTo(
        set.decisionRule
          ? Math.max(
              Math.abs(d.prototypePA - d.gcmPA),
              Math.abs((d.rulePA ?? d.prototypePA) - d.gcmPA),
            )
          : Math.abs(d.prototypePA - d.gcmPA),
        4,
      ),
    }))
    .sort((a, b) => b.divergence - a.divergence || a.stimulusId.localeCompare(b.stimulusId))
    .slice(0, 4)
    .filter((d) => d.divergence >= 0.15)

  // ── 5. Composite index & maturity band ─────────────────────────────────────
  const cri = Math.round(clamp(0.35 * tsc + 0.4 * cts + 0.25 * mcd, 0, 100))
  let maturityBand: CategorizationEvaluation['maturityBand'] = 'featural_guesser'
  if (cri >= 85) maturityBand = 'dual_model_theorist'
  else if (cri >= 65) maturityBand = 'boundary_tracer'
  else if (cri >= 40) maturityBand = 'typicality_sensate'

  if (maturityBand === 'dual_model_theorist') {
    pedagogicalFeedback.push(
      'You operate on categories the way the models do: gradients, transfer, and a discriminated representation. Next step — predict WHICH items the prototype and exemplar accounts disagree about, then test yourself on exactly those (the divergent-item list below).',
    )
  } else if (maturityBand === 'boundary_tracer') {
    pedagogicalFeedback.push(
      'Solid rule-level mastery. To reach dual-model understanding, rate typicality for the divergent items and notice where a category average would mislead you (Medin & Schaffer 1978 exception items).',
    )
  } else if (maturityBand === 'typicality_sensate') {
    pedagogicalFeedback.push(
      'You feel the typicality gradient but classification is inconsistent. Practice classifying ONLY the high-divergence items — the trials where prototype and exemplar predictions split — until your strategy stabilizes.',
    )
  } else {
    pedagogicalFeedback.push(
      'Start by re-studying the exemplars of each category side by side, then classify the five most typical members before touching the atypical ones. Typical members anchor the gradient (Rosch 1975); atypical ones refine it.',
    )
  }
  if (typicalityReference === 'insufficient_ratings') {
    pedagogicalFeedback.push(
      'Typicality ratings were too sparse to measure a gradient — rate at least 3 items on the 1-7 scale to unlock the TSC metric.',
    )
  }

  return {
    setId: set.id,
    setTitle: set.title,
    tsc,
    typicalityReference,
    cts,
    overallAccuracy,
    mcd,
    cri,
    maturityBand,
    modelComparison: {
      prototype: prototypeFit,
      exemplar: exemplarFit,
      betterRepresentation,
      logLikelihoodGap: gap,
      interpretation: comparisonInterpretation,
      ruleFit,
    },
    itemDiagnostics,
    divergentItems,
    transferAccuracy: cts,
    strengths,
    vulnerabilities,
    pedagogicalFeedback,
  }
}

// ── Discriminating Trial Planner ─────────────────────────────────────────────

/**
 * Plan a training/test block of the most model-DIAGNOSTIC trials: test items
 * are ranked by how strongly the prototype and exemplar (and explicit-rule,
 * when present) predictions disagree, descending, with a stable id tie-break.
 *
 * Why: trials where all models agree cannot tell you which representation a
 * learner uses; trials where they split can (Medin & Schaffer 1978 built the
 * 5-4 structure exactly this way). Deterministic ordering makes the plan
 * reproducible and unit-testable.
 */
export function planDiscriminatingBlock(set: CategorySet, maxTrials = 6): DiscriminatingTrialPlan {
  const dimCount = Math.max(...[...set.studyItems, ...set.testItems].map((s) => s.features.length))
  const canon = canonicalParams(set, dimCount)
  const protoA = computePrototypeVector(exemplarFeaturesFor(set, 'A'))
  const protoB = computePrototypeVector(exemplarFeaturesFor(set, 'B'))
  const exemplarsA = exemplarFeaturesFor(set, 'A')
  const exemplarsB = exemplarFeaturesFor(set, 'B')

  const trials = [...set.testItems]
    .map((stimulus) => {
      const pProto = prototypeProbabilityA(stimulus.features, protoA, protoB, canon)
      const pGcm = gcmProbabilityA(stimulus.features, exemplarsA, exemplarsB, canon)
      let divergence = Math.abs(pProto - pGcm)
      let models = 'prototype vs exemplar (GCM)'
      if (set.decisionRule) {
        const pRule = Math.abs(ruleProbabilityA(stimulus.features, set.decisionRule) - pGcm)
        if (pRule > divergence) {
          divergence = pRule
          models = 'explicit rule vs exemplar (GCM)'
        }
      }
      return {
        stimulusId: stimulus.id,
        label: stimulus.label,
        isTransfer: stimulus.isTransfer,
        divergence: roundTo(divergence, 4),
        rationale: `${models} split on this item: P_proto(A) = ${pProto.toFixed(2)}, P_gcm(A) = ${pGcm.toFixed(2)}${set.decisionRule ? `, P_rule(A) = ${ruleProbabilityA(stimulus.features, set.decisionRule).toFixed(2)}` : ''}.`,
      }
    })
    .sort((a, b) => b.divergence - a.divergence || a.stimulusId.localeCompare(b.stimulusId))
    .slice(0, clamp(Math.round(maxTrials), 1, set.testItems.length))

  return {
    setId: set.id,
    trials,
    note: 'Trials ordered by model disagreement — classify these first to discriminate which representation your strategy uses.',
  }
}

// ── FSRS Deck Synthesis ──────────────────────────────────────────────────────

/**
 * Synthesize a review deck from the session: one card per core phenomenon
 * (typicality gradient, prototype abstraction, exemplar exceptions, attention
 * strategy). Card stability scales with the CRI (a better-grounded session
 * earns longer intervals); difficulty scales inversely.
 */
export function generateCategorizationDeck(
  set: CategorySet,
  evaluation: CategorizationEvaluation,
): CategorizationDeck {
  const criFactor = evaluation.cri / 100
  const baseStability = roundTo(4.0 + criFactor * 4.0, 1) // 4.0d → 8.0d
  const baseDifficulty = roundTo(6.5 - criFactor * 2.5, 1) // 6.5 → 4.0

  const labels = set.categoryLabels
  const mostTypical = [...set.studyItems, ...set.testItems]
    .filter((s) => s.category === 'A')
    .sort((a, b) => (a.normativeTypicality ?? 99) - (b.normativeTypicality ?? 99))[0]
  const leastTypical = [...set.studyItems, ...set.testItems]
    .filter((s) => s.category === 'A')
    .sort((a, b) => (b.normativeTypicality ?? 0) - (a.normativeTypicality ?? 0))[0]

  return {
    setId: set.id,
    setTitle: set.title,
    criBaseline: evaluation.cri,
    cards: [
      {
        id: `proto-card-${set.id}-1`,
        cardType: 'typicality_gradient',
        front: `[Typicality Gradient: ${set.title}]\nWhy is a ${mostTypical?.label ?? 'typical member'} a better example of "${labels.A}" than a ${leastTypical?.label ?? 'atypical member'} — and what did Rosch (1975) call this graded structure?`,
        back: `Category membership is graded, not all-or-none. Centrality is family resemblance: summed attribute-sharing with the other members (Rosch & Mervis 1975). ${mostTypical?.label ?? 'Typical members'} share many attributes with the category; ${leastTypical?.label ?? 'atypical members'} share almost nothing but the defining ones.`,
        fsrsParameters: { stability: baseStability, difficulty: baseDifficulty },
      },
      {
        id: `proto-card-${set.id}-2`,
        cardType: 'prototype_abstraction',
        front: `[Prototype Abstraction: ${set.title}]\nAfter training only on distorted patterns, why can learners classify the never-seen prototype (Posner & Keele 1970)?`,
        back: `Repeated exposure to distortions makes the central tendency itself extractable: the averaged prototype is abstracted implicitly and behaves like a stored trace, so the unseen center of the category classifies as well as trained items.`,
        fsrsParameters: {
          stability: roundTo(baseStability * 1.15, 1),
          difficulty: roundTo(baseDifficulty * 0.9, 1),
        },
      },
      {
        id: `proto-card-${set.id}-3`,
        cardType: 'exemplar_exception',
        front: `[Exemplar Exceptions: ${set.title}]\nOn which kind of item does a pure prototype model fail while the exemplar model (GCM) succeeds?`,
        back: `Atypical exception items. The GCM predicts from similarity-weighted votes of ALL stored instances (Nosofsky 1986), so an exceptional member still shapes classification of items near it; a category average is blind to it (Medin & Schaffer 1978, the 5-4 structure).`,
        fsrsParameters: { stability: baseStability, difficulty: baseDifficulty },
      },
      {
        id: `proto-card-${set.id}-4`,
        cardType: 'attention_strategy',
        front: `[Attention Strategy: ${set.title}]\nWhat changes when attention weights shift to one dimension, and what distinguishes a rule-based strategy (Ashby & Gott 1988)?`,
        back: `Attention weights (w_m) re-weight the Minkowski distance, moving the classification boundary without new storage (Nosofsky 1986). A rule-based strategy ignores similarity entirely: it applies a threshold criterion confidently even far outside the exemplar cloud, where exemplar similarity is unreliable.`,
        fsrsParameters: { stability: baseStability, difficulty: baseDifficulty },
      },
    ],
  }
}

// ── Canonical Categorization Scenarios ───────────────────────────────────────

// Corpus moved verbatim to ./content.ts (TD-05 — content, not logic), together with
// the defineStimulus builder the data is expressed through; re-exported below so
// import paths are unchanged.

/** Look up a canonical set by id (falls back to the first canonical set). */
export function findCategorySet(setId: string): CategorySet {
  return (
    CANONICAL_CATEGORIZATION_SETS.find((s) => s.id === setId) ?? CANONICAL_CATEGORIZATION_SETS[0]!
  )
}
