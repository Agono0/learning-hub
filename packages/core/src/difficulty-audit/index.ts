import { z } from 'zod'

/**
 * @file Desirable-Difficulty Audit Engine — Dunlosky et al. (2013) technique
 * utility auditing against the learner's actual study behavior.
 *
 * John Dunlosky, Katherine Rawson, Elizabeth Marsh, Mitchell Nathan & Daniel
 * Wegner's monograph "Improving Students' Learning With Effective Learning
 * Techniques" (Psychological Science in the Public Interest, 2013) rated ten
 * common techniques on utility across varied conditions, ages, and materials:
 *
 *   HIGH utility:     practice testing, distributed (spaced) practice
 *   MODERATE utility: elaborative interrogation, self-explanation, interleaved practice
 *   LOW utility:      rereading, highlighting/underlining, summarization,
 *                     keyword mnemonic, imagery use for text
 *
 * The low-utility techniques share a signature: they make studying FEEL
 * smooth and productive while creating exactly the fluency illusions that
 * Bjork & Bjork (2011) call *undesirable* difficulties — conditions of
 * acquisition that inflate short-term performance but impair long-term
 * retention. The high-utility techniques are *desirable* difficulties:
 * effortful during study, durable afterwards.
 *
 * This engine audits a learner's technique mix against that evidence table,
 * quantifies the fluency-illusion risk of their low-utility share, checks
 * their spacing and interleaving habits against the scheduling literature,
 * and emits a concrete substitution plan (what to swap, and the expected
 * utility delta of the swap). Real telemetry (retrieval minutes, session
 * spacing, deck interleaving) is used where it exists; self-reported
 * technique minutes fill what telemetry cannot see — and the report always
 * separates the two, because a fabricated measurement is worse than none.
 *
 * Pure domain logic — no I/O, no DB, deterministic.
 */

// ---------------------------------------------------------------------------
// 1. The evidence table (Dunlosky et al. 2013, Table 1 utility ratings)
// ---------------------------------------------------------------------------

export type TechniqueUtility = 'high' | 'moderate' | 'low'

export interface TechniqueProfile {
  id: string
  label: string
  utility: TechniqueUtility
  /**
   * Utility score 0–100 mapping the monograph's ratings (high = 90, moderate
   * = 60, low = 25) with within-tier ordinality from the monograph's
   * condition-breadth discussion (e.g. practice testing edges out distributed
   * practice on generalizability).
   */
  utilityScore: number
  /** Effect direction cited in the monograph (qualitative, not a fake d) */
  evidenceNote: string
}

export const TECHNIQUE_PROFILES: TechniqueProfile[] = [
  {
    id: 'practice_testing',
    label: 'Practice testing (retrieval practice)',
    utility: 'high',
    utilityScore: 95,
    evidenceNote:
      'Dunlosky et al. (2013): high utility — robust across ages, materials and retention intervals; the testing effect (Roediger & Karpicke 2006).',
  },
  {
    id: 'distributed_practice',
    label: 'Distributed practice (spacing)',
    utility: 'high',
    utilityScore: 92,
    evidenceNote:
      'Dunlosky et al. (2013): high utility — spacing gaps reliably beat massing (Cepeda et al. 2006 meta-analysis).',
  },
  {
    id: 'interleaved_practice',
    label: 'Interleaved practice',
    utility: 'moderate',
    utilityScore: 60,
    evidenceNote:
      'Dunlosky et al. (2013): moderate utility — strong for categorization/math (Rohrer & Taylor 2007), thinner evidence elsewhere.',
  },
  {
    id: 'self_explanation',
    label: 'Self-explanation',
    utility: 'moderate',
    utilityScore: 58,
    evidenceNote:
      'Dunlosky et al. (2013): moderate utility — benefits content learning (Chi et al. 1989), gains depend on prompt quality.',
  },
  {
    id: 'elaborative_interrogation',
    label: 'Elaborative interrogation ("why" questions)',
    utility: 'moderate',
    utilityScore: 55,
    evidenceNote:
      'Dunlosky et al. (2013): moderate utility — works best for learners with prior knowledge on fact-like material.',
  },
  {
    id: 'rereading',
    label: 'Rereading',
    utility: 'low',
    utilityScore: 25,
    evidenceNote:
      'Dunlosky et al. (2013): low utility — feels fluent but gains plateau; rereading is the most common technique and among the least effective.',
  },
  {
    id: 'highlighting',
    label: 'Highlighting / underlining',
    utility: 'low',
    utilityScore: 22,
    evidenceNote:
      'Dunlosky et al. (2013): low utility — can actually hurt performance on inference questions by fragmenting attention.',
  },
  {
    id: 'summarization',
    label: 'Summarization',
    utility: 'low',
    utilityScore: 28,
    evidenceNote:
      'Dunlosky et al. (2013): low-to-moderate — training-dependent, and weaker than retrieval for retention.',
  },
  {
    id: 'keyword_mnemonic',
    label: 'Keyword mnemonic',
    utility: 'low',
    utilityScore: 27,
    evidenceNote:
      'Dunlosky et al. (2013): low utility — helps short-term cued recall of associations, poor durability and generalization.',
  },
  {
    id: 'imagery_for_text',
    label: 'Imagery use for text',
    utility: 'low',
    utilityScore: 26,
    evidenceNote:
      'Dunlosky et al. (2013): low utility — requires high-quality mental imagery and benefits fade with complex material.',
  },
]

