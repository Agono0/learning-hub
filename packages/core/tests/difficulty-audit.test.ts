import { describe, expect, it } from 'vitest'
import {
  SELF_REPORT_PROMPTS,
  TECHNIQUE_IDS,
  TECHNIQUE_PROFILES,
  auditDesirableDifficulty,
  auditInterleaving,
  auditSpacing,
  auditTechniqueMix,
  fluencyIllusionRisk,
  substitutionPlan,
  techniqueProfile,
  type MeasuredBehavior,
  type SelfReportedBehavior,
} from '../src/difficulty-audit'

const FLUENCY_TRAP: SelfReportedBehavior = {
  windowDays: 7,
  minutesByTechnique: {
    rereading: 180,
    highlighting: 90,
    practice_testing: 30,
  },
}

const HEALTHY: SelfReportedBehavior = {
  windowDays: 7,
  minutesByTechnique: {
    practice_testing: 150,
    distributed_practice: 120,
    interleaved_practice: 60,
    rereading: 20,
  },
}

const MEASURED_HEALTHY: MeasuredBehavior = {
  retrievalMinutes: 180,
  sessionCount: 4,
  retrievalMinutesByDay: [20, 0, 30, 0, 40, 0, 90],
  consecutiveSameDeckReviews: 12,
  totalReviews: 80,
  distinctDecks: 4,
}

const MEASURED_CRAMMED: MeasuredBehavior = {
  retrievalMinutes: 120,
  sessionCount: 1,
  retrievalMinutesByDay: [0, 0, 0, 0, 0, 0, 120],
  consecutiveSameDeckReviews: 40,
  totalReviews: 45,
  distinctDecks: 2,
}

describe('Dunlosky et al. (2013) evidence table', () => {
  it('assigns exactly the monograph utility tiers', () => {
    const byId = new Map(TECHNIQUE_PROFILES.map((t) => [t.id, t]))
    expect(byId.get('practice_testing')!.utility).toBe('high')
    expect(byId.get('distributed_practice')!.utility).toBe('high')
    expect(byId.get('interleaved_practice')!.utility).toBe('moderate')
    expect(byId.get('self_explanation')!.utility).toBe('moderate')
    expect(byId.get('elaborative_interrogation')!.utility).toBe('moderate')
    for (const low of [
      'rereading',
      'highlighting',
      'summarization',
      'keyword_mnemonic',
      'imagery_for_text',
    ]) {
      expect(byId.get(low)!.utility).toBe('low')
    }
    expect(TECHNIQUE_PROFILES).toHaveLength(10)
    expect(new Set(TECHNIQUE_IDS).size).toBe(10)
  })

  it('orders scores so high > moderate > low with no ties across tiers', () => {
    const lows = TECHNIQUE_PROFILES.filter((t) => t.utility === 'low').map((t) => t.utilityScore)
    const highs = TECHNIQUE_PROFILES.filter((t) => t.utility === 'high').map((t) => t.utilityScore)
    const moderates = TECHNIQUE_PROFILES.filter((t) => t.utility === 'moderate').map(
      (t) => t.utilityScore,
    )
    expect(Math.min(...highs)).toBeGreaterThan(Math.max(...moderates))
    expect(Math.min(...moderates)).toBeGreaterThan(Math.max(...lows))
    for (const t of TECHNIQUE_PROFILES) {
      expect(t.evidenceNote).toContain('Dunlosky')
    }
  })

  it('exposes one studio prompt per technique with helper text', () => {
    expect(SELF_REPORT_PROMPTS).toHaveLength(10)
    for (const p of SELF_REPORT_PROMPTS) {
      expect(techniqueProfile(p.techniqueId)).toBeDefined()
      expect(p.helper.length).toBeGreaterThan(10)
    }
  })
})

