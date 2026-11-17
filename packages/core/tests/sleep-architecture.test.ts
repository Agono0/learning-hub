import { describe, expect, it } from 'vitest'
import { DEFAULT_NEURO_ACOUSTIC_PROFILE } from '../src/tmr/neuro-acoustic'
import {
  DEFAULT_TONIGHT_OPTIONS,
  auditNightAcoustics,
  buildHypnogram,
  buildTonightPlan,
  cueEnvelopeCurve,
  deriveBaseFrequency,
  deriveHarmonicType,
  extractSwsBlocks,
  fragilityScore,
  toConsolidationCandidates,
  type ConsolidationCandidate,
  type SleepProfile,
} from '../src/tmr/sleep-architecture'

const BASE_PROFILE: SleepProfile = {
  bedtime: '23:00',
  wakeTime: '07:00',
  chronotype: 0,
  sleepDebtHours: 0,
  personalNeedHours: 8,
  maxAcousticDba: 35,
}

const CANDIDATES: ConsolidationCandidate[] = [
  {
    cardId: 1,
    stability: 0.8,
    difficulty: 8,
    due: new Date(Date.now() + 86400000).toISOString(),
    baseFrequency: 220,
    harmonicType: 'major_triad',
  },
  { cardId: 2, stability: 4, difficulty: 5, baseFrequency: 330, harmonicType: 'perfect_fifth' },
  { cardId: 3, stability: 18, difficulty: 3, baseFrequency: 440, harmonicType: 'octave_bloom' },
  { cardId: 4, stability: 1.5, difficulty: 9, baseFrequency: 550, harmonicType: 'subharmonic' },
]

describe('sleep hypnogram model (Carskadon & Dement architecture)', () => {
  it('builds contiguous, ordered segments covering the sleep window', () => {
    const h = buildHypnogram(BASE_PROFILE)
    expect(h.totalOpportunityMinutes).toBe(480) // 23:00 → 07:00
    expect(h.cycleCount).toBe(5) // 468 sleep minutes / 95
    expect(h.segments.length).toBeGreaterThan(4)
    expect(h.segments[0].startMinute).toBe(12) // onset latency

    for (let i = 1; i < h.segments.length; i++) {
      expect(h.segments[i].startMinute).toBe(h.segments[i - 1].endMinute)
    }
    for (const s of h.segments) {
      expect(s.endMinute).toBeLessThanOrEqual(480)
      expect(s.endMinute).toBeGreaterThan(s.startMinute)
    }
    // ISO instants are UTC-encoded; assert on local wall-clock components so
    // the test is timezone-independent.
    expect(new Date(h.bedtimeIso).getHours()).toBe(23)
    expect(new Date(h.wakeIso).getHours()).toBe(7)
    // The wake resolves to the next morning (07:00 after 23:00 bedtime).
    expect(new Date(h.wakeIso).getDate()).not.toBe(new Date(h.bedtimeIso).getDate())
  })

  it('resolves an after-midnight bedtime without wrapping the wake a full day', () => {
    const h = buildHypnogram({ ...BASE_PROFILE, bedtime: '01:30', wakeTime: '07:30' })
    expect(h.totalOpportunityMinutes).toBe(360)
    expect(new Date(h.wakeIso).getDate()).toBe(new Date(h.bedtimeIso).getDate())
  })

  it('keeps SWS front-loaded: early cycles carry more N3 than late ones', () => {
    const h = buildHypnogram(BASE_PROFILE)
    const n3ByCycle = new Map<number, number>()
    for (const s of h.segments) {
      if (s.stage === 'n3') {
        n3ByCycle.set(
          s.cycleIndex,
          (n3ByCycle.get(s.cycleIndex) ?? 0) + (s.endMinute - s.startMinute),
        )
      }
    }
    const c1 = n3ByCycle.get(1) ?? 0
    const c2 = n3ByCycle.get(2) ?? 0
    const c3 = n3ByCycle.get(3) ?? 0
    expect(c1).toBeGreaterThan(c2)
    expect(c2).toBeGreaterThan(c3)
    expect(h.swsShare).toBeGreaterThan(0.1)
    expect(h.swsShare).toBeLessThan(0.5)
    expect(h.remShare).toBeGreaterThan(0.05)
  })

  it('applies Process-S rebound: sleep debt deepens early-night N3', () => {
    const rested = buildHypnogram(BASE_PROFILE)
    const debt = buildHypnogram({ ...BASE_PROFILE, sleepDebtHours: 8 })
    expect(debt.swsShare).toBeGreaterThan(rested.swsShare)
  })

  it('shifts SWS with chronotype: larks earlier, owls later', () => {
    const lark = buildHypnogram({ ...BASE_PROFILE, chronotype: 1 })
    const owl = buildHypnogram({ ...BASE_PROFILE, chronotype: -1 })
    const firstCycleN3 = (h: ReturnType<typeof buildHypnogram>) =>
      h.segments
        .filter((s) => s.stage === 'n3' && s.cycleIndex === 1)
        .reduce((a, s) => a + (s.endMinute - s.startMinute), 0)
    expect(firstCycleN3(lark)).toBeGreaterThan(firstCycleN3(owl))
    // And the owl still has usable late-night SWS (never below the floor).
    expect(owl.segments.some((s) => s.stage === 'n3' && s.cycleIndex >= 2)).toBe(true)
  })

  it('clamps an absurd 23-hour window instead of producing a monster hypnogram', () => {
    const h = buildHypnogram({ ...BASE_PROFILE, bedtime: '07:30', wakeTime: '07:00' })
    expect(h.totalOpportunityMinutes).toBeLessThanOrEqual(16 * 60)
  })
})

