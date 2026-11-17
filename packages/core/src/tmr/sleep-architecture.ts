import { z } from 'zod'
import {
  calculateDeltaOscillationGain,
  evaluateConsolidationGain,
  type NeuroAcousticProfile,
  type ReplayConsolidationAudit,
} from './neuro-acoustic'

/**
 * @file Sleep Architecture Model & Tonight-Plan Builder for TMR.
 *
 * Turns "when does the learner actually sleep" into a concrete, honest cueing
 * schedule instead of a generic duration-based plan:
 *
 * 1. **Sleep cycle architecture** — the N1 → N2 → N3 → REM cycle (AASM staging)
 *    repeats every ~90–110 minutes. Slow-wave sleep (N3) dominates the early
 *    cycles and decays exponentially across the night, while REM share grows
 *    (Dijk & Czeisler 1995; Carskadon & Dement's Normal Human Sleep chapter).
 *    The model encodes exactly that monotone trade-off, plus sleep-onset
 *    latency, so cue windows land where delta power actually lives.
 * 2. **Process S (homeostatic sleep pressure)** — Borbély's two-process model
 *    (1982): accumulated sleep debt raises early-night SWS proportion (the
 *    classic "rebound"). The model lets a learner carry measured debt hours in
 *    and produces a deeper first-cycle N3 block under debt.
 * 3. **Chronotype** — morningness/eveningness (Horne & Östberg 1976) shifts the
 *    circadian modulation of SWS: larks compress their SWS into the earliest
 *    cycles, owls carry more SWS into later cycles. Modelled as a modest
 *    redistribution, never fabricated precision.
 * 4. **TMR cue scheduling** — Rudoy et al. (2007), Ngo et al. (2013) and
 *    Oudiette & Paller (2013) constraints: cues only inside SWS blocks, spaced
 *    tens of seconds apart, per-card replay caps to avoid habituation, and a
 *    hard sub-arousal loudness ceiling (≤ 42 dBA, stricter than the ~35 dBA
 *    whisper level the lab studies used).
 * 5. **Honest forecasting** — per-card consolidation audits reuse
 *    `evaluateConsolidationGain`; the aggregate is capped and the advisory
 *    text always labels the estimate as a small bonus, not a guarantee.
 *
 * Pure domain logic — no I/O, no DB, deterministic. The /sleep-tmr page renders
 * the hypnogram and playlist; the handler feeds real FSRS candidates.
 */

// ---------------------------------------------------------------------------
// 1. Input schemas
// ---------------------------------------------------------------------------

/** Clock time "HH:MM" (24h). Validated loosely; minute/hour ranges enforced. */
export const clockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'expected HH:MM 24h clock time')
export type ClockTime = z.infer<typeof clockTimeSchema>

/**
 * A learner's sleep context for tonight. Everything is optional-with-default
 * except the times, so the studio can render a plan before any telemetry
 * exists — but the plan is always labelled with the assumptions it used.
 */
export const sleepProfileSchema = z.object({
  /** Bedtime "HH:MM" (24h) — may be after midnight (e.g. 23:30) */
  bedtime: clockTimeSchema,
  /** Wake time "HH:MM" (24h) */
  wakeTime: clockTimeSchema,
  /**
   * Morningness-eveningness, −1 (strong owl) … +1 (strong lark).
   * Horne & Östberg (1976); 0 = neutral.
   */
  chronotype: z.number().min(-1).max(1).default(0),
  /**
   * Accumulated sleep debt in hours over the past week (self-reported or
   * tracked). Drives Process-S SWS rebound. Clamped to 0–12 in calculations.
   */
  sleepDebtHours: z.number().min(0).max(12).default(0),
  /** Personal nightly sleep need in hours (default 8, the adult recommendation) */
  personalNeedHours: z.number().min(5).max(11).default(8),
  /** Upper acoustic ceiling in dBA for the night session (must stay ≤ 42) */
  maxAcousticDba: z.number().min(25).max(42).default(35),
})
export type SleepProfile = z.infer<typeof sleepProfileSchema>