export const TECHNIQUE_IDS = TECHNIQUE_PROFILES.map((t) => t.id)

export function techniqueProfile(id: string): TechniqueProfile | undefined {
  return TECHNIQUE_PROFILES.find((t) => t.id === id)
}

// ---------------------------------------------------------------------------
// 2. Behavior inputs
// ---------------------------------------------------------------------------

/** Self-reported minutes per technique over the audit window (e.g. 7 days). */
export const selfReportedBehaviorSchema = z.object({
  /** Audit window length in days (1–28) */
  windowDays: z.number().int().min(1).max(28).default(7),
  /** Minutes per technique id (unknown ids rejected) */
  minutesByTechnique: z.record(z.string(), z.number().min(0).max(10000)),
  /** Cards studied via reading-only sources (notes, textbook rereads) */
  optionalNotes: z.string().max(500).optional(),
})
export type SelfReportedBehavior = z.infer<typeof selfReportedBehaviorSchema>

/**
 * Real telemetry the system can measure without asking (revlog-derived).
 * All fields are aggregates over the audit window.
 */
export const measuredBehaviorSchema = z.object({
  /** Total retrieval-practice minutes (sum of revlog timeMs) */
  retrievalMinutes: z.number().min(0),
  /** Distinct review sessions (day,deck) pairs */
  sessionCount: z.number().int().min(0),
  /** Per-day retrieval minutes, day offset 0 = today (for spacing math) */
  retrievalMinutesByDay: z.array(z.number().min(0)),
  /** Consecutive same-deck review count vs total reviews (interleaving) */
  consecutiveSameDeckReviews: z.number().int().min(0),
  totalReviews: z.number().int().min(0),
  /** Distinct decks touched over the window */
  distinctDecks: z.number().int().min(0),
})
export type MeasuredBehavior = z.infer<typeof measuredBehaviorSchema>

export const emptyMeasuredBehavior: MeasuredBehavior = {
  retrievalMinutes: 0,
  sessionCount: 0,
  retrievalMinutesByDay: [],
  consecutiveSameDeckReviews: 0,
  totalReviews: 0,
  distinctDecks: 0,
}

// ---------------------------------------------------------------------------
// 3. Technique-mix audit
// ---------------------------------------------------------------------------

export interface TechniqueShare {
  id: string
  label: string
  utility: TechniqueUtility
  utilityScore: number
  /** Self-reported minutes (telemetry cannot see these techniques) */
  minutes: number
  /** Share of total self-reported study minutes (0–1) */
  share: number
  /** Utility-weighted contribution to the difficulty dividend (0–100 scale) */
  weightedContribution: number
}

export interface TechniqueMixAudit {
  /** Total self-reported minutes in the window */
  totalMinutes: number
  shares: TechniqueShare[]
  /**
   * Difficulty Dividend (0–100): utility-weighted mean across the mix.
   * 100 = every minute spent on practice testing / spaced practice.
   */
  difficultyDividend: number
  /** Minutes on low-utility techniques — the fluency-illusion budget */
  lowUtilityMinutes: number
  /** Minutes on high-utility techniques */
  highUtilityMinutes: number
  /** Dominant technique id (largest share) */
  dominantTechniqueId: string | null
  status: 'no_data' | 'fluency_trap' | 'mixed' | 'difficulty_healthy'
  guidance: string
}

