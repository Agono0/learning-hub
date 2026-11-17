import { z } from 'zod'

/**
 * @file Dynamic Self-Regulated Metacognitive Calibration & Hypercorrection Engine.
 *
 * Implements the monitoring-versus-control framework and the hypercorrection
 * crucible that the /metacognition studio renders:
 *
 * 1. Thomas O. Nelson & Louis Narens (1990) "Metamemory: A theoretical framework
 *    and some new findings" — cognition as a two-stream loop:
 *      - **Monitoring** (meta-level → object-level flow of judgments): how
 *        accurately do Judgments of Learning (JOLs) predict recall? Measured
 *        with Goodman & Kruskal's (1954) gamma correlation — the field standard
 *        for metacognitive accuracy (Nelson 1984 recommends γ over Pearson r
 *        because JOLs are ordinal and recall is dichotomous).
 *      - **Control** (object-level → meta-level flow of allocations): do learners
 *        spend restudy effort where it is needed (low mastery) rather than where
 *        studying feels pleasant (high fluency)? Measured as rank agreement
 *        between item difficulty and allocated restudy effort.
 * 2. Allan Murphy (1973) "A new vector partition of the probability score" —
 *    the Brier score decomposes EXACTLY into
 *      Brier = Reliability − Resolution + Uncertainty,
 *    so a learner can be "well calibrated but uninformative" (perfect
 *    reliability, zero resolution) and this engine distinguishes the two.
 * 3. Robert A. Bjork's calibration framework — resolution (discrimination
 *    between what is and is not known) is the trainable half of calibration.
 * 4. Samuel A. Butterfield & Alice F. Metcalfe (2001) "Errors committed with
 *    high confidence are hypercorrected" — errors made with high confidence are
 *    MORE likely to be corrected on retest than low-confidence errors, despite
 *    feeling like the most dangerous kind. The "epistemic shock" of a
 *    high-confidence miss produces disproportionate retention gains, which makes
 *    high-confidence errors the highest-value relearning targets in the system.
 *    (Butterfield & Metcalfe 2006 reconfirmed the effect and extended it to
 *    general-knowledge feedback learning.)
 * 5. Kruger & Dunning (1999) — the unskilled-and-unaware baseline: monitoring
 *    γ near zero with high mean confidence is the classic signature.
 *
 * Pure domain logic — no I/O, no DB. Handlers compose these functions; the
 * studio renders their outputs. Everything is deterministic so tests can pin
 * exact numbers.
 */

// ---------------------------------------------------------------------------
// 1. Trial & report schemas (zod at the boundary — AGENTS.md rule 5)
// ---------------------------------------------------------------------------

/**
 * One Judgment-of-Learning observation: a subjective confidence forecast
 * paired with the empirical retrieval outcome.
 */
export const jolObservationSchema = z.object({
  cardId: z.number().int().positive().optional(),
  /** Subjective probability of correct retrieval reported before answer reveal (0 to 1) */
  confidence: z.number().min(0).max(1),
  /** Actual empirical retrieval outcome: 1 = recalled, 0 = lapse */
  outcome: z.number().min(0).max(1),
  /** Response latency in milliseconds (control telemetry: fast + wrong = fluency illusion) */
  latencyMs: z.number().min(0).optional(),
})

export type JolObservation = z.infer<typeof jolObservationSchema>

/**
 * One restudy allocation observation (Nelson-Narens control stream): how much
 * effort the learner directed at an item, against that item's objective
 * difficulty. Difficulty is the card's FSRS difficulty (1 hard … 10 easy
 * inverted to 0 = already mastered … 1 = maximally fragile).
 */
export const restudyAllocationSchema = z.object({
  cardId: z.number().int().positive(),
  /** Objective fragility of the item (0 = mastered, 1 = maximally fragile) */
  difficulty: z.number().min(0).max(1),
  /** Restudy effort allocated by the learner, in seconds */
  allocatedSeconds: z.number().min(0),
  /** Whether the learner chose to restudy the item at all */
  wasRestudied: z.boolean(),
})

export type RestudyAllocation = z.infer<typeof restudyAllocationSchema>

/**
 * One error-correction observation for the hypercorrection crucible
 * (Butterfield & Metcalfe 2001): an error initially committed with some
 * confidence, and whether retest corrected it.
 */
export const correctionTrialSchema = z.object({
  cardId: z.number().int().positive().optional(),
  /** Confidence attached to the ORIGINAL erroneous response (0 to 1) */
  initialConfidence: z.number().min(0).max(1),
  /** Whether the retest corrected the error */
  wasCorrected: z.boolean(),
  /** Confidence on the corrected retest, when available */
  retestConfidence: z.number().min(0).max(1).optional(),
  /** Milliseconds from epistemic shock (feedback reveal) to next retrieval attempt */
  correctionLatencyMs: z.number().min(0).optional(),
})

export type CorrectionTrial = z.infer<typeof correctionTrialSchema>

/** A relearning-priority item — the FSRS bridge output of the crucible. */
export const relearnPrioritySchema = z.object({
  cardId: z.number().int().positive(),
  /** Why this card is queued (human-readable, cites the effect) */
  rationale: z.string(),
  /** 0 (deprioritized) … 100 (drop-everything) hypercorrection priority */
  priority: z.number().min(0).max(100),
  /** Confidence the learner attached to the error, 0–1 */
  errorConfidence: z.number().min(0).max(1),
  /** Predicted probability that retest corrects it (Butterfield curve) */
  predictedCorrectionProbability: z.number().min(0).max(1),
  /** Whether a prior retest already corrected this error */
  wasAlreadyCorrected: z.boolean(),
})

export type RelearnPriorityItem = z.infer<typeof relearnPrioritySchema>

// ---------------------------------------------------------------------------
// 2. Monitoring stream — Goodman-Kruskal gamma (Nelson 1984)
// ---------------------------------------------------------------------------

export interface GammaResult {
  /** Goodman-Kruskal γ ∈ [−1, 1]; 0 = chance-level monitoring */
  gamma: number
  /** Pairs where higher confidence went with higher outcome */
  concordantPairs: number
  /** Pairs where higher confidence went with a worse outcome */
  discordantPairs: number
  /** Pairs tied on confidence, outcome, or both (excluded from γ by design) */
  tiedPairs: number
  /** Total observations fed in */
  n: number
  /** Qualitative Nelson-Narens monitoring classification */
  level: 'no_evidence' | 'inverted' | 'chance' | 'weak' | 'moderate' | 'strong'
  /** One-sentence interpretation citing the framework */
  interpretation: string
}