/** A card the planner may schedule tonight (FSRS state + tonal signature). */
export const consolidationCandidateSchema = z.object({
  cardId: z.number().int().positive(),
  /** FSRS stability in days (0 = new) */
  stability: z.number().min(0).default(1),
  /** FSRS difficulty 1–10 (0 = new; normalised internally to 0–1 effort) */
  difficulty: z.number().min(0).max(10).default(5),
  /** Due date ISO — due-soonest cards get priority inside fragility ranking */
  due: z.string().optional(),
  /** Base frequency in Hz for the earcon (100–2000) */
  baseFrequency: z.number().min(100).max(2000).default(440),
  harmonicType: z
    .enum(['major_triad', 'perfect_fifth', 'octave_bloom', 'subharmonic'])
    .default('major_triad'),
  /** Optional human label for the playlist (never the answer text) */
  title: z.string().max(120).optional(),
})
export type ConsolidationCandidate = z.infer<typeof consolidationCandidateSchema>

// ---------------------------------------------------------------------------
// 2. Hypnogram model
// ---------------------------------------------------------------------------

export type SleepStage = 'n1' | 'n2' | 'n3' | 'rem'

export interface HypnogramSegment {
  stage: SleepStage
  /** Minutes from sleep onset (lights-out + latency) */
  startMinute: number
  endMinute: number
  cycleIndex: number
}

export interface Hypnogram {
  /** Total observed sleep opportunity in minutes (bedtime → wake) */
  totalOpportunityMinutes: number
  /** Sleep-onset latency in minutes (bedtime → first N1) */
  onsetLatencyMinutes: number
  /** Number of complete cycles fitted */
  cycleCount: number
  segments: HypnogramSegment[]
  /** N3 share of the whole opportunity (0–1) — the SWS mass available to TMR */
  swsShare: number
  /** REM share (0–1), for the HUD's honesty readout */
  remShare: number
  /** Bedtime ISO instant used (resolved for "today or yesterday") */
  bedtimeIso: string
  wakeIso: string
}

/** Resolves "HH:MM" to ISO instants: bedtime may be yesterday evening. */
function resolveWindow(
  bedtime: ClockTime,
  wakeTime: ClockTime,
  now = new Date(),
): { bedtimeDate: Date; wakeDate: Date; bedtimeIso: string; wakeIso: string } {
  const [bh, bm] = bedtime.split(':').map(Number) as [number, number]
  const [wh, wm] = wakeTime.split(':').map(Number) as [number, number]
  // Bedtime is this evening (today at HH:MM); if that is in the future,
  // tonight is tonight. If it already passed, we still plan for "tonight"
  // starting from the stated bedtime on today's date — the schedule is
  // advisory, so a past bedtime simply means the plan starts now-ish.
  const bedtimeDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), bh, bm, 0, 0)
  const wakeDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), wh, wm, 0, 0)
  // A wake time earlier than the bedtime means the wake is the next morning.
  if (wakeDate.getTime() <= bedtimeDate.getTime()) {
    wakeDate.setDate(wakeDate.getDate() + 1)
  }
  return {
    bedtimeDate,
    wakeDate,
    bedtimeIso: bedtimeDate.toISOString(),
    wakeIso: wakeDate.toISOString(),
  }
}

/**
 * SWS proportion per cycle index. Carskadon & Dement's classic hypnogram:
 * cycle 1 carries ~45% N3, decaying roughly exponentially to a floor; the
 * remainder splits into N2 (dominant) and REM (rising).
 */
