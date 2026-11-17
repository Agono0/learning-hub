import { z } from 'zod'

/**
 * @file Correction Crucible — the revlog-facing complement to the epistemic
 * crucible in `hypercorrection-engine.ts`.
 *
 * The main engine (#22) runs *authored multiple-choice calibration trials*
 * (EPISTEMIC_CRUCIBLE_PROBLEMS). This module covers the *review-log stream*:
 * reconstructing error→correction pairs from FSRS review history (a miss
 * arms its card; the card's next success counts as the correction), scoring
 * the Butterfield & Metcalfe (2001) hypercorrection dynamic on that stream,
 * and building the FSRS relearning-priority queue for uncorrected confident
 * misses. It also provides the revlog→`TrialMetacognitiveRecord` mapping so
 * the canonical gamma/Brier functions can consume real review telemetry.
 *
 * Pure domain logic — deterministic, no I/O.
 */

// ---------------------------------------------------------------------------
// 1. Trials
// ---------------------------------------------------------------------------

/**
 * One error-correction observation for the review-log crucible: an error
 * initially committed with some confidence, and whether a later review of
 * the same card corrected it.
 */
export const correctionTrialSchema = z.object({
  cardId: z.number().int().positive().optional(),
  /** Confidence attached to the ORIGINAL erroneous response (0 to 1) */
  initialConfidence: z.number().min(0).max(1),
  /** Whether the retest corrected the error */
  wasCorrected: z.boolean(),
  /** Confidence on the corrected retest, when available */
  retestConfidence: z.number().min(0).max(1).optional(),
  /** Milliseconds from feedback reveal to the next retrieval attempt */
  correctionLatencyMs: z.number().min(0).optional(),
})
export type CorrectionTrial = z.infer<typeof correctionTrialSchema>

/** A relearning-priority candidate built from an armed (uncorrected) miss. */
export const relearnCandidateSchema = z.object({
  cardId: z.number().int().positive(),
  /** Confidence attached to the original error (0–1) */
  errorConfidence: z.number().min(0).max(1),
  /** FSRS stability in days */
  stability: z.number().min(0),
  /** FSRS difficulty 1–10 */
  difficulty: z.number().min(1).max(10),
  /** Whether a prior retest already corrected the error */
  wasAlreadyCorrected: z.boolean().default(false),
})
export type RelearnCandidate = z.infer<typeof relearnCandidateSchema>

/** A relearning-priority item — the FSRS bridge output of the crucible. */
export const relearnPrioritySchema = z.object({
  cardId: z.number().int().positive(),
  rationale: z.string(),
  /** 0 (deprioritized) … 100 (drop-everything) hypercorrection priority */
  priority: z.number().min(0).max(100),
  errorConfidence: z.number().min(0).max(1),
  predictedCorrectionProbability: z.number().min(0).max(1),
  wasAlreadyCorrected: z.boolean(),
})
export type RelearnPriorityItem = z.infer<typeof relearnPrioritySchema>

/** Binary stored confidence (revlog.confidence): 0 uncertain / 1 confident. */
export type StoredConfidence = 0 | 1

/** Shared mapping: stored binary confidence → 0–1 forecast (parity contract). */
export function confidenceToForecast(confidence: StoredConfidence): number {
  return confidence === 1 ? 0.9 : 0.35
}

/** Raw review-log row shape the derivation helpers consume. */
export interface RevlogTrialRow {
  cardId: number
  rating: number
  confidence: StoredConfidence
  timeMs?: number | null
}

/**
 * Maps revlog rows to the canonical `TrialMetacognitiveRecord` shape so the
 * main engine's gamma/Murphy functions can consume real review telemetry.
 * (Confidence mapping: confident → 0.9, uncertain → 0.35 — same as parity.)
 */
export function toTrialMetacognitiveRecords(
  rows: RevlogTrialRow[],
): import('./hypercorrection-engine').TrialMetacognitiveRecord[] {
  return rows.map((r) => {
    const confidence = confidenceToForecast(r.confidence)
    const isCorrect = r.rating >= 3
    return {
      itemId: `card_${r.cardId}`,
      selectedOptionId: 'recall_attempt',
      isCorrect,
      prospectiveJOL: confidence,
      retrospectiveConfidence: confidence,
      responseLatencyMs: r.timeMs ?? 2500,
      epistemicSurpriseScore: Number((confidence * (isCorrect ? 0 : 1)).toFixed(3)),
      isHypercorrectionCandidate: !isCorrect && confidence >= 0.7,
    }
  })
}