/**
 * Goodman-Kruskal rank correlation between confidence and outcome — the
 * standard measure of metacognitive monitoring accuracy (Nelson 1984; Kun,
 * Brettle & Doherty 1979 showed γ dominates φ/π/r for dichotomous criteria).
 *
 * γ = (C − D) / (C + D), where C = concordant pairs, D = discordant pairs.
 * Ties are deliberately excluded (that is what makes γ robust to skewed
 * confidence distributions, which every real learner has). O(n²) pair scan —
 * input is capped by the handler at ≤ 500 observations.
 */
export function goodmanKruskalGamma(observations: JolObservation[]): GammaResult {
  const n = observations.length
  if (n < 2) {
    return {
      gamma: 0,
      concordantPairs: 0,
      discordantPairs: 0,
      tiedPairs: 0,
      n,
      level: 'no_evidence',
      interpretation:
        'Fewer than two judgments recorded — monitoring accuracy cannot be estimated yet.',
    }
  }

  let concordant = 0
  let discordant = 0
  let tied = 0

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dConf = observations[i].confidence - observations[j].confidence
      const dOut = observations[i].outcome - observations[j].outcome
      if (dConf === 0 || dOut === 0) {
        tied++
        continue
      }
      if (Math.sign(dConf) === Math.sign(dOut)) concordant++
      else discordant++
    }
  }

  const totalInformative = concordant + discordant
  const gamma = totalInformative === 0 ? 0 : (concordant - discordant) / totalInformative
  const clamped = Math.max(-1, Math.min(1, gamma))

  let level: GammaResult['level'] = 'chance'
  let interpretation =
    'Monitoring is at chance level (γ ≈ 0): confidence ratings carry no information about what will actually be recalled.'
  if (totalInformative === 0) {
    level = 'no_evidence'
    interpretation =
      'All judgments share one confidence value — the learner is not differentiating items, so γ is undefined.'
  } else if (clamped <= -0.15) {
    level = 'inverted'
    interpretation =
      'Inverted monitoring (γ ≤ −0.15): higher confidence predicts WORSE recall — fluency illusions are steering your judgments. The dual-slider drill with immediate feedback is the fastest repair.'
  } else if (clamped >= 0.6) {
    level = 'strong'
    interpretation =
      'Strong monitoring (γ ≥ 0.6): confidence ratings separate known from unknown material with field-standard accuracy.'
  } else if (clamped >= 0.35) {
    level = 'moderate'
    interpretation =
      'Moderate monitoring (0.35 ≤ γ < 0.6): judgments are informative but still miss sizeable pockets of illusion.'
  } else if (clamped >= 0.15) {
    level = 'weak'
    interpretation =
      'Weak monitoring (0.15 ≤ γ < 0.35): confidence is only weakly related to recall — study choices built on it are unreliable.'
  }

  return {
    gamma: Number(clamped.toFixed(3)),
    concordantPairs: concordant,
    discordantPairs: discordant,
    tiedPairs: tied,
    n,
    level,
    interpretation,
  }
}

// ---------------------------------------------------------------------------
// 3. Murphy decomposition of the Brier score (1973)
// ---------------------------------------------------------------------------

/** Confidence bin edges for the Murphy decomposition (5 equal-width bins). */
export const CONFIDENCE_BIN_EDGES = [0.2, 0.4, 0.6, 0.8, 1.0] as const

function binIndex(confidence: number): number {
  for (let k = 0; k < CONFIDENCE_BIN_EDGES.length; k++) {
    if (confidence <= CONFIDENCE_BIN_EDGES[k]) return k
  }
  return CONFIDENCE_BIN_EDGES.length - 1
}

export interface BrierBin {
  /** Inclusive upper edge of the bin (see CONFIDENCE_BIN_EDGES) */
  upperEdge: number
  count: number
  /** Mean confidence forecast inside the bin c̄ₖ */
  meanConfidence: number
  /** Mean empirical outcome inside the bin ōₖ */
  meanOutcome: number
}

export interface BrierDecomposition {
  /** Exact per-trial Brier score (0 = perfect, 1 = worst) */
  brierScore: number
  /**
   * Brier score computed on binned forecasts (each trial replaced by its bin
   * mean) — the value the Murphy identity reconstructs exactly.
   */
  binnedBrierScore: number
  /** REL = (1/N) Σₖ nₖ(c̄ₖ − ōₖ)² — miscalibration within bins */
  reliability: number
  /** RES = (1/N) Σₖ nₖ(ōₖ − ō)² — how sharply outcomes separate by forecast */
  resolution: number
  /** UNC = ō(1 − ō) — irreducible base-rate variance */
  uncertainty: number
  /** REL − RES + UNC — must equal binnedBrierScore to within float error */
  decompositionSum: number
  /** Per-bin detail for the HUD curve */
  bins: BrierBin[]
  /**
   * Calibration index = 1 − REL/UNC ∈ [−∞, 1], floored at −1: 1 = perfectly
   * calibrated, 0 = calibration no better than base-rate guessing, negative =
   * confidently wrong. (Adapted from the half-Brier reliability ratio used in
   * forecast verification literature.)
   */
  calibrationIndex: number
  /** Sample size */
  n: number
}

/**
 * Murphy (1973) vector partition of the Brier score. The identity
 * REL − RES + UNC = binned Brier holds exactly (verified by the test suite),
 * which lets the HUD tell apart the two failure modes of self-knowledge:
 *   - HIGH reliability error → forecasts are shifted (over/underconfidence).
 *   - LOW resolution → forecasts don't discriminate known from unknown items.
 * A learner can have perfect reliability with zero resolution — "I always say
 * 70% and am right 70% of the time" — which is exactly the uninformative
 * monitoring Kruger & Dunning (1999) describe.
 */