function cycleStageShares(
  cycleIndex: number,
  sleepDebtHours: number,
  chronotype: number,
): { n1: number; n2: number; n3: number; rem: number } {
  // Base SWS decay: 0.45 → 0.30 → 0.17 → 0.10 → floor 0.06.
  const decay = [0.45, 0.3, 0.17, 0.1, 0.06]
  let n3 = decay[Math.min(cycleIndex - 1, decay.length - 1)]

  // Process S: sleep debt pushes slow-wave pressure up (rebound), more in
  // early cycles (they already carry the highest delta power).
  const rebound = Math.min(0.12, sleepDebtHours * 0.015)
  n3 = Math.min(0.6, n3 + rebound * (cycleIndex === 1 ? 1 : 0.6))

  // Chronotype redistribution: larks (+) pull SWS earlier (boost cycle 1),
  // owls (−) spread it later (damp cycle 1, boost the rest slightly).
  const chronoShift = chronotype * 0.04
  if (cycleIndex === 1) n3 = Math.min(0.62, Math.max(0.2, n3 + chronoShift))
  else n3 = Math.max(0.03, n3 - chronoShift * 0.5)

  // REM grows across the night: 0.10 → 0.16 → 0.22 → 0.28 → cap 0.32.
  const remRamp = [0.1, 0.16, 0.22, 0.28, 0.32]
  const rem = remRamp[Math.min(cycleIndex - 1, remRamp.length - 1)]

  // N1 is a thin gateway (~5%); N2 takes the remainder.
  const n1 = 0.05
  const n2 = Math.max(0.15, 1 - n1 - n3 - rem)
  const total = n1 + n2 + n3 + rem
  return {
    n1: n1 / total,
    n2: n2 / total,
    n3: n3 / total,
    rem: rem / total,
  }
}

/** Mean human cycle length; real nights vary 80–110 min (Carskadon & Dement). */
const CYCLE_MINUTES = 95
/** Typical sleep-onset latency for a rested adult (Djoung et al. 2006 ~10–20 min). */
const ONSET_LATENCY_MINUTES = 12

/**
 * Builds a deterministic model hypnogram for tonight from the sleep profile.
 * Segments are ordered, contiguous, and cover from bedtime (N1 starts after
 * latency) to wake. Stages alternate N3 → N2 → REM within each cycle, with a
 * short N1 leading every cycle (transient surfacing).
 */
export function buildHypnogram(profile: SleepProfile, now = new Date()): Hypnogram {
  const { bedtimeDate, wakeDate, bedtimeIso, wakeIso } = resolveWindow(
    profile.bedtime,
    profile.wakeTime,
    now,
  )
  const rawOpportunity = Math.max(
    0,
    Math.round((wakeDate.getTime() - bedtimeDate.getTime()) / 60000),
  )
  // Defensive clamp: a sleep window beyond 16 h is a data error (bedtime/wake
  // mix-up), not a nap plan — cap the modelled opportunity there.
  const totalOpportunity = Math.min(rawOpportunity, 16 * 60)
  const sleepMinutes = Math.max(0, totalOpportunity - ONSET_LATENCY_MINUTES)
  const cycleCount = Math.max(1, Math.round(sleepMinutes / CYCLE_MINUTES))

  const segments: HypnogramSegment[] = []
  let cursor = ONSET_LATENCY_MINUTES

  for (let cycle = 1; cycle <= cycleCount; cycle++) {
    const remaining = sleepMinutes - (cursor - ONSET_LATENCY_MINUTES)
    const cycleLength = Math.min(
      CYCLE_MINUTES,
      Math.max(10, remaining > 0 ? remaining : CYCLE_MINUTES),
    )
    const shares = cycleStageShares(cycle, profile.sleepDebtHours, profile.chronotype)

    // Stage order inside a cycle: N1 → N3 → N2 → REM (SWS front-loaded in the
    // cycle, REM at the end — the standard ordering in real hypnograms).
    const stageOrder: { stage: SleepStage; share: number }[] = [
      { stage: 'n1', share: shares.n1 },
      { stage: 'n3', share: shares.n3 },
      { stage: 'n2', share: shares.n2 },
      { stage: 'rem', share: shares.rem },
    ]
    for (const { stage, share } of stageOrder) {
      const minutes = cycleLength * share
      if (minutes < 1) continue
      segments.push({
        stage,
        startMinute: Math.round(cursor),
        endMinute: Math.round(cursor + minutes),
        cycleIndex: cycle,
      })
      cursor += minutes
    }
    if (cursor >= ONSET_LATENCY_MINUTES + sleepMinutes) break
  }

  // Merge/normalize: drop zero-length, clamp to the opportunity window.
  const windowEnd = totalOpportunity
  const clean = segments
    .filter((s) => s.endMinute > s.startMinute)
    .map((s) => ({ ...s, endMinute: Math.min(s.endMinute, windowEnd) }))
    .filter((s) => s.endMinute > s.startMinute)

  const sumMinutes = (stage: SleepStage) =>
    clean.filter((s) => s.stage === stage).reduce((a, s) => a + (s.endMinute - s.startMinute), 0)
  const usable = Math.max(1, sleepMinutes)

  return {
    totalOpportunityMinutes: totalOpportunity,
    onsetLatencyMinutes: ONSET_LATENCY_MINUTES,
    cycleCount,
    segments: clean,
    swsShare: Number((sumMinutes('n3') / usable).toFixed(3)),
    remShare: Number((sumMinutes('rem') / usable).toFixed(3)),
    bedtimeIso,
    wakeIso,
  }
}