/**
 * Audits the self-reported technique mix against the Dunlosky utility table.
 * Rejects unknown technique ids at the boundary (zod handles that upstream);
 * this function still tolerates them defensively by dropping them.
 */
export function auditTechniqueMix(behavior: SelfReportedBehavior): TechniqueMixAudit {
  const entries = Object.entries(behavior.minutesByTechnique).filter(
    ([id, minutes]) => techniqueProfile(id) !== undefined && minutes > 0,
  )
  const totalMinutes = entries.reduce((a, [, m]) => a + m, 0)

  if (totalMinutes === 0) {
    return {
      totalMinutes: 0,
      shares: [],
      difficultyDividend: 0,
      lowUtilityMinutes: 0,
      highUtilityMinutes: 0,
      dominantTechniqueId: null,
      status: 'no_data',
      guidance:
        'No technique minutes reported yet. Log how you actually studied this week (rereading, highlighting, practice testing…) — the audit is only as honest as its inputs.',
    }
  }

  const shares: TechniqueShare[] = entries
    .map(([id, minutes]) => {
      const profile = techniqueProfile(id)!
      const share = minutes / totalMinutes
      return {
        id,
        label: profile.label,
        utility: profile.utility,
        utilityScore: profile.utilityScore,
        minutes,
        share: Number(share.toFixed(3)),
        weightedContribution: Number((share * profile.utilityScore).toFixed(1)),
      }
    })
    .sort((a, b) => b.minutes - a.minutes)

  const dividend = shares.reduce((a, s) => a + s.weightedContribution, 0)
  const lowUtilityMinutes = shares
    .filter((s) => s.utility === 'low')
    .reduce((a, s) => a + s.minutes, 0)
  const highUtilityMinutes = shares
    .filter((s) => s.utility === 'high')
    .reduce((a, s) => a + s.minutes, 0)

  let status: TechniqueMixAudit['status'] = 'mixed'
  let guidance =
    'A mixed bag: some retrieval, some fluency traps. Every hour moved from rereading or highlighting into practice testing is an hour compounding at a higher rate.'
  const lowShare = lowUtilityMinutes / totalMinutes
  if (lowShare >= 0.6) {
    status = 'fluency_trap'
    guidance =
      'Fluency trap detected: the majority of study minutes sit in low-utility techniques (Dunlosky et al. 2013). This is the profile that feels most productive and retains least. Execute the substitution plan below.'
  } else if (dividend >= 75 && highUtilityMinutes / totalMinutes >= 0.5) {
    status = 'difficulty_healthy'
    guidance =
      'Difficulty-healthy: retrieval and spacing dominate the mix. Protect the habit — and keep interleaving from sliding back into blocked review.'
  }

  return {
    totalMinutes: Number(totalMinutes.toFixed(1)),
    shares,
    difficultyDividend: Number(dividend.toFixed(1)),
    lowUtilityMinutes: Number(lowUtilityMinutes.toFixed(1)),
    highUtilityMinutes: Number(highUtilityMinutes.toFixed(1)),
    dominantTechniqueId: shares[0]?.id ?? null,
    status,
    guidance,
  }
}

// ---------------------------------------------------------------------------
// 4. Fluency-illusion risk (technique mix × measured telemetry)
// ---------------------------------------------------------------------------

export interface FluencyIllusionRisk {
  /** 0 (no risk) … 1 (max risk) composite of technique + telemetry signals */
  risk: number
  /** Low-utility share of self-reported minutes (0–1), or null when unreported */
  techniqueShareLow: number | null
  /** Telemetry signal: retrieval minutes relative to a 60-min weekly floor */
  retrievalAdequacy: number | null
  /** Qualitative label for the HUD */
  label: 'low' | 'moderate' | 'elevated' | 'high'
  drivers: string[]
}

/**
 * Fluency-illusion risk composes two honest inputs:
 *   1. the low-utility share of self-reported minutes (rereading/highlighting
 *      create the illusion directly), and
 *   2. retrieval adequacy — measured retrieval practice minutes vs a modest
 *      60-min/week floor, because a retrieval-starved week leans on passive
 *      review no matter what is self-reported.
 * When either input is missing the other carries the estimate and the driver
 * list says so — never a fabricated number.
 */