export function decomposeBrierScore(observations: JolObservation[]): BrierDecomposition {
  const n = observations.length
  if (n === 0) {
    return {
      brierScore: 0,
      binnedBrierScore: 0,
      reliability: 0,
      resolution: 0,
      uncertainty: 0,
      decompositionSum: 0,
      bins: [],
      calibrationIndex: 1,
      n: 0,
    }
  }

  // Per-trial (exact) Brier.
  const brierScore = observations.reduce((acc, o) => acc + (o.confidence - o.outcome) ** 2, 0) / n

  // Bin the forecasts.
  const bucketCount = CONFIDENCE_BIN_EDGES.length
  const sums = Array.from({ length: bucketCount }, () => ({ c: 0, o: 0, k: 0 }))
  for (const o of observations) {
    const b = sums[binIndex(o.confidence)]
    b.c += o.confidence
    b.o += o.outcome
    b.k += 1
  }

  const baseRate = observations.reduce((acc, o) => acc + o.outcome, 0) / n
  const uncertainty = baseRate * (1 - baseRate)

  let reliability = 0
  let resolution = 0
  const bins: BrierBin[] = []

  sums.forEach((b, idx) => {
    const meanConfidence = b.k > 0 ? b.c / b.k : 0
    const meanOutcome = b.k > 0 ? b.o / b.k : 0
    bins.push({
      upperEdge: CONFIDENCE_BIN_EDGES[idx],
      count: b.k,
      meanConfidence: Number(meanConfidence.toFixed(4)),
      meanOutcome: Number(meanOutcome.toFixed(4)),
    })
    if (b.k > 0) {
      reliability += (b.k / n) * (meanConfidence - meanOutcome) ** 2
      resolution += (b.k / n) * (meanOutcome - baseRate) ** 2
    }
  })

  const decompositionSum = reliability - resolution + uncertainty

  // Binned Brier: each trial scored against its bin mean confidence.
  let binnedBrier = 0
  for (const o of observations) {
    const b = bins[binIndex(o.confidence)]
    binnedBrier += (b.meanConfidence - o.outcome) ** 2
  }
  binnedBrier /= n

  const calibrationIndex = uncertainty === 0 ? 1 : Math.max(-1, 1 - reliability / uncertainty)

  return {
    brierScore: Number(brierScore.toFixed(4)),
    binnedBrierScore: Number(binnedBrier.toFixed(4)),
    reliability: Number(reliability.toFixed(4)),
    resolution: Number(resolution.toFixed(4)),
    uncertainty: Number(uncertainty.toFixed(4)),
    decompositionSum: Number(decompositionSum.toFixed(4)),
    bins,
    calibrationIndex: Number(calibrationIndex.toFixed(3)),
    n,
  }
}

// ---------------------------------------------------------------------------
// 4. Confidence-accuracy characteristic curve (CAC)
// ---------------------------------------------------------------------------

export interface CACPoint {
  /** Mean reported confidence of the bucket (0–1) */
  confidence: number
  /** Proportion of trials in the bucket that were actually correct (0–1) */
  proportionCorrect: number
  /** Trials in the bucket */
  count: number
}

/**
 * Confidence-Accuracy Characteristic curve ( Higham, Higham & Perfect style
 * CAC analysis ): unlike calibration curves, the CAC plots proportion CORRECT
 * per confidence bucket and exposes the discrete "confident-but-wrong"
 * population that γ and bias can both miss — a learner can be perfectly
 * calibrated in aggregate yet still hold a mass of high-confidence errors,
 * which are precisely the hypercorrection crucible's targets.
 */
export function confidenceAccuracyCurve(
  observations: JolObservation[],
  edges: readonly number[] = [0.3, 0.5, 0.7, 0.9, 1.0],
): CACPoint[] {
  if (observations.length === 0) return []
  const sorted = [...observations].sort((a, b) => a.confidence - b.confidence)
  const points: CACPoint[] = []
  let start = 0
  for (const edge of edges) {
    let end = start
    while (end < sorted.length && sorted[end].confidence <= edge) end++
    const slice = sorted.slice(start, end)
    if (slice.length > 0) {
      points.push({
        confidence: Number((slice.reduce((a, o) => a + o.confidence, 0) / slice.length).toFixed(3)),
        proportionCorrect: Number(
          (slice.reduce((a, o) => a + o.outcome, 0) / slice.length).toFixed(3),
        ),
        count: slice.length,
      })
    }
    start = end
    if (start >= sorted.length) break
  }
  return points
}

/**
 * Detects the discrete confident-wrong population: proportion of trials with
 * confidence ≥ 0.7 that were wrong. Butterfield & Metcalfe's crucible is built
 * on exactly this subset.
 */
export function confidentWrongRate(observations: JolObservation[]): number {
  const highs = observations.filter((o) => o.confidence >= 0.7)
  if (highs.length === 0) return 0
  return Number((highs.filter((o) => o.outcome < 1).length / highs.length).toFixed(3))
}

// ---------------------------------------------------------------------------
// 5. Control stream — restudy allocation sensitivity (Nelson-Narens)
// ---------------------------------------------------------------------------

export interface ControlSensitivityReport {
  /** Spearman rank correlation between item difficulty and allocated effort */
  rankCorrelation: number
  /** Share of total restudy seconds spent on the half of items above median difficulty */
  effortOnFragileItems: number
  /** Total restudy seconds observed */
  totalSeconds: number
  /** Qualitative Nelson-Narens control classification */
  level: 'no_evidence' | 'anti_control' | 'weak' | 'adequate' | 'expert_control'
  /** Actionable control guidance */
  guidance: string
  n: number
}

/** Mean rank of a value within an array (average ranks for ties). */
function meanRanks(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
  const ranks = new Array<number>(values.length)
  let i = 0
  while (i < indexed.length) {
    let j = i
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++
    const rank = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = rank
    i = j + 1
  }
  return ranks
}

/**
 * Spearman rank correlation between difficulty and allocated restudy effort —
 * the Nelson-Narens control-stream measure. A negative correlation
 * ("anti-control") means effort flows to the items that feel good to study
 * (fluency-seeking), the exact malady the studio's control panel targets.
 */