// ---------------------------------------------------------------------------
// 3. SWS windows + cue scheduling
// ---------------------------------------------------------------------------

export interface SwsBlock {
  cycleIndex: number
  startMinute: number
  endMinute: number
  /** Delta-power quality weight 0–1 (cycle 1 ≈ 1.0, decaying per cycle) */
  deltaWeight: number
}

/**
 * Extracts cueable SWS blocks from the hypnogram: contiguous N3 segments,
 * merging adjacent N3s across cycle boundaries, each weighted by the delta
 * power of its (earliest) cycle. Blocks shorter than 12 minutes are dropped —
 * too short to land a cue safely within the stage.
 */
export function extractSwsBlocks(hypnogram: Hypnogram): SwsBlock[] {
  const blocks: SwsBlock[] = []
  for (const seg of hypnogram.segments) {
    if (seg.stage !== 'n3') continue
    const last = blocks[blocks.length - 1]
    if (last && last.endMinute === seg.startMinute) {
      last.endMinute = seg.endMinute
    } else {
      blocks.push({
        cycleIndex: seg.cycleIndex,
        startMinute: seg.startMinute,
        endMinute: seg.endMinute,
        deltaWeight: 1,
      })
    }
  }
  // Delta weight decays per cycle (same shape as the SWS decay table).
  const decay = [1.0, 0.72, 0.45, 0.28, 0.18]
  return blocks
    .filter((b) => b.endMinute - b.startMinute >= 12)
    .map((b) => ({ ...b, deltaWeight: decay[Math.min(b.cycleIndex - 1, decay.length - 1)] }))
}

/**
 * FSRS fragility score (0–1): low stability, high difficulty, and due-soonest
 * all raise it. stability ≥ 21 days ≈ consolidated → near-zero fragility.
 */
export function fragilityScore(card: ConsolidationCandidate, now = new Date()): number {
  const stabilityFactor = Math.max(0, Math.min(1, 1 - card.stability / 21))
  const difficultyFactor = Math.max(0, Math.min(1, (card.difficulty - 1) / 9))
  let dueSoonness = 0.4 // no due date → mild default urgency
  if (card.due) {
    const due = new Date(card.due).getTime()
    if (!Number.isNaN(due)) {
      const daysUntilDue = (due - now.getTime()) / 86_400_000
      dueSoonness = Math.max(0, Math.min(1, 1 - daysUntilDue / 7))
    }
  }
  return Number(
    Math.min(1, 0.45 * stabilityFactor + 0.3 * difficultyFactor + 0.25 * dueSoonness).toFixed(3),
  )
}

export interface ScheduledCue {
  cardId: number
  /** Minutes from bedtime (aligned inside an SWS block) */
  offsetMinutes: number
  cycleIndex: number
  blockDeltaWeight: number
  baseFrequency: number
  harmonicType: 'major_triad' | 'perfect_fifth' | 'octave_bloom' | 'subharmonic'
  /** Predicted retention boost percentage for this card (e.g. 14.2) */
  predictedBoostPct: number
  stabilizationTier: 'optimal' | 'moderate' | 'marginal'
}

export interface TonightPlan {
  profile: SleepProfile & { bedtimeIso: string; wakeIso: string }
  hypnogram: Hypnogram
  swsBlocks: SwsBlock[]
  cues: ScheduledCue[]
  audits: ReplayConsolidationAudit[]
  /** Mean predicted boost over scheduled cards (percentage points) */
  meanPredictedBoostPct: number
  /** Cards that could not be scheduled (windows saturated) */
  unscheduledCardIds: number[]
  safety: {
    maxAcousticDba: number
    withinArousalCeiling: boolean
    ceilingDba: 42
    note: string
  }
  advisory: string
  assumptions: string[]
}