export function fluencyIllusionRisk(
  behavior: SelfReportedBehavior,
  measured: MeasuredBehavior = emptyMeasuredBehavior,
): FluencyIllusionRisk {
  const mix = auditTechniqueMix(behavior)
  const drivers: string[] = []

  const techniqueShareLow =
    mix.totalMinutes > 0 ? Number((mix.lowUtilityMinutes / mix.totalMinutes).toFixed(3)) : null
  const retrievalAdequacy = Math.min(1, measured.retrievalMinutes / 60)

  let risk = 0
  if (techniqueShareLow !== null) {
    risk += 0.65 * techniqueShareLow
    if (techniqueShareLow >= 0.6) {
      drivers.push('Majority of self-reported minutes are low-utility techniques')
    } else if (techniqueShareLow >= 0.3) {
      drivers.push('Meaningful low-utility share (rereading / highlighting / summarizing)')
    }
  } else {
    drivers.push('No technique minutes self-reported — risk estimate rests on telemetry only')
  }

  risk += 0.35 * (1 - retrievalAdequacy)
  if (retrievalAdequacy < 0.25) {
    drivers.push('Measured retrieval practice this week is under 15 minutes')
  }

  const clamped = Number(Math.max(0, Math.min(1, risk)).toFixed(3))
  const label: FluencyIllusionRisk['label'] =
    clamped >= 0.65 ? 'high' : clamped >= 0.45 ? 'elevated' : clamped >= 0.25 ? 'moderate' : 'low'

  return {
    risk: clamped,
    techniqueShareLow,
    retrievalAdequacy: Number(retrievalAdequacy.toFixed(3)),
    label,
    drivers,
  }
}

// ---------------------------------------------------------------------------
// 5. Spacing audit (Cepeda et al. 2006 optimal-gap ratio)
// ---------------------------------------------------------------------------

export interface SpacingAudit {
  /** Total retrieval minutes over the window */
  totalMinutes: number
  /** Active days (days with any retrieval) / window length (0–1) */
  activeDayRatio: number
  /** Largest same-topic gap normalised to the window (0–1); 0 = all massed */
  spacingSpread: number
  /** Mean gap (days) between active sessions */
  meanGapDays: number | null
  /**
   * Spacing verdict vs Cepeda et al. (2006): gaps ≈ 10–20% of the retention
   * interval are optimal; daily-or-almost-daily short sessions beat one long
   * cram for any horizon beyond a week.
   */
  verdict: 'no_data' | 'massed' | 'daily_grind' | 'spaced' | 'well_spaced'
  guidance: string
}

/**
 * Spacing audit from the per-day retrieval-minute series. "Massed" = all
 * minutes on ≤ 1 active day; "daily grind" = active every day but that is
 * still distribution-compatible (flagged as fine, not penalized); "spaced" /
 * "well spaced" by active-day ratio and gap structure.
 */
export function auditSpacing(behavior: MeasuredBehavior, windowDays = 7): SpacingAudit {
  const series = behavior.retrievalMinutesByDay.slice(0, windowDays)
  const totalMinutes = series.reduce((a, m) => a + m, 0)
  if (totalMinutes === 0) {
    return {
      totalMinutes: 0,
      activeDayRatio: 0,
      spacingSpread: 0,
      meanGapDays: null,
      verdict: 'no_data',
      guidance:
        'No measured retrieval this window — spacing cannot be assessed. Review some cards and re-run the audit.',
    }
  }

  const activeFlags = series.map((m) => m > 0)
  const activeDays = activeFlags.filter(Boolean).length
  const activeDayRatio = Number((activeDays / windowDays).toFixed(3))

  // Gaps between consecutive active days (in days).
  const gaps: number[] = []
  let lastActive = -1
  for (let i = 0; i < activeFlags.length; i++) {
    if (activeFlags[i]) {
      if (lastActive >= 0) gaps.push(i - lastActive)
      lastActive = i
    }
  }
  const meanGapDays =
    gaps.length > 0 ? Number((gaps.reduce((a, g) => a + g, 0) / gaps.length).toFixed(2)) : null

  // Spread: how far the session centroid sits from a single-day spike.
  const dayWeights = series.map((m) => m / totalMinutes)
  const centroid = dayWeights.reduce((a, w, i) => a + w * i, 0)
  const variance = dayWeights.reduce((a, w, i) => a + w * (i - centroid) ** 2, 0)
  const spacingSpread = Number(Math.min(1, Math.sqrt(variance) / (windowDays / 3)).toFixed(3))

  let verdict: SpacingAudit['verdict'] = 'spaced'
  let guidance =
    'Sessions are spread across the window — the distribution effect (Cepeda et al. 2006) is working for you.'
  if (activeDays <= 1) {
    verdict = 'massed'
    guidance =
      'All retrieval landed on one day — a cram. Same total minutes split across 3+ days reliably beats the block for anything you need beyond next week.'
  } else if (activeDayRatio >= 0.99) {
    verdict = 'daily_grind'
    guidance =
      'Retrieval every single day. Daily micro-sessions are fine — just ensure some cards get genuine multi-day gaps rather than same-day re-reviews.'
  } else if (activeDayRatio >= 0.55 && spacingSpread >= 0.35) {
    // 4 of 7 active days with real gaps is the practical sweet spot for a
    // weekly audit window (≈ Cepeda's 10–20% gap ratio on exam horizons).
    verdict = 'well_spaced'
    guidance =
      'Well spaced: sessions distribute across most of the window with meaningful gaps — near the 10–20% gap-ratio sweet spot for typical exam horizons.'
  }

  return {
    totalMinutes: Number(totalMinutes.toFixed(1)),
    activeDayRatio,
    spacingSpread,
    meanGapDays,
    verdict,
    guidance,
  }
}