export function evaluateControlSensitivity(
  allocations: RestudyAllocation[],
): ControlSensitivityReport {
  const n = allocations.length
  const totalSeconds = allocations.reduce((a, r) => a + r.allocatedSeconds, 0)
  if (n < 3 || totalSeconds === 0) {
    return {
      rankCorrelation: 0,
      effortOnFragileItems: 0,
      totalSeconds: Number(totalSeconds.toFixed(1)),
      level: 'no_evidence',
      guidance:
        'Record restudy allocations for at least three items to measure whether effort follows need.',
      n,
    }
  }

  const dRanks = meanRanks(allocations.map((r) => r.difficulty))
  const eRanks = meanRanks(allocations.map((r) => r.allocatedSeconds))
  const meanD = dRanks.reduce((a, r) => a + r, 0) / n
  const meanE = eRanks.reduce((a, r) => a + r, 0) / n
  let num = 0
  let denD = 0
  let denE = 0
  for (let i = 0; i < n; i++) {
    num += (dRanks[i] - meanD) * (eRanks[i] - meanE)
    denD += (dRanks[i] - meanD) ** 2
    denE += (eRanks[i] - meanE) ** 2
  }
  const rho = denD === 0 || denE === 0 ? 0 : num / Math.sqrt(denD * denE)

  const medianDifficulty = median(allocations.map((r) => r.difficulty))
  const fragileSeconds = allocations
    .filter((r) => r.difficulty > medianDifficulty)
    .reduce((a, r) => a + r.allocatedSeconds, 0)
  const effortOnFragile = totalSeconds === 0 ? 0 : fragileSeconds / totalSeconds

  let level: ControlSensitivityReport['level'] = 'weak'
  let guidance =
    'Restudy effort only weakly tracks item fragility. Direct the next session at the crucible queue instead of re-reading comfortable material.'
  if (rho <= -0.2) {
    level = 'anti_control'
    guidance =
      'Anti-control detected (negative difficulty-effort correlation): study time is flowing to fluent, already-known items. This is the comfort rereading trap — invert the allocation using the priority queue below.'
  } else if (rho >= 0.6) {
    level = 'expert_control'
    guidance =
      'Expert control: restudy seconds track fragility almost perfectly. Keep using the difficulty forecast to steer effort.'
  } else if (rho >= 0.3) {
    level = 'adequate'
    guidance =
      'Adequate control: effort generally follows need, with room to sharpen allocation on the highest-priority errors.'
  }

  return {
    rankCorrelation: Number(rho.toFixed(3)),
    effortOnFragileItems: Number(effortOnFragile.toFixed(3)),
    totalSeconds: Number(totalSeconds.toFixed(1)),
    level,
    guidance,
    n,
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// ---------------------------------------------------------------------------
// 6. Hypercorrection crucible (Butterfield & Metcalfe 2001, 2006)
// ---------------------------------------------------------------------------

/** Confidence band used to stratify the crucible table. */
export type ConfidenceBand = 'low' | 'medium' | 'high' | 'extreme'

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.9) return 'extreme'
  if (confidence >= 0.7) return 'high'
  if (confidence >= 0.4) return 'medium'
  return 'low'
}

export interface EpistemicShock {
  cardId: number | null
  /** confidence × (1 − outcome): the magnitude of the surprise at feedback */
  shockMagnitude: number
  band: ConfidenceBand
  /** Butterfield & Metcalfe's observation: was the error corrected on retest? */
  wasCorrected: boolean
  /** Qualitative shock label for the studio's feedback trigger */
  label: 'minor surprise' | 'moderate shock' | 'severe shock' | 'total collapse'
}

/**
 * The "epistemic shock" of an error: how badly the feedback outcome violates
 * the learner's forecast. Magnitude = confidence × (1 − outcome). A shock of
 * 0.9+ ("total collapse") is the signature Butterfield-Metcalfe event —
 * research shows these errors are the most likely to be permanently corrected,
 * which is why the studio amplifies feedback on them instead of hiding it.
 */
export function epistemicShockOf(
  confidence: number,
  outcome: number,
  cardId: number | null = null,
  wasCorrected = false,
): EpistemicShock {
  const magnitude = Math.max(0, Math.min(1, confidence * (1 - outcome)))
  const band = confidenceBand(magnitude)
  const label: EpistemicShock['label'] =
    band === 'extreme'
      ? 'total collapse'
      : band === 'high'
        ? 'severe shock'
        : band === 'medium'
          ? 'moderate shock'
          : 'minor surprise'
  return {
    cardId,
    shockMagnitude: Number(magnitude.toFixed(3)),
    band,
    wasCorrected,
    label,
  }
}

export interface CrucibleBandRow {
  band: ConfidenceBand
  /** Errors committed in this confidence band */
  errors: number
  /** Share corrected on retest */
  correctedRate: number
  /** Mean shock magnitude of the band's errors */
  meanShock: number
}

export interface HypercorrectionReport {
  /** Total error-correction trials observed */
  sampleSize: number
  /** γ between initial confidence and correction on retest (the HC effect's size) */
  hypercorrectionGamma: number
  /**
   * Butterfield-Metcalfe hypercorrection index: correctedRate(high-confidence
   * errors) − correctedRate(low-confidence errors), clipped to [−1, 1].
   * Positive = the hypercorrection effect is operating in this learner.
   */
  hypercorrectionIndex: number
  /** Overall share of errors corrected on retest */
  overallCorrectionRate: number
  /** High-confidence (≥ 0.7) errors still uncorrected — the vulnerable core */
  uncorrectedHighConfidenceErrors: number
  /** Mean shock magnitude across all errors */
  meanShockMagnitude: number
  /** Stratified band table for the studio */
  bands: CrucibleBandRow[]
  /** Qualitative reading of the learner's crucible state */
  status: 'no_evidence' | 'dormant' | 'operating' | 'strongly_operating'
  /** Guidance for the studio */
  guidance: string
}

/**
 * Aggregates the crucible: does this learner hypercorrect? Butterfield &
 * Metcalfe (2001) found errors committed with high confidence are corrected
 * on retest far more often than low-confidence errors (in their Experiment 1,
 * ~72% vs ~46%). A negative index means the opposite pattern — typically
 * avoidance (the learner stops retesting misses, so nothing gets corrected).
 */