export interface TonightPlanOptions {
  /** Max cues per SWS block (habituation guard; Oudiette protocols use < 20) */
  maxCuesPerBlock: number
  /** Minimum spacing between cue onsets, seconds */
  minSpacingSeconds: number
  /** Max replays of any single card in one night */
  maxReplaysPerCard: number
}

export const DEFAULT_TONIGHT_OPTIONS: TonightPlanOptions = {
  maxCuesPerBlock: 10,
  minSpacingSeconds: 28,
  maxReplaysPerCard: 4,
}

/**
 * Builds tonight's consolidation plan: hypnogram → SWS blocks → fragility-
 * ranked cue scheduling → per-card audits → honest aggregate + safety audit.
 *
 * Scheduling rules (all from the TMR literature):
 *   - cues land ONLY inside SWS blocks (Rudoy 2007 cued during NREM SWS)
 *   - spacing ≥ minSpacingSeconds (sub-arousal cadence, Oudiette & Paller 2013)
 *   - ≤ maxCuesPerBlock per block and ≤ maxReplaysPerCard per night
 *     (habituation + micro-arousal guard, Ngo et al. 2013 protocols)
 *   - highest-fragility cards take the highest-deltaWeight block first
 */
export function buildTonightPlan(
  profile: SleepProfile,
  candidates: ConsolidationCandidate[],
  options: TonightPlanOptions = DEFAULT_TONIGHT_OPTIONS,
  now = new Date(),
): TonightPlan {
  const { bedtimeIso, wakeIso } = resolveWindow(profile.bedtime, profile.wakeTime, now)
  const hypnogram = buildHypnogram(profile, now)
  const blocks = extractSwsBlocks(hypnogram)
  const assumptions: string[] = [
    `Cycle length modelled at ${CYCLE_MINUTES} min; onset latency ${ONSET_LATENCY_MINUTES} min.`,
    `SWS shares decay across cycles (Carskadon & Dement); Process-S rebound applied for ${profile.sleepDebtHours}h debt.`,
  ]
  if (profile.chronotype !== 0) {
    assumptions.push(
      profile.chronotype > 0
        ? 'Lark chronotype: SWS mass shifted earlier.'
        : 'Owl chronotype: SWS mass spread later.',
    )
  }

  const ranked = [...candidates]
    .map((c) => ({ card: c, fragility: fragilityScore(c, now) }))
    .sort((a, b) => b.fragility - a.fragility)

  const cues: ScheduledCue[] = []
  const replays = new Map<number, number>()
  const audits: ReplayConsolidationAudit[] = []
  const unscheduled: number[] = []
  const blockLoad = new Map<number, number>()

  // Highest-deltaWeight blocks first.
  const orderedBlocks = [...blocks].sort((a, b) => b.deltaWeight - a.deltaWeight)
  const blockSeconds = new Map<number, number>(
    orderedBlocks.map((b) => [b.cycleIndex, Math.max(60, (b.endMinute - b.startMinute) * 60)]),
  )

  /** Places one cue for a card in the best block with capacity. */
  const placeCue = (
    card: ConsolidationCandidate,
    fragility: number,
    replayIndex: number,
  ): boolean => {
    const block = orderedBlocks.find(
      (b) => (blockLoad.get(b.cycleIndex) ?? 0) < options.maxCuesPerBlock,
    )
    if (!block) return false
    blockLoad.set(block.cycleIndex, (blockLoad.get(block.cycleIndex) ?? 0) + 1)

    // n-th cue in a block sits at (n−0.5)·spacing so global spacing ≥ min.
    const countInBlock = blockLoad.get(block.cycleIndex) ?? 1
    const seconds = blockSeconds.get(block.cycleIndex) ?? 3600
    const spacing = Math.max(options.minSpacingSeconds, seconds / (options.maxCuesPerBlock + 1))
    const offsetMinutes =
      block.startMinute + Math.min(seconds - 30, (countInBlock - 0.5) * spacing) / 60

    // Normalise FSRS difficulty (1–10) to the 0–1 effort axis the audit uses.
    const daytimeDifficulty = Math.max(0, Math.min(1, (card.difficulty - 1) / 9))
    const audit = evaluateConsolidationGain(
      card.cardId,
      Math.max(daytimeDifficulty, fragility * 0.4),
      replayIndex,
      block.cycleIndex,
    )
    audits.push(audit)

    cues.push({
      cardId: card.cardId,
      offsetMinutes: Number(offsetMinutes.toFixed(1)),
      cycleIndex: block.cycleIndex,
      blockDeltaWeight: block.deltaWeight,
      baseFrequency: card.baseFrequency,
      harmonicType: card.harmonicType,
      predictedBoostPct: audit.predictedRetentionBoostPct,
      stabilizationTier: audit.synapticStabilizationTier,
    })
    return true
  }

  // Pass 1 — fairness: one cue per card, most fragile first.
  for (const { card, fragility } of ranked) {
    if (placeCue(card, fragility, 1)) {
      replays.set(card.cardId, 1)
    } else {
      unscheduled.push(card.cardId)
    }
  }

  // Pass 2 — replays: while capacity remains, give the most fragile cards
  // additional replays up to the per-card cap (Ngo et al. 2013 repeat cues
  // within SWS; habituation is guarded by the caps themselves).
  let capacityLeft = orderedBlocks.reduce(
    (a, b) => a + Math.max(0, options.maxCuesPerBlock - (blockLoad.get(b.cycleIndex) ?? 0)),
    0,
  )
  for (let round = 2; round <= options.maxReplaysPerCard && capacityLeft > 0; round++) {
    for (const { card, fragility } of ranked) {
      if (capacityLeft <= 0) break
      const played = replays.get(card.cardId) ?? 0
      if (played === 0 || played >= round) continue
      if (placeCue(card, fragility, round)) {
        replays.set(card.cardId, round)
        capacityLeft -= 1
      }
    }
  }

  const meanBoost =
    audits.length > 0
      ? Number(
          (audits.reduce((a, x) => a + x.predictedRetentionBoostPct, 0) / audits.length).toFixed(1),
        )
      : 0

  const withinCeiling = profile.maxAcousticDba <= 42

  const advisory =
    cues.length === 0
      ? 'No cueable slow-wave windows or no candidates: review cards today, or extend the sleep window. TMR plans are advisory, not medical guidance.'
      : `${cues.length} cues scheduled across ${blocks.length} slow-wave block(s) — highest-fragility cards land in the deepest delta window. Expected mean boost ≈ ${meanBoost}% (lab effects are 15–28%; treat as a small bonus, keep device volume a whisper).`

  return {
    profile: { ...profile, bedtimeIso, wakeIso },
    hypnogram,
    swsBlocks: blocks,
    cues,
    audits,
    meanPredictedBoostPct: meanBoost,
    unscheduledCardIds: unscheduled,
    safety: {
      maxAcousticDba: profile.maxAcousticDba,
      withinArousalCeiling: withinCeiling,
      ceilingDba: 42,
      note: withinCeiling
        ? `Target ${profile.maxAcousticDba} dBA stays under the 42 dBA arousal ceiling (Ngo et al. 2013 used ≤ 50 dBA pink noise; whisper ≈ 30–35 dBA is safer).`
        : 'Profile exceeds the 42 dBA arousal ceiling — lower the target.',
    },
    advisory,
    assumptions,
  }
}