// ---------------------------------------------------------------------------
// 6. Interleaving audit (Rohrer & Taylor 2007)
// ---------------------------------------------------------------------------

export interface InterleavingAudit {
  /** Share of consecutive review pairs that switch decks (0–1) */
  switchRate: number
  /** Longest run of consecutive same-deck reviews */
  longestBlockRun: number
  /** Total reviews observed */
  totalReviews: number
  verdict: 'no_data' | 'blocked' | 'mostly_blocked' | 'interleaved' | 'well_interleaved'
  guidance: string
}

/**
 * Interleaving audit from the consecutive-same-deck telemetry. Blocked
 * practice (AAA-BBB) feels smoother and tests worse on mixed final exams
 * (Rohrer & Taylor 2007); a switch rate ≥ 0.5 with no long runs is the goal.
 */
export function auditInterleaving(behavior: MeasuredBehavior): InterleavingAudit {
  const { consecutiveSameDeckReviews, totalReviews, distinctDecks } = behavior
  if (totalReviews < 5 || distinctDecks < 2) {
    return {
      switchRate: 0,
      longestBlockRun: 0,
      totalReviews,
      verdict: 'no_data',
      guidance:
        'Interleaving needs at least two decks and a handful of reviews to measure. Review across decks and re-run.',
    }
  }
  const switchPairs = Math.max(0, totalReviews - 1 - consecutiveSameDeckReviews)
  const switchRate = Number(Math.min(1, switchPairs / Math.max(1, totalReviews - 1)).toFixed(3))
  // Longest run upper-bound estimate from the same-deck pair count.
  const longestBlockRun = consecutiveSameDeckReviews + 1

  let verdict: InterleavingAudit['verdict'] = 'interleaved'
  let guidance =
    'Your review sequence switches decks often — mixed retrieval is building the discrimination that blocked review skips.'
  if (switchRate <= 0.2 && longestBlockRun >= 10) {
    verdict = 'blocked'
    guidance =
      'Blocked practice: long single-deck runs. Blocked feels smooth and tests worse on mixed finals (Rohrer & Taylor 2007) — shuffle decks within the session.'
  } else if (switchRate <= 0.4) {
    verdict = 'mostly_blocked'
    guidance =
      'Mostly blocked with some switching. Interleave a little more aggressively — alternating decks every few cards is the sweet spot.'
  } else if (switchRate >= 0.75) {
    // switchRate is the primary signal; `longestBlockRun` is a same-deck PAIR
    // upper bound, not a true run length, so it must not veto the verdict.
    verdict = 'well_interleaved'
    guidance =
      'Well interleaved: rapid deck switching across the session. This is the discrimination-building schedule.'
  }

  return {
    switchRate,
    longestBlockRun,
    totalReviews,
    verdict,
    guidance,
  }
}

// ---------------------------------------------------------------------------
// 7. Substitution plan
// ---------------------------------------------------------------------------

export interface Substitution {
  /** Technique to reduce */
  fromId: string
  fromLabel: string
  /** Technique to grow */
  toId: string
  toLabel: string
  /** Minutes to move per week */
  minutesToMove: number
  /** Expected dividend delta if the swap is executed (points of 100) */
  dividendDelta: number
  /** Concrete instruction for the swap */
  how: string
}