export function evaluateHypercorrection(trials: CorrectionTrial[]): HypercorrectionReport {
  const errors = trials
  const sampleSize = errors.length

  if (sampleSize === 0) {
    return {
      sampleSize: 0,
      hypercorrectionGamma: 0,
      hypercorrectionIndex: 0,
      overallCorrectionRate: 0,
      uncorrectedHighConfidenceErrors: 0,
      meanShockMagnitude: 0,
      bands: [],
      status: 'no_evidence',
      guidance:
        'No error-correction trials recorded yet. The crucible arms itself automatically as soon as retests of missed cards arrive.',
    }
  }

  // γ between initial confidence and correction (treat correction as 1/0).
  const gammaObs: JolObservation[] = errors.map((t) => ({
    confidence: t.initialConfidence,
    outcome: t.wasCorrected ? 1 : 0,
  }))
  const gamma = goodmanKruskalGamma(gammaObs)

  const bandsOrder: ConfidenceBand[] = ['low', 'medium', 'high', 'extreme']
  const bands: CrucibleBandRow[] = bandsOrder.map((band) => {
    const slice = errors.filter((t) => confidenceBand(t.initialConfidence) === band)
    return {
      band,
      errors: slice.length,
      correctedRate:
        slice.length === 0
          ? 0
          : Number((slice.filter((t) => t.wasCorrected).length / slice.length).toFixed(3)),
      // Shock of committing an error depends only on the forecast violated:
      // magnitude = initialConfidence × (1 − 0) = initialConfidence.
      meanShock:
        slice.length === 0
          ? 0
          : Number((slice.reduce((a, t) => a + t.initialConfidence, 0) / slice.length).toFixed(3)),
    }
  })

  const highBand = bands.find((b) => b.band === 'high')!
  const extremeBand = bands.find((b) => b.band === 'extreme')!
  const lowBand = bands.find((b) => b.band === 'low')!
  const highConfidenceRate =
    highBand.errors + extremeBand.errors > 0
      ? (highBand.correctedRate * highBand.errors +
          extremeBand.correctedRate * extremeBand.errors) /
        (highBand.errors + extremeBand.errors)
      : 0
  const lowRate = lowBand.correctedRate
  const index = Math.max(-1, Math.min(1, highConfidenceRate - lowRate))

  const uncorrectedHigh = errors.filter((t) => !t.wasCorrected && t.initialConfidence >= 0.7).length
  const overallRate = errors.filter((t) => t.wasCorrected).length / sampleSize
  // Mean epistemic shock of committed errors = mean violated forecast.
  const meanShock = errors.reduce((a, t) => a + t.initialConfidence, 0) / sampleSize

  let status: HypercorrectionReport['status'] = 'dormant'
  let guidance =
    'Too few high-confidence misses yet to detect the hypercorrection dynamic. Keep retesting missed cards — the effect appears with retest volume.'
  if (index >= 0.25) {
    status = 'strongly_operating'
    guidance =
      'Strong hypercorrection: your high-confidence misses convert to durable knowledge faster than easy misses. Feed the crucible — retest every confident error within 24 hours to bank the shock.'
  } else if (index >= 0.1) {
    status = 'operating'
    guidance =
      'The hypercorrection dynamic is operating: confident misses are correcting faster than timid ones. Prioritize the uncorrected high-confidence queue below.'
  } else if (uncorrectedHigh > 0 && overallRate < 0.2) {
    status = 'dormant'
    guidance =
      'High-confidence misses are NOT being retested — the most valuable correction events in your system are evaporating. Schedule the crucible queue now.'
  }

  return {
    sampleSize,
    hypercorrectionGamma: gamma.gamma,
    hypercorrectionIndex: Number(index.toFixed(3)),
    overallCorrectionRate: Number(overallRate.toFixed(3)),
    uncorrectedHighConfidenceErrors: uncorrectedHigh,
    meanShockMagnitude: Number(meanShock.toFixed(3)),
    bands,
    status,
    guidance,
  }
}

/**
 * Empirical Butterfield-Metcalfe correction curve: predicted probability that
 * a retest corrects an error committed with the given confidence. Anchored on
 * the published band rates (Exp. 1: ~0.46 low → ~0.72 high-confidence) and
 * refined by this learner's own band rates when ≥ 3 errors exist in a band.
 */
export function predictedCorrectionProbability(
  initialConfidence: number,
  trials: CorrectionTrial[],
): number {
  const RESEARCH_BASELINE: Record<ConfidenceBand, number> = {
    low: 0.45,
    medium: 0.58,
    high: 0.72,
    extreme: 0.82,
  }
  const band = confidenceBand(initialConfidence)
  const slice = trials.filter((t) => confidenceBand(t.initialConfidence) === band)
  if (slice.length >= 3) {
    // Empirical rate wins once there is enough data; shrink 20% toward the
    // published baseline to stay honest on small samples (James-Stein style).
    const empirical = slice.filter((t) => t.wasCorrected).length / slice.length
    return Number((0.8 * empirical + 0.2 * RESEARCH_BASELINE[band]).toFixed(3))
  }
  return RESEARCH_BASELINE[band]
}

// ---------------------------------------------------------------------------
// 7. FSRS relearning-priority bridge
// ---------------------------------------------------------------------------

export interface RelearnCandidate {
  cardId: number
  /** Confidence attached to the original error (0–1) */
  errorConfidence: number
  /** FSRS stability at time of error (days) */
  stability: number
  /** FSRS difficulty (1 easy … 10 hard) */
  difficulty: number
  /** Whether a prior retest already corrected the error */
  wasAlreadyCorrected: boolean
}

/**
 * Builds the crucible's relearning priority queue (0–100). Rationale blends
 * three levers, all from the literature:
 *   1. Hypercorrection value — high-confidence errors gain the most from
 *      immediate retest (Butterfield & Metcalfe 2001).
 *   2. Memory fragility — low stability means the error trace is still plastic.
 *   3. Effort forecast — hard items (high FSRS difficulty) need earlier
 *      intervention than the raw FSRS interval implies.
 * Already-corrected errors keep a reduced priority (successive relearning
 * criterion) instead of vanishing.
 */