describe('technique-mix audit', () => {
  it('computes the weighted difficulty dividend exactly', () => {
    const audit = auditTechniqueMix({
      windowDays: 7,
      minutesByTechnique: { practice_testing: 60, rereading: 60 },
    })
    // (0.5 × 95) + (0.5 × 25) = 60.
    expect(audit.difficultyDividend).toBe(60)
    expect(audit.totalMinutes).toBe(120)
    expect(audit.lowUtilityMinutes).toBe(60)
    expect(audit.highUtilityMinutes).toBe(60)
    expect(audit.dominantTechniqueId).toBe('practice_testing') // tie → first sorted entry keeps insertion order
  })

  it('flags the fluency trap profile and labels guidance', () => {
    const audit = auditTechniqueMix(FLUENCY_TRAP)
    expect(audit.status).toBe('fluency_trap')
    expect(audit.difficultyDividend).toBeLessThan(45)
    expect(audit.guidance).toContain('substitution plan')
  })

  it('recognizes a difficulty-healthy mix', () => {
    const audit = auditTechniqueMix(HEALTHY)
    expect(audit.status).toBe('difficulty_healthy')
    expect(audit.difficultyDividend).toBeGreaterThan(75)
    expect(audit.highUtilityMinutes / audit.totalMinutes).toBeGreaterThan(0.5)
  })

  it('returns no_data honestly when nothing is reported', () => {
    const audit = auditTechniqueMix({ windowDays: 7, minutesByTechnique: {} })
    expect(audit.status).toBe('no_data')
    expect(audit.totalMinutes).toBe(0)
    expect(audit.shares).toEqual([])
  })

  it('drops zero-minute and unknown technique entries defensively', () => {
    const audit = auditTechniqueMix({
      windowDays: 7,
      minutesByTechnique: { practice_testing: 30, rereading: 0, made_up_technique: 50 },
    })
    expect(audit.shares.map((s) => s.id)).toEqual(['practice_testing'])
  })
})

describe('fluency-illusion risk composition', () => {
  it('peaks for a rereading-dominated, retrieval-starved week', () => {
    const risk = fluencyIllusionRisk(
      { windowDays: 7, minutesByTechnique: { rereading: 300, highlighting: 100 } },
      { ...MEASURED_CRAMMED, retrievalMinutes: 5 },
    )
    expect(risk.risk).toBeGreaterThan(0.75)
    expect(risk.label).toBe('high')
    expect(risk.techniqueShareLow).toBe(1)
    expect(risk.drivers.length).toBeGreaterThanOrEqual(2)
  })

  it('is low for a retrieval-heavy, telemetry-backed week', () => {
    const risk = fluencyIllusionRisk(HEALTHY, MEASURED_HEALTHY)
    expect(risk.risk).toBeLessThan(0.3)
    expect(risk.label).toBe('low')
  })

  it('is honest when only telemetry exists (no self-report)', () => {
    const risk = fluencyIllusionRisk({ windowDays: 7, minutesByTechnique: {} }, MEASURED_HEALTHY)
    expect(risk.techniqueShareLow).toBeNull()
    expect(risk.drivers.some((d) => d.includes('self-reported'))).toBe(true)
    // 1 − 180/60 = 0 retrieval deficit → risk 0.35 × 0 = 0.
    expect(risk.risk).toBe(0)
  })

  it('clamps retrieval adequacy beyond the 60-minute floor', () => {
    const risk = fluencyIllusionRisk(HEALTHY, { ...MEASURED_HEALTHY, retrievalMinutes: 600 })
    expect(risk.retrievalAdequacy).toBe(1)
  })
})

describe('spacing audit (Cepeda et al. 2006)', () => {
  it('flags a one-day cram as massed', () => {
    const audit = auditSpacing(MEASURED_CRAMMED)
    expect(audit.verdict).toBe('massed')
    expect(audit.activeDayRatio).toBeLessThan(0.2)
    expect(audit.guidance).toContain('cram')
  })

  it('rewards a well-distributed week', () => {
    const audit = auditSpacing(MEASURED_HEALTHY)
    expect(audit.verdict).toBe('well_spaced')
    expect(audit.activeDayRatio).toBeGreaterThan(0.4)
    expect(audit.meanGapDays).toBeGreaterThan(0)
    expect(audit.spacingSpread).toBeGreaterThan(0.35)
  })

  it('treats an every-day week as acceptable (daily grind)', () => {
    const audit = auditSpacing({
      ...MEASURED_HEALTHY,
      retrievalMinutesByDay: [20, 20, 20, 20, 20, 20, 20],
    })
    expect(audit.verdict).toBe('daily_grind')
    expect(audit.activeDayRatio).toBe(1)
  })

  it('is honest with no telemetry', () => {
    const audit = auditSpacing({
      ...MEASURED_HEALTHY,
      retrievalMinutes: 0,
      retrievalMinutesByDay: [],
    })
    expect(audit.verdict).toBe('no_data')
    expect(audit.meanGapDays).toBeNull()
  })
})