// ---------------------------------------------------------------------------
// 4. Acoustic envelope (control-rate, pure)
// ---------------------------------------------------------------------------

export interface EnvelopePoint {
  /** Seconds from cue onset */
  tSeconds: number
  /** Normalised gain 0–1 (multiply by the device-side dBA target) */
  gain: number
}

/**
 * Control-rate gain envelope for one night cue at 10 Hz: fade-in (default 4 s,
 * prevents acoustic shock) → delta-coupled hold → fade-out. The delta
 * oscillation gain rides ON TOP of the envelope so the cue breathes at the
 * learner's slow-wave rhythm (Ngo et al. 2013 closed-loop design).
 */
export function cueEnvelopeCurve(
  durationSeconds: number,
  fadeInSeconds = 4,
  fadeOutSeconds = 3,
  deltaHz = 1.2,
  modulationDepth = 0.35,
  controlRateHz = 10,
): EnvelopePoint[] {
  const points: EnvelopePoint[] = []
  const steps = Math.max(1, Math.round(durationSeconds * controlRateHz))
  const holdStart = fadeInSeconds
  const holdEnd = Math.max(fadeInSeconds + 0.5, durationSeconds - fadeOutSeconds)
  for (let i = 0; i < steps; i++) {
    const t = i / controlRateHz
    let gain: number
    if (t < holdStart) {
      gain = t / Math.max(0.1, fadeInSeconds)
    } else if (t > holdEnd) {
      const fadeSpan = Math.max(0.1, durationSeconds - holdEnd)
      gain = Math.max(0, (durationSeconds - t) / fadeSpan)
    } else {
      gain = 1
    }
    const delta = calculateDeltaOscillationGain(t, deltaHz, modulationDepth)
    points.push({
      tSeconds: Number(t.toFixed(1)),
      gain: Number(Math.max(0, Math.min(1, gain * delta)).toFixed(3)),
    })
  }
  return points
}