/**
 * Builds the substitution plan: moves up to 80% of each low-utility block
 * into the highest-utility technique with remaining headroom (practice
 * testing first, then distributed practice), never exceeding the current
 * total minutes. Each substitution's delta is exact arithmetic on the mix:
 * Δdividend = minutesMoved × (utilityTo − utilityFrom) / totalMinutes.
 */
export function substitutionPlan(behavior: SelfReportedBehavior): Substitution[] {
  const mix = auditTechniqueMix(behavior)
  if (mix.totalMinutes === 0) return []

  const profileOf = (id: string) => techniqueProfile(id)!
  const lowBlocks = mix.shares.filter((s) => s.utility === 'low')
  const highTargets = [
    'practice_testing',
    'distributed_practice',
    'interleaved_practice',
    'self_explanation',
  ]

  const substitutions: Substitution[] = []
  let movedMinutes = 0

  for (const block of lowBlocks) {
    const from = profileOf(block.id)
    const move = Math.min(
      block.minutes * 0.8,
      Math.max(0, mix.totalMinutes - movedMinutes - block.minutes * 0.2),
    )
    if (move < 5) continue
    const targetId = highTargets.find((id) => id !== block.id) ?? 'practice_testing'
    const to = profileOf(targetId)
    movedMinutes += move
    const delta = (move * (to.utilityScore - from.utilityScore)) / mix.totalMinutes
    substitutions.push({
      fromId: block.id,
      fromLabel: from.label,
      toId: targetId,
      toLabel: to.label,
      minutesToMove: Number(move.toFixed(1)),
      dividendDelta: Number(delta.toFixed(1)),
      how:
        targetId === 'practice_testing'
          ? `Replace ${Math.round(move)} min/week of ${from.label.toLowerCase()} with closed-book retrieval: same material, recall first, check after.`
          : targetId === 'distributed_practice'
            ? `Re-cut ${Math.round(move)} min/week of ${from.label.toLowerCase()} into 3+ short spaced sessions across different days.`
            : targetId === 'interleaved_practice'
              ? `Shuffle ${Math.round(move)} min/week of ${from.label.toLowerCase()} across topics instead of single-topic blocks.`
              : `Convert ${Math.round(move)} min/week of ${from.label.toLowerCase()} into why-questions and self-explanations of the same material.`,
    })
  }

  return substitutions.sort((a, b) => b.dividendDelta - a.dividendDelta)
}

// ---------------------------------------------------------------------------
// 8. Integrated weekly audit report
// ---------------------------------------------------------------------------

export interface DifficultyAuditReport {
  mix: TechniqueMixAudit
  risk: FluencyIllusionRisk
  spacing: SpacingAudit
  interleaving: InterleavingAudit
  substitutions: Substitution[]
  /** Composite 0–100: dividend × spacing/interleaving health (telemetry-weighted) */
  compositeIndex: number
  /** The single highest-leverage action this week */
  nextBestAction: string
  /** Which inputs were real telemetry vs self-report (honesty banner) */
  dataSources: { measured: string[]; selfReported: string[] }
}

/**
 * Integrated audit. The composite index weights the self-reported dividend at
 * 60% (it is the direct Dunlosky measure) and telemetry health at 40% split
 * between spacing and interleaving verdicts — so improving either stream
 * moves the gauge, and the dataSources banner never lets telemetry pretend
 * to know techniques it cannot see.
 */