describe('interleaving audit (Rohrer & Taylor 2007)', () => {
  it('flags long same-deck runs as blocked', () => {
    const audit = auditInterleaving({
      ...MEASURED_CRAMMED,
      consecutiveSameDeckReviews: 44,
      totalReviews: 45,
    })
    expect(audit.verdict).toBe('blocked')
    expect(audit.switchRate).toBeLessThanOrEqual(0.2)
    expect(audit.longestBlockRun).toBeGreaterThanOrEqual(10)
    expect(audit.guidance).toContain('shuffle')
  })

  it('rewards rapid deck switching', () => {
    const audit = auditInterleaving({
      ...MEASURED_HEALTHY,
      consecutiveSameDeckReviews: 4,
      totalReviews: 80,
    })
    expect(audit.verdict).toBe('well_interleaved')
    expect(audit.switchRate).toBeGreaterThanOrEqual(0.75)
  })

  it('requires two decks and a minimum sample', () => {
    const audit = auditInterleaving({ ...MEASURED_HEALTHY, totalReviews: 3, distinctDecks: 1 })
    expect(audit.verdict).toBe('no_data')
  })
})

describe('substitution plan', () => {
  it('moves low-utility minutes into the highest-utility technique with exact deltas', () => {
    const plan = substitutionPlan(FLUENCY_TRAP)
    // rereading 180 → move 144 (80%); highlighting 90 → move 72 (80%).
    expect(plan).toHaveLength(2)
    const rereadingSwap = plan.find((s) => s.fromId === 'rereading')!
    expect(rereadingSwap.minutesToMove).toBeCloseTo(144, 0)
    expect(rereadingSwap.toId).toBe('practice_testing')
    expect(rereadingSwap.dividendDelta).toBeCloseTo((144 * (95 - 25)) / 300, 1)
    expect(rereadingSwap.how).toContain('closed-book retrieval')
    // Highest delta first (rereading and highlighting share the low tier, so
    // the larger block wins).
    expect(plan[0].dividendDelta).toBeGreaterThanOrEqual(plan[1].dividendDelta)
  })

  it('moves only the low-utility remainder of a healthy mix (80% of a small block)', () => {
    const plan = substitutionPlan(HEALTHY)
    // HEALTHY still carries 20 min of rereading → 16 min moved to practice
    // testing; everything else is already high/moderate utility.
    expect(plan).toHaveLength(1)
    expect(plan[0].fromId).toBe('rereading')
    expect(plan[0].minutesToMove).toBeCloseTo(16, 1)
  })

  it('returns an empty plan for empty input', () => {
    expect(substitutionPlan({ windowDays: 7, minutesByTechnique: {} })).toEqual([])
  })

  it('keeps 20% of each low-utility block (no eradication orders)', () => {
    const plan = substitutionPlan({
      windowDays: 7,
      minutesByTechnique: { highlighting: 50 },
    })
    expect(plan[0].minutesToMove).toBeCloseTo(40, 1)
  })
})

describe('integrated audit report', () => {
  it('composes the composite index and a concrete next-best action', () => {
    const report = auditDesirableDifficulty(FLUENCY_TRAP, MEASURED_CRAMMED)
    expect(report.compositeIndex).toBeLessThan(40)
    expect(report.nextBestAction).toContain('closed-book retrieval')
    expect(report.substitutions.length).toBeGreaterThan(0)
    expect(report.dataSources.measured).toHaveLength(3)
    expect(report.dataSources.selfReported[0]).toContain('only you can see these')
  })

  it('is difficulty-healthy end to end for a strong week', () => {
    const report = auditDesirableDifficulty(HEALTHY, MEASURED_HEALTHY)
    expect(report.compositeIndex).toBeGreaterThan(70)
    expect(report.mix.status).toBe('difficulty_healthy')
    expect(report.spacing.verdict).toBe('well_spaced')
    expect(report.interleaving.verdict).toBe('well_interleaved')
    // The single remaining low-utility block becomes the next best action.
    expect(report.nextBestAction).toContain('retrieval')
  })

  it('routes telemetry-only learners honestly (empty self-report, real reviews)', () => {
    const report = auditDesirableDifficulty(
      { windowDays: 7, minutesByTechnique: {} },
      MEASURED_HEALTHY,
    )
    expect(report.mix.status).toBe('no_data')
    // Dividend 0 → composite 0.6·0 + 0.4·(0.5·95 + 0.5·95) = 38.
    expect(report.compositeIndex).toBeCloseTo(38, 0)
    expect(report.nextBestAction).toContain('Log one week')
  })
})