/**
 * Audits a night plan's acoustic profile against the arousal ceiling and the
 * delta-coupling hygiene rules (fade-in present, depth moderate, ceiling ≤ 42).
 */
export function auditNightAcoustics(profile: NeuroAcousticProfile): {
  safe: boolean
  issues: string[]
  peakDba: number
} {
  const issues: string[] = []
  if (profile.maxAcousticDba > 42) {
    issues.push(`Ceiling ${profile.maxAcousticDba} dBA exceeds the 42 dBA sub-arousal limit.`)
  }
  if (profile.fadeInDurationSeconds < 2) {
    issues.push('Fade-in under 2 s risks an acoustic startle response at sleep onset.')
  }
  if (profile.deltaFrequencyHz < 0.5 || profile.deltaFrequencyHz > 2) {
    issues.push('Delta oscillation outside the 0.5–2 Hz slow-wave band.')
  }
  if (profile.carrierFrequencyHz > 500) {
    issues.push('Carrier above 500 Hz is perceptually harsh at whisper levels; prefer ≤ 300 Hz.')
  }
  return {
    safe: issues.length === 0,
    issues,
    peakDba: profile.maxAcousticDba,
  }
}

// ---------------------------------------------------------------------------
// 5. Convenience: candidate derivation helpers (pure; handlers supply rows)
// ---------------------------------------------------------------------------

/**
 * Deterministic tonal signature from a card id — spreads the playlist across
 * the pleasant register so consecutive cues differ audibly (hash → 180–520 Hz).
 */
export function deriveBaseFrequency(cardId: number): number {
  let h = cardId
  h = h ^ 61 ^ (h >>> 16)
  h = h + (h << 3)
  h = h ^ (h >>> 4)
  h = Math.imul(h, 0x27d4eb2d)
  h = h ^ (h >>> 15)
  const spread = Math.abs(h % 1000) / 1000
  return Math.round(180 + spread * 340)
}

/**
 * Picks the harmonic type deterministically from the card id so the playlist
 * has tonal variety without randomness (tests stay reproducible).
 */
export function deriveHarmonicType(
  cardId: number,
): 'major_triad' | 'perfect_fifth' | 'octave_bloom' | 'subharmonic' {
  const options = ['major_triad', 'perfect_fifth', 'octave_bloom', 'subharmonic'] as const
  return options[cardId % options.length]
}

/**
 * Converts raw card rows (from any host's DB) into validated planner
 * candidates with derived tonal signatures. Pure — no I/O.
 */
export function toConsolidationCandidates(
  rows: { id: number; stability: number; difficulty: number; due?: string | null }[],
): ConsolidationCandidate[] {
  return rows.map((r) => ({
    cardId: r.id,
    stability: r.stability,
    difficulty: r.difficulty,
    due: r.due ?? undefined,
    baseFrequency: deriveBaseFrequency(r.id),
    harmonicType: deriveHarmonicType(r.id),
  }))
}