/**
 * Reconstructs correction trials from newest-first review rows: walking
 * oldest→newest, each miss arms its card; the card's next success counts as
 * the correction. Anything still armed is an uncorrected error.
 */
export function correctionTrialsFromRows(rows: RevlogTrialRow[]): {
  corrections: CorrectionTrial[]
  armedMisses: { cardId: number; confidence: StoredConfidence }[]
} {
  const chronological = [...rows].reverse()
  const corrections: CorrectionTrial[] = []
  const armed = new Map<number, StoredConfidence>()

  for (const r of chronological) {
    const correct = r.rating >= 3
    const pending = armed.get(r.cardId)
    if (pending !== undefined && correct) {
      corrections.push({
        cardId: r.cardId,
        initialConfidence: confidenceToForecast(pending),
        wasCorrected: true,
      })
      armed.delete(r.cardId)
    }
    if (!correct) {
      armed.set(r.cardId, r.confidence)
    }
  }

  return {
    corrections,
    armedMisses: [...armed.entries()].map(([cardId, confidence]) => ({ cardId, confidence })),
  }
}

// ---------------------------------------------------------------------------
// 2. Butterfield & Metcalfe dynamics
// ---------------------------------------------------------------------------

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
  wasCorrected: boolean
  label: 'minor surprise' | 'moderate shock' | 'severe shock' | 'total collapse'
}

/** Epistemic shock of a committed error: magnitude = violated forecast. */
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
  return { cardId, shockMagnitude: Number(magnitude.toFixed(3)), band, wasCorrected, label }
}

export interface CrucibleBandRow {
  band: ConfidenceBand
  errors: number
  correctedRate: number
  meanShock: number
}

export interface HypercorrectionReport {
  sampleSize: number
  /** γ between initial confidence and correction on retest */
  hypercorrectionGamma: number
  /**
   * correctedRate(high-confidence errors) − correctedRate(low-confidence
   * errors), clipped to [−1, 1]. Positive = the effect is operating.
   */
  hypercorrectionIndex: number
  overallCorrectionRate: number
  /** High-confidence (≥ 0.7) errors still uncorrected */
  uncorrectedHighConfidenceErrors: number
  meanShockMagnitude: number
  bands: CrucibleBandRow[]
  status: 'no_evidence' | 'dormant' | 'operating' | 'strongly_operating'
  guidance: string
}

const RESEARCH_CORRECTION_BASELINE: Record<ConfidenceBand, number> = {
  low: 0.45,
  medium: 0.58,
  high: 0.72,
  extreme: 0.82,
}

/**
 * Empirical Butterfield-Metcalfe correction curve (Exp. 1: ~0.46 low → ~0.72
 * high-confidence), refined by this learner's band rates (≥ 3 trials) shrunk
 * 20% toward the published baseline.
 */
export function predictedCorrectionProbability(
  initialConfidence: number,
  trials: CorrectionTrial[],
): number {
  const band = confidenceBand(initialConfidence)
  const slice = trials.filter((t) => confidenceBand(t.initialConfidence) === band)
  if (slice.length >= 3) {
    const empirical = slice.filter((t) => t.wasCorrected).length / slice.length
    return Number((0.8 * empirical + 0.2 * RESEARCH_CORRECTION_BASELINE[band]).toFixed(3))
  }
  return RESEARCH_CORRECTION_BASELINE[band]
}

/**
 * Aggregates the crucible over correction trials (see HypercorrectionReport).
 * Empty input stays honest: sampleSize 0, status no_evidence.
 */