export function prioritizeRelearningQueue(
  candidates: RelearnCandidate[],
  trials: CorrectionTrial[] = [],
): RelearnPriorityItem[] {
  const items = candidates.map((c) => {
    const predicted = predictedCorrectionProbability(c.errorConfidence, trials)
    // Fragility: stability 0 → 1.0, stability ≥ 21d → 0.
    const fragility = Math.max(0, Math.min(1, 1 - c.stability / 21))
    // Difficulty normalized 1..10 → 0..1.
    const hardEffort = Math.max(0, Math.min(1, (c.difficulty - 1) / 9))
    // Hypercorrection value peaks at confident errors.
    const hcValue = c.errorConfidence
    // Already-corrected errors keep 35% weight (successive relearning).
    const correctedFactor = c.wasAlreadyCorrected ? 0.35 : 1
    const priority = 100 * correctedFactor * (0.45 * hcValue + 0.35 * fragility + 0.2 * hardEffort)

    const rationale = c.wasAlreadyCorrected
      ? `Corrected high-confidence error (conf ${Math.round(c.errorConfidence * 100)}%): successive relearning keeps it queued until the criterion is met.`
      : `Uncorrected error committed at ${Math.round(c.errorConfidence * 100)}% confidence — epistemic shock makes this the highest-gain retest target (Butterfield & Metcalfe 2001); stability ${c.stability.toFixed(1)}d means the trace is ${c.stability < 3 ? 'still plastic' : 'consolidating'}.`

    return {
      cardId: c.cardId,
      rationale,
      priority: Number(Math.max(0, Math.min(100, priority)).toFixed(1)),
      errorConfidence: c.errorConfidence,
      predictedCorrectionProbability: predicted,
      wasAlreadyCorrected: c.wasAlreadyCorrected,
    }
  })
  return items.sort((a, b) => b.priority - a.priority)
}

// ---------------------------------------------------------------------------
// 8. Integrated monitoring + control + crucible report
// ---------------------------------------------------------------------------

export interface MetacognitiveStudioReport {
  monitoring: {
    gamma: GammaResult
    brier: BrierDecomposition
    cac: CACPoint[]
    confidentWrongRate: number
    meanConfidence: number
    accuracy: number
  }
  control: ControlSensitivityReport | null
  crucible: HypercorrectionReport
  queue: RelearnPriorityItem[]
  /** Composite 0–100 self-knowledge index for the HUD gauge */
  selfKnowledgeIndex: number
  /** Next best action, driven by the weakest stream */
  nextBestAction: string
}

/**
 * Integrated Nelson-Narens + crucible evaluation over all three streams.
 * The self-knowledge index weights monitoring γ (50%), calibration index
 * (25%) and control ρ (25%) — each normalized to 0–100 — so the studio gauge
 * moves when ANY stream improves, not just accuracy.
 */
export function evaluateStudioReport(input: {
  jols?: JolObservation[]
  allocations?: RestudyAllocation[]
  corrections?: CorrectionTrial[]
  candidates?: RelearnCandidate[]
}): MetacognitiveStudioReport {
  const { jols = [], allocations, corrections = [], candidates = [] } = input

  const gamma = goodmanKruskalGamma(jols)
  const brier = decomposeBrierScore(jols)
  const cac = confidenceAccuracyCurve(jols)
  const control =
    allocations && allocations.length > 0 ? evaluateControlSensitivity(allocations) : null
  const crucible = evaluateHypercorrection(corrections)
  const queue = prioritizeRelearningQueue(candidates, corrections)

  const monitoringScore = ((gamma.gamma + 1) / 2) * 100 // γ −1..1 → 0..100
  const calibrationScore = ((brier.calibrationIndex + 1) / 2) * 100
  const controlScore = control ? ((control.rankCorrelation + 1) / 2) * 100 : 50
  const selfKnowledgeIndex = Number(
    Math.max(
      0,
      Math.min(100, 0.5 * monitoringScore + 0.25 * calibrationScore + 0.25 * controlScore),
    ).toFixed(1),
  )

  let nextBestAction: string
  if (jols.length === 0) {
    nextBestAction = 'Rate a few confidence judgments in the studio to arm the monitoring gauge.'
  } else if (crucible.uncorrectedHighConfidenceErrors > 0) {
    nextBestAction =
      'Retest the uncorrected high-confidence misses first — they carry the largest correction gains.'
  } else if (control && control.level === 'anti_control') {
    nextBestAction =
      'Invert your restudy allocation: effort is currently flowing to already-fluent items.'
  } else if (gamma.level === 'chance' || gamma.level === 'weak' || gamma.level === 'inverted') {
    nextBestAction =
      'Practice the dual-slider JOL drill: predict, reveal, compare. Monitoring accuracy (γ) improves fastest with immediate feedback.'
  } else if (brier.resolution < 0.02 && brier.n >= 10) {
    nextBestAction =
      'Your confidence does not yet separate known from unknown items (low resolution). Grade items in distinct confidence tiers to build discrimination.'
  } else {
    nextBestAction = 'Monitoring is healthy — maintain spaced review and keep feeding the crucible.'
  }

  return {
    monitoring: {
      gamma,
      brier,
      cac,
      confidentWrongRate: confidentWrongRate(jols),
      meanConfidence: Number(
        (jols.length ? jols.reduce((a, o) => a + o.confidence, 0) / jols.length : 0).toFixed(3),
      ),
      accuracy: Number(
        (jols.length ? jols.reduce((a, o) => a + o.outcome, 0) / jols.length : 0).toFixed(3),
      ),
    },
    control,
    crucible,
    queue,
    selfKnowledgeIndex,
    nextBestAction,
  }
}

// ---------------------------------------------------------------------------
// 9. Interactive session state machine (studio backend)
// ---------------------------------------------------------------------------

export interface JolPrompt {
  id: string
  prompt: string
  answer: string
  domain: string
  /** Known fluency traps get flagged so the studio can warn on high JOL + miss */
  isFluencyTrap?: boolean
}

export interface StudioSessionState {
  phase: 'collecting_jols' | 'revealing' | 'crucible_review' | 'complete'
  promptIndex: number
  jols: JolObservation[]
  corrections: CorrectionTrial[]
  allocations: RestudyAllocation[]
  /** Live Nelson-Narens control-stream readout (null until ≥ 3 allocations) */
  control: ControlSensitivityReport | null
  /** Cards flagged for the crucible queue during this session */
  crucibleCandidates: RelearnCandidate[]
  report: MetacognitiveStudioReport
  /** Ids of prompts already answered this session */
  answeredPromptIds: string[]
}