describe('SWS block extraction', () => {
  it('extracts delta-weighted blocks ≥ 12 minutes and decays weight by cycle', () => {
    const h = buildHypnogram(BASE_PROFILE)
    const blocks = extractSwsBlocks(h)
    expect(blocks.length).toBeGreaterThanOrEqual(1)
    for (const b of blocks) {
      expect(b.endMinute - b.startMinute).toBeGreaterThanOrEqual(12)
      expect(b.deltaWeight).toBeGreaterThan(0)
      expect(b.deltaWeight).toBeLessThanOrEqual(1)
    }
    // Cycle 1 block is the strongest.
    const c1 = blocks.find((b) => b.cycleIndex === 1)
    const later = blocks.filter((b) => b.cycleIndex > 1)
    if (c1 && later.length > 0) {
      expect(c1.deltaWeight).toBeGreaterThan(Math.max(...later.map((b) => b.deltaWeight)))
    }
  })
})

describe('FSRS fragility ranking', () => {
  it('scores fragile, due-soon, hard cards highest and consolidated cards near zero', () => {
    const fragile = fragilityScore(CANDIDATES[0])
    // stability 18/21 → 0.14 factor, difficulty 3 → 0.22, no due → 0.4 default:
    // 0.45·0.143 + 0.3·0.222 + 0.25·0.4 = 0.231 — low but not zero.
    const stable = fragilityScore(CANDIDATES[2])
    expect(fragile).toBeGreaterThan(0.6)
    expect(stable).toBeLessThan(0.3)
    expect(fragilityScore(CANDIDATES[1])).toBeGreaterThan(stable)
  })

  it('uses a mild default urgency when no due date exists', () => {
    const noDue = fragilityScore({
      cardId: 9,
      stability: 1,
      difficulty: 5,
      baseFrequency: 300,
      harmonicType: 'major_triad',
    })
    expect(noDue).toBeGreaterThan(0)
    expect(noDue).toBeLessThan(1)
  })
})