export function auditDesirableDifficulty(
  behavior: SelfReportedBehavior,
  measured: MeasuredBehavior = emptyMeasuredBehavior,
): DifficultyAuditReport {
  const mix = auditTechniqueMix(behavior)
  const risk = fluencyIllusionRisk(behavior, measured)
  const spacing = auditSpacing(measured, behavior.windowDays)
  // Interleaving reads the MEASURED telemetry stream — self-reported minutes
  // cannot know deck sequencing, and mixing the streams here would silently
  // audit undefined fields (caught by the test suite).
  const interleaving = auditInterleaving(measured)
  const substitutions = substitutionPlan(behavior)

  const spacingScore =
    spacing.verdict === 'no_data'
      ? 50
      : spacing.verdict === 'well_spaced'
        ? 95
        : spacing.verdict === 'spaced'
          ? 80
          : spacing.verdict === 'daily_grind'
            ? 85
            : 25 // massed
  const interleavingScore =
    interleaving.verdict === 'no_data'
      ? 50
      : interleaving.verdict === 'well_interleaved'
        ? 95
        : interleaving.verdict === 'interleaved'
          ? 80
          : interleaving.verdict === 'mostly_blocked'
            ? 45
            : 20 // blocked
  const telemetryHealth = 0.5 * spacingScore + 0.5 * interleavingScore
  const compositeIndex = Number(
    Math.max(0, Math.min(100, 0.6 * mix.difficultyDividend + 0.4 * telemetryHealth)).toFixed(1),
  )

  let nextBestAction: string
  if (mix.totalMinutes === 0 && measured.retrievalMinutes === 0) {
    nextBestAction =
      'Log one week of technique minutes and review some cards — the audit needs one of the two streams to say anything.'
  } else if (substitutions.length > 0) {
    const top = substitutions[0]
    nextBestAction = `${top.how}`
  } else if (spacing.verdict === 'massed') {
    nextBestAction =
      "Split this week's retrieval across at least three different days — the distribution effect is free retention."
  } else if (interleaving.verdict === 'blocked') {
    nextBestAction =
      'Shuffle decks within your next session: interleaving builds discrimination that blocked review skips.'
  } else if (mix.totalMinutes === 0) {
    nextBestAction =
      'Log one week of technique minutes (rereading vs retrieval…) — telemetry alone cannot see which techniques you use, and the dividend needs that.'
  } else {
    nextBestAction =
      'Your study mix is difficulty-healthy — maintain retrieval-first sessions and spaced scheduling.'
  }

  return {
    mix,
    risk,
    spacing,
    interleaving,
    substitutions,
    compositeIndex,
    nextBestAction,
    dataSources: {
      measured: [
        'retrieval minutes (revlog timeMs)',
        'session spacing (per-day retrieval)',
        'deck interleaving (consecutive-deck runs)',
      ],
      selfReported:
        mix.totalMinutes > 0
          ? ['technique minutes (rereading, highlighting, testing… — only you can see these)']
          : [],
    },
  }
}

// ---------------------------------------------------------------------------
// 9. Self-report helper: validator + prompt catalog for the studio
// ---------------------------------------------------------------------------

export interface SelfReportPrompt {
  techniqueId: string
  question: string
  helper: string
}

/** The studio renders one minute-log input per technique, in this order. */
export const SELF_REPORT_PROMPTS: SelfReportPrompt[] = [
  {
    techniqueId: 'practice_testing',
    question: 'Closed-book retrieval (flashcards, self-quizzing, recall attempts)',
    helper: 'Minutes where you tried to PRODUCE the answer before checking it.',
  },
  {
    techniqueId: 'distributed_practice',
    question: 'Spaced re-sessions of earlier material',
    helper:
      'Minutes revisiting material from previous days — count them here, not under rereading.',
  },
  {
    techniqueId: 'interleaved_practice',
    question: 'Mixed-topic / mixed-deck sessions',
    helper: 'Minutes deliberately alternating topics within one sitting.',
  },
  {
    techniqueId: 'self_explanation',
    question: 'Explaining steps in your own words',
    helper: '"Why does this follow?" minutes — spoken or written explanations of worked material.',
  },
  {
    techniqueId: 'elaborative_interrogation',
    question: 'Fact "why" interrogation',
    helper: 'Minutes asking why a fact is true and connecting it to what you know.',
  },
  {
    techniqueId: 'rereading',
    question: 'Rereading notes/textbooks/flashcards passively',
    helper: 'Eyes moving, no retrieval attempt. The single biggest fluency trap.',
  },
  {
    techniqueId: 'highlighting',
    question: 'Highlighting / underlining',
    helper: 'Marking text without producing anything from memory.',
  },
  {
    techniqueId: 'summarization',
    question: 'Summarizing material',
    helper: 'Rewriting content in shorter form (not from memory).',
  },
  {
    techniqueId: 'keyword_mnemonic',
    question: 'Keyword mnemonics / word-association tricks',
    helper: 'Sound-alike keyword images and link stories.',
  },
  {
    techniqueId: 'imagery_for_text',
    question: 'Forming mental imagery of prose',
    helper: 'Deliberate picture-in-head construction while reading.',
  },
]