/**
 * Drives the /metacognition studio: collect JOL → reveal → record outcome →
 * (on miss) arm the crucible → periodic report. Pure and deterministic — the
 * React component owns rendering and timing only.
 */
export class MetacognitionStudioSession {
  private state: StudioSessionState

  constructor(
    private readonly prompts: JolPrompt[],
    options: { corrections?: CorrectionTrial[]; allocations?: RestudyAllocation[] } = {},
  ) {
    const allocations = options.allocations ?? []
    const corrections = options.corrections ?? []
    this.state = {
      phase: 'collecting_jols',
      promptIndex: 0,
      jols: [],
      corrections,
      allocations,
      control: allocations.length > 0 ? evaluateControlSensitivity(allocations) : null,
      crucibleCandidates: [],
      report: evaluateStudioReport({
        jols: [],
        allocations,
        corrections,
        candidates: [],
      }),
      answeredPromptIds: [],
    }
  }

  getState(): Readonly<StudioSessionState> {
    return this.state
  }

  /** The prompt currently awaiting a JOL (null when exhausted). */
  currentPrompt(): JolPrompt | null {
    return this.prompts[this.state.promptIndex] ?? null
  }

  /**
   * Records the pre-reveal confidence forecast and moves to the reveal phase.
   * Rejects a forecast when none is pending or the reveal is already armed.
   */
  forecastJol(confidence: number, latencyMs?: number): { success: boolean; feedback: string } {
    if (this.state.phase !== 'collecting_jols') {
      return {
        success: false,
        feedback: 'A forecast is already armed — reveal and grade before forecasting again.',
      }
    }
    const prompt = this.currentPrompt()
    if (!prompt) {
      return { success: false, feedback: 'No prompt is pending a judgment.' }
    }
    if (confidence < 0 || confidence > 1) {
      return { success: false, feedback: 'Confidence must be between 0 and 1.' }
    }
    this.state.jols.push({ confidence, outcome: 0, latencyMs })
    this.state.phase = 'revealing'
    return {
      success: true,
      feedback: `Forecast locked at ${Math.round(confidence * 100)}%. Reveal the answer to grade the outcome.`,
    }
  }

  /**
   * Grades the reveal. Correct outcomes update the JOL; misses additionally
   * arm the crucible candidate and trigger the epistemic-shock payload the
   * studio renders as feedback.
   */
  gradeReveal(input: {
    correct: boolean
    /** FSRS telemetry of the card, when the prompt maps to a real card */
    stability?: number
    difficulty?: number
    cardId?: number
  }): { success: boolean; feedback: string; shock: EpistemicShock | null } {
    if (this.state.phase !== 'revealing') {
      return { success: false, feedback: 'Reveal a prompt before grading.', shock: null }
    }
    const prompt = this.currentPrompt()
    if (!prompt) {
      return { success: false, feedback: 'No prompt is pending grading.', shock: null }
    }

    const pending = this.state.jols[this.state.jols.length - 1]
    pending.outcome = input.correct ? 1 : 0
    this.state.answeredPromptIds.push(prompt.id)

    let shock: EpistemicShock | null = null
    if (!input.correct) {
      shock = epistemicShockOf(pending.confidence, 0, input.cardId ?? null)
      const cardId =
        input.cardId ?? 100000 + this.state.crucibleCandidates.length + promptIndexHash(prompt.id)
      this.state.corrections.push({
        cardId,
        initialConfidence: pending.confidence,
        wasCorrected: false,
      })
      this.state.crucibleCandidates.push({
        cardId,
        errorConfidence: pending.confidence,
        stability: input.stability ?? 1,
        difficulty: input.difficulty ?? 6,
        wasAlreadyCorrected: false,
      })
    }

    // Refresh the integrated report after every graded trial.
    this.state.report = evaluateStudioReport({
      jols: this.state.jols,
      allocations: this.state.allocations,
      corrections: this.state.corrections,
      candidates: this.state.crucibleCandidates,
    })

    this.state.promptIndex += 1
    this.state.phase = this.currentPrompt() ? 'collecting_jols' : 'complete'

    const feedback = input.correct
      ? `Correct — forecast was ${Math.round(pending.confidence * 100)}%.`
      : shock
        ? `Miss under ${Math.round(pending.confidence * 100)}% confidence — ${shock.label} (magnitude ${shock.shockMagnitude}). Butterfield & Metcalfe: this miss is your highest-value retest.`
        : 'Miss recorded.'

    return { success: true, feedback, shock }
  }

  /**
   * Records a restudy allocation decision for the control-stream telemetry.
   */
  recordAllocation(allocation: RestudyAllocation): void {
    this.state.allocations.push(allocation)
    this.state.control = evaluateControlSensitivity(this.state.allocations)
    this.state.report = evaluateStudioReport({
      jols: this.state.jols,
      allocations: this.state.allocations,
      corrections: this.state.corrections,
      candidates: this.state.crucibleCandidates,
    })
  }

  /** Rebuilds the report (e.g. after external corrections arrive). */
  refreshReport(): MetacognitiveStudioReport {
    if (this.state.allocations.length > 0) {
      this.state.control = evaluateControlSensitivity(this.state.allocations)
    }
    this.state.report = evaluateStudioReport({
      jols: this.state.jols,
      allocations: this.state.allocations,
      corrections: this.state.corrections,
      candidates: this.state.crucibleCandidates,
    })
    return this.state.report
  }
}

/** Stable small hash so ad-hoc prompts still map to a deterministic card slot. */
function promptIndexHash(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) % 9973
  }
  return h
}

// ---------------------------------------------------------------------------
// 10. Calibrated practice scenarios (studio seed data)
// ---------------------------------------------------------------------------

/**
 * Studio seed scenarios. Each set mixes solid items with known fluency traps
 * (plausible-but-wrong framings) so the monitoring gauge has real signal to
 * chew on from the very first session. Domains mirror the calibrated schemas
 * used elsewhere in the app.
 */