describe('tonight plan builder', () => {
  it('schedules cues only inside SWS blocks, honoring spacing and per-block caps', () => {
    const plan = buildTonightPlan(BASE_PROFILE, CANDIDATES)
    const blockByCycle = new Map(plan.swsBlocks.map((b) => [b.cycleIndex, b]))

    expect(plan.cues.length).toBeGreaterThan(0)
    for (const cue of plan.cues) {
      const block = blockByCycle.get(cue.cycleIndex)
      expect(block).toBeDefined()
      expect(cue.offsetMinutes).toBeGreaterThanOrEqual(block!.startMinute)
      expect(cue.offsetMinutes).toBeLessThan(block!.endMinute)
      expect(cue.blockDeltaWeight).toBe(block!.deltaWeight)
      expect(cue.predictedBoostPct).toBeGreaterThanOrEqual(0)
    }

    // Same-block cues respect the minimum spacing.
    const byCycle = new Map<number, number[]>()
    for (const cue of plan.cues) {
      byCycle.set(cue.cycleIndex, [...(byCycle.get(cue.cycleIndex) ?? []), cue.offsetMinutes])
    }
    for (const [cycle, offsets] of byCycle) {
      const sorted = [...offsets].sort((a, b) => a - b)
      for (let i = 1; i < sorted.length; i++) {
        const gapSeconds = (sorted[i] - sorted[i - 1]) * 60
        expect(gapSeconds).toBeGreaterThanOrEqual(DEFAULT_TONIGHT_OPTIONS.minSpacingSeconds - 0.01)
      }
      const block = blockByCycle.get(cycle)!
      expect(sorted.length).toBeLessThanOrEqual(DEFAULT_TONIGHT_OPTIONS.maxCuesPerBlock)
      void block
    }
  })

  it('places the most fragile card in the highest-delta block first', () => {
    const plan = buildTonightPlan(BASE_PROFILE, CANDIDATES)
    const first = plan.cues[0]
    expect(first.cardId).toBe(1) // lowest stability, highest difficulty, due soon
    expect(first.blockDeltaWeight).toBe(Math.max(...plan.swsBlocks.map((b) => b.deltaWeight)))
  })

  it('adds replays up to the per-card cap while capacity remains', () => {
    const fewCandidates: ConsolidationCandidate[] = [
      {
        cardId: 11,
        stability: 0.5,
        difficulty: 9,
        baseFrequency: 200,
        harmonicType: 'major_triad',
      },
      {
        cardId: 12,
        stability: 1,
        difficulty: 7,
        baseFrequency: 260,
        harmonicType: 'perfect_fifth',
      },
    ]
    const plan = buildTonightPlan(BASE_PROFILE, fewCandidates)
    const counts = new Map<number, number>()
    for (const cue of plan.cues) counts.set(cue.cardId, (counts.get(cue.cardId) ?? 0) + 1)
    // Two cards cannot saturate five SWS blocks — replays fill the capacity.
    const totalCues = [...counts.values()].reduce((a, b) => a + b, 0)
    expect(totalCues).toBeGreaterThan(fewCandidates.length)
    for (const count of counts.values()) {
      expect(count).toBeLessThanOrEqual(DEFAULT_TONIGHT_OPTIONS.maxReplaysPerCard)
    }
    expect(plan.unscheduledCardIds).toEqual([])
  })

  it('marks saturated candidates unscheduled when capacity is exhausted', () => {
    const many: ConsolidationCandidate[] = Array.from({ length: 40 }, (_, i) => ({
      cardId: i + 100,
      stability: 0.5 + (i % 5),
      difficulty: 3 + (i % 7),
      baseFrequency: 200 + i,
      harmonicType: 'major_triad' as const,
    }))
    const plan = buildTonightPlan(BASE_PROFILE, many)
    // 480-min night → 5 modelled cycles, but cycles 4–5 carry < 12 min of N3
    // and are dropped as uncueable: 3 blocks × 10 cues = 30 capacity. 40
    // candidates cannot all fit → the most fragile fill the windows first and
    // the remainder are honestly reported unscheduled.
    expect(plan.cues.length).toBeLessThanOrEqual(30)
    expect(plan.unscheduledCardIds.length).toBeGreaterThan(0)
    // Every scheduled card appears exactly once in pass 1 (capacity < cards).
    const counts = new Map<number, number>()
    for (const cue of plan.cues) counts.set(cue.cardId, (counts.get(cue.cardId) ?? 0) + 1)
    for (const count of counts.values()) expect(count).toBe(1)
  })

  it('returns an honest empty plan with no candidates', () => {
    const plan = buildTonightPlan(BASE_PROFILE, [])
    expect(plan.cues).toEqual([])
    expect(plan.audits).toEqual([])
    expect(plan.meanPredictedBoostPct).toBe(0)
    expect(plan.advisory).toContain('advisory')
    expect(plan.safety.withinArousalCeiling).toBe(true)
  })

  it('audits acoustics: flags ceilings above 42 dBA and bad fade-in', () => {
    const safe = auditNightAcoustics(DEFAULT_NEURO_ACOUSTIC_PROFILE)
    expect(safe.safe).toBe(true)
    expect(safe.issues).toEqual([])

    const unsafe = auditNightAcoustics({
      noiseType: 'pink_noise',
      carrierFrequencyHz: 800,
      deltaFrequencyHz: 3,
      maxAcousticDba: 50,
      fadeInDurationSeconds: 1,
      interCueIntervalRange: [25, 45],
    })
    expect(unsafe.safe).toBe(false)
    expect(unsafe.issues.length).toBe(4)
    expect(unsafe.issues.some((i) => i.includes('42 dBA'))).toBe(true)
  })

  it('reports ceiling violations in the plan safety block', () => {
    const plan = buildTonightPlan({ ...BASE_PROFILE, maxAcousticDba: 45 }, CANDIDATES)
    expect(plan.safety.withinArousalCeiling).toBe(false)
    expect(plan.safety.note).toContain('exceeds')
  })

  it('records its modelling assumptions transparently', () => {
    const plan = buildTonightPlan(BASE_PROFILE, CANDIDATES)
    expect(plan.assumptions.length).toBeGreaterThanOrEqual(2)
    expect(plan.assumptions[0]).toContain('95 min')
    const owlPlan = buildTonightPlan({ ...BASE_PROFILE, chronotype: -1 }, CANDIDATES)
    expect(owlPlan.assumptions.some((a) => a.includes('Owl'))).toBe(true)
  })
})