export function evaluateHypercorrection(trials: CorrectionTrial[]): HypercorrectionReport {
  const sampleSize = trials.length
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
        'No error-correction trials recorded yet. The crucible arms itself as retests of missed cards arrive.',
    }
  }

  // γ between initial confidence and correction via the canonical function.
  const gammaTrials = trials.map((t) => ({
    itemId: 'correction',
    selectedOptionId: 'retest',
    isCorrect: t.wasCorrected,
    prospectiveJOL: t.initialConfidence,
    retrospectiveConfidence: t.initialConfidence,
    responseLatencyMs: t.correctionLatencyMs ?? 2500,
    epistemicSurpriseScore: t.wasCorrected ? 0 : t.initialConfidence,
    isHypercorrectionCandidate: !t.wasCorrected && t.initialConfidence >= 0.7,
  }))
  // Inline γ (identical algorithm to the canonical calculateGoodmanKruskalGamma,
  // re-declared here to avoid a circular import between engine modules).
  let concordant = 0
  let discordant = 0
  for (let i = 0; i < gammaTrials.length; i++) {
    for (let j = i + 1; j < gammaTrials.length; j++) {
      const confDiff =
        gammaTrials[i].retrospectiveConfidence - gammaTrials[j].retrospectiveConfidence
      const accDiff = (gammaTrials[i].isCorrect ? 1 : 0) - (gammaTrials[j].isCorrect ? 1 : 0)
      if (confDiff === 0 || accDiff === 0) continue
      if ((confDiff > 0 && accDiff > 0) || (confDiff < 0 && accDiff < 0)) concordant++
      else discordant++
    }
  }
  const informative = concordant + discordant
  const gamma = informative === 0 ? 0 : (concordant - discordant) / informative

  const bandsOrder: ConfidenceBand[] = ['low', 'medium', 'high', 'extreme']
  const bands: CrucibleBandRow[] = bandsOrder.map((band) => {
    const slice = trials.filter((t) => confidenceBand(t.initialConfidence) === band)
    return {
      band,
      errors: slice.length,
      correctedRate:
        slice.length === 0
          ? 0
          : Number((slice.filter((t) => t.wasCorrected).length / slice.length).toFixed(3)),
      // Shock of committing an error = the violated forecast.
      meanShock:
        slice.length === 0
          ? 0
          : Number((slice.reduce((a, t) => a + t.initialConfidence, 0) / slice.length).toFixed(3)),
    }
  })

  const high = bands.find((b) => b.band === 'high')!
  const extreme = bands.find((b) => b.band === 'extreme')!
  const low = bands.find((b) => b.band === 'low')!
  const highErrors = high.errors + extreme.errors
  const highConfidenceRate =
    highErrors > 0
      ? (high.correctedRate * high.errors + extreme.correctedRate * extreme.errors) / highErrors
      : 0
  const index = Math.max(-1, Math.min(1, highConfidenceRate - low.correctedRate))

  const uncorrectedHigh = trials.filter((t) => !t.wasCorrected && t.initialConfidence >= 0.7).length
  const overallRate = trials.filter((t) => t.wasCorrected).length / sampleSize
  const meanShock = trials.reduce((a, t) => a + t.initialConfidence, 0) / sampleSize

  let status: HypercorrectionReport['status'] = 'dormant'
  let guidance =
    'Too few high-confidence misses yet to detect the hypercorrection dynamic. Keep retesting missed cards — the effect appears with retest volume.'
  if (index >= 0.25) {
    status = 'strongly_operating'
    guidance =
      'Strong hypercorrection: your high-confidence misses convert to durable knowledge faster than easy misses. Retest every confident error within 24 hours to bank the shock.'
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
    hypercorrectionGamma: Number(gamma.toFixed(3)),
    hypercorrectionIndex: Number(index.toFixed(3)),
    overallCorrectionRate: Number(overallRate.toFixed(3)),
    uncorrectedHighConfidenceErrors: uncorrectedHigh,
    meanShockMagnitude: Number(meanShock.toFixed(3)),
    bands,
    status,
    guidance,
  }
}

// ---------------------------------------------------------------------------
// 3. FSRS relearning-priority queue
// ---------------------------------------------------------------------------

/**
 * Builds the crucible's relearning priority queue (0–100):
 * 0.45·hypercorrection value + 0.35·fragility (1 − stability/21d) +
 * 0.2·effort forecast (difficulty); corrected errors keep 35% weight
 * (successive relearning criterion).
 */
export function prioritizeRelearningQueue(
  candidates: RelearnCandidate[],
  trials: CorrectionTrial[] = [],
): RelearnPriorityItem[] {
  const items = candidates.map((c) => {
    const predicted = predictedCorrectionProbability(c.errorConfidence, trials)
    const fragility = Math.max(0, Math.min(1, 1 - c.stability / 21))
    const hardEffort = Math.max(0, Math.min(1, (c.difficulty - 1) / 9))
    const correctedFactor = c.wasAlreadyCorrected ? 0.35 : 1
    const priority =
      100 * correctedFactor * (0.45 * c.errorConfidence + 0.35 * fragility + 0.2 * hardEffort)

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