export const CALIBRATED_STUDIO_SCENARIOS: Record<string, JolPrompt[]> = {
  cognitive_memory_science: [
    {
      id: 'cms_1',
      prompt: 'What does the FSRS "stability" parameter quantify, in plain units?',
      answer: 'The interval (in days) after which recall probability drops to 90%.',
      domain: 'cognitive_memory_science',
    },
    {
      id: 'cms_2',
      prompt:
        'True or false: rereading a passage until it feels fluent is one of the most effective study techniques.',
      answer:
        'False — rereading builds fluency illusions; retrieval practice outperforms it (Dunlosky et al. 2013).',
      domain: 'cognitive_memory_science',
      isFluencyTrap: true,
    },
    {
      id: 'cms_3',
      prompt: 'In the Nelson-Narens framework, which stream carries judgments of learning?',
      answer: 'The monitoring stream (meta-level receiving object-level information).',
      domain: 'cognitive_memory_science',
    },
    {
      id: 'cms_4',
      prompt: 'What does a Goodman-Kruskal γ of 0 mean for a learner?',
      answer: 'Confidence ratings are unrelated to actual recall — chance-level monitoring.',
      domain: 'cognitive_memory_science',
    },
    {
      id: 'cms_5',
      prompt:
        'Butterfield & Metcalfe found which errors are MOST likely to be corrected on retest?',
      answer: 'High-confidence errors (the hypercorrection effect).',
      domain: 'cognitive_memory_science',
    },
    {
      id: 'cms_6',
      prompt:
        'True or false: the Brier score can be decomposed into reliability, resolution, and uncertainty.',
      answer: 'True — Murphy (1973) vector partition: B = REL − RES + UNC.',
      domain: 'cognitive_memory_science',
    },
    {
      id: 'cms_7',
      prompt: 'Why do massed (crammed) reviews feel more productive than spaced ones?',
      answer:
        'Short-term fluency: performance is better during the session, but long-term retention is worse — a desirable-difficulty inversion.',
      domain: 'cognitive_memory_science',
      isFluencyTrap: true,
    },
    {
      id: 'cms_8',
      prompt: 'What is the practical meaning of the Brier "resolution" term?',
      answer:
        'How sharply forecasts separate trials that will succeed from trials that will fail — the discriminating half of calibration.',
      domain: 'cognitive_memory_science',
    },
  ],
  distributed_systems: [
    {
      id: 'dss_1',
      prompt: "What guarantee does Raft's replicated state machine log provide?",
      answer:
        'A totally ordered log of state-machine commands, committed once a majority stores the entry.',
      domain: 'distributed_systems',
    },
    {
      id: 'dss_2',
      prompt:
        'True or false: two-phase commit blocks indefinitely if the coordinator fails mid-commit.',
      answer:
        'True — 2PC blocks participants until the coordinator recovers; that is the classic hole 3PC attempts (imperfectly) to fix.',
      domain: 'distributed_systems',
    },
    {
      id: 'dss_3',
      prompt: 'What does the CAP theorem say a network partition forces?',
      answer: 'A choice between consistency and availability — partition tolerance is assumed.',
      domain: 'distributed_systems',
    },
    {
      id: 'dss_4',
      prompt:
        'True or false: a quorum system with (R + W > N) guarantees strongly consistent reads.',
      answer:
        'Mostly true for simple quorum reads, but sloppy quorums and leaderless stores can still return stale values without read repair.',
      domain: 'distributed_systems',
      isFluencyTrap: true,
    },
    {
      id: 'dss_5',
      prompt: 'What problem does vector clock comparison solve that wall clocks cannot?',
      answer:
        'Causality tracking — establishing "happened-before" without synchronized physical clocks.',
      domain: 'distributed_systems',
    },
    {
      id: 'dss_6',
      prompt: 'Why does a leaderless store need read repair?',
      answer:
        'Because independent replica writes can diverge; reads observe and reconcile missing versions.',
      domain: 'distributed_systems',
    },
    {
      id: 'dss_7',
      prompt: 'True or false: exponential backoff makes retries eventually conflict-free.',
      answer:
        'False — it reduces collision probability, not certainty; jitter exists precisely because backoff alone still synchronizes clients.',
      domain: 'distributed_systems',
      isFluencyTrap: true,
    },
    {
      id: 'dss_8',
      prompt: 'What does "at-least-once delivery" imply for consumer design?',
      answer: 'Consumers must be idempotent — duplicates are inevitable.',
      domain: 'distributed_systems',
    },
  ],
  deep_learning: [
    {
      id: 'dl_1',
      prompt: 'What does scaled dot-product attention divide by √dₖ?',
      answer:
        'The dot products — to keep their variance constant so softmax gradients do not vanish.',
      domain: 'deep_learning',
    },
    {
      id: 'dl_2',
      prompt: 'True or false: dropout fully disables neurons permanently during inference.',
      answer:
        'False — dropout is a training-time regularizer; inference uses the full network with scaled weights.',
      domain: 'deep_learning',
    },
    {
      id: 'dl_3',
      prompt: 'What property makes cross-entropy preferable to MSE for classification?',
      answer:
        'Its gradient does not saturate with wrong confident predictions (no derivative-of-sigmoid shrinkage).',
      domain: 'deep_learning',
    },
    {
      id: 'dl_4',
      prompt:
        'True or false: deeper networks always have strictly more expressive power than shallow ones.',
      answer:
        'False in practice — optimization, not expressivity, is the bottleneck; and width can match depth for many function classes.',
      domain: 'deep_learning',
      isFluencyTrap: true,
    },
    {
      id: 'dl_5',
      prompt: 'What does a residual connection primarily mitigate?',
      answer:
        'Vanishing-gradient degradation in deep stacks, by giving gradients an identity path.',
      domain: 'deep_learning',
    },
    {
      id: 'dl_6',
      prompt: 'Why does batch normalization help training dynamics?',
      answer:
        'It stabilizes the distribution of layer inputs, smoothing the optimization landscape and permitting higher learning rates.',
      domain: 'deep_learning',
    },
    {
      id: 'dl_7',
      prompt: 'True or false: Adam converges to better minima than SGD on every task.',
      answer:
        'False — Adam often converges faster but SGD with momentum can generalize better on some vision tasks.',
      domain: 'deep_learning',
      isFluencyTrap: true,
    },
    {
      id: 'dl_8',
      prompt: 'What is the purpose of the KV cache in transformer inference?',
      answer:
        'To reuse previously computed keys/values per token, making autoregressive decoding O(n) per step instead of O(n²).',
      domain: 'deep_learning',
    },
  ],
}