describe('acoustic envelope curve (control rate)', () => {
  it('fades in, delta-modulates the hold, and fades out without exceeding 1', () => {
    const curve = cueEnvelopeCurve(8, 4, 3, 1.2, 0.35)
    expect(curve.length).toBe(80) // 8 s × 10 Hz
    const peak = Math.max(...curve.map((p) => p.gain))
    expect(peak).toBeLessThanOrEqual(1)
    expect(peak).toBeGreaterThan(0.6)
    // Rise then fall shape.
    expect(curve[0].gain).toBe(0)
    const last = curve[curve.length - 1].gain
    expect(last).toBeLessThan(0.5)
    // With modulation OFF the fade-in is strictly monotone — the modulated
    // curve oscillates by design (delta rides on top of the envelope), so
    // monotonicity is asserted on the envelope itself, not the product.
    const plain = cueEnvelopeCurve(8, 4, 3, 1.2, 0)
    const fadeIn = plain.filter((p) => p.tSeconds <= 4)
    for (let i = 1; i < fadeIn.length; i++) {
      expect(fadeIn[i].gain).toBeGreaterThanOrEqual(fadeIn[i - 1].gain)
    }
    // Modulated version stays inside [0, 1] everywhere.
    expect(curve.every((p) => p.gain >= 0 && p.gain <= 1)).toBe(true)
  })

  it('survives a cue shorter than its fade-in without exploding', () => {
    const curve = cueEnvelopeCurve(2, 4, 3)
    expect(curve.every((p) => p.gain >= 0 && p.gain <= 1)).toBe(true)
    expect(curve.length).toBe(20)
  })
})

describe('deterministic tonal signatures', () => {
  it('derives stable base frequencies in the pleasant register', () => {
    for (let id = 1; id <= 50; id++) {
      const f = deriveBaseFrequency(id)
      expect(f).toBeGreaterThanOrEqual(180)
      expect(f).toBeLessThanOrEqual(520)
      expect(f).toBe(deriveBaseFrequency(id)) // deterministic
    }
    // Variety: not all identical.
    const freqs = new Set(Array.from({ length: 20 }, (_, i) => deriveBaseFrequency(i + 1)))
    expect(freqs.size).toBeGreaterThan(5)
  })

  it('cycles harmonic types deterministically', () => {
    expect(deriveHarmonicType(1)).toBe('perfect_fifth')
    expect(deriveHarmonicType(4)).toBe('major_triad')
    expect(deriveHarmonicType(5)).toBe('perfect_fifth')
  })

  it('converts raw DB rows into planner candidates with derived signatures', () => {
    const candidates = toConsolidationCandidates([
      { id: 7, stability: 2.5, difficulty: 6, due: '2026-11-18T00:00:00.000Z' },
      { id: 8, stability: 0, difficulty: 0 },
    ])
    expect(candidates).toHaveLength(2)
    expect(candidates[0].cardId).toBe(7)
    expect(candidates[0].baseFrequency).toBe(deriveBaseFrequency(7))
    expect(candidates[0].harmonicType).toBe(deriveHarmonicType(7))
    expect(candidates[0].due).toBe('2026-11-18T00:00:00.000Z')
    expect(candidates[1].due).toBeUndefined()
  })
})
