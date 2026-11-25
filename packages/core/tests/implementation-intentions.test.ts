/**
 * @file implementation-intentions.test.ts
 * @description Unit tests for the Implementation Intentions & Habit Formation
 * engine: plan quality rubric, Lally et al. (2009) automaticity projection,
 * template instantiation, obstacle library, and the FSRS-6 bridge.
 */
import { describe, expect, it } from 'vitest'
import {
  AUTOMATICITY_CURVE_DEFAULTS,
  CANONICAL_PLAN_TEMPLATES,
  evaluatePlanQuality,
  generateIIFSRSCards,
  getCanonicalPlanTemplates,
  getPlanTemplateById,
  II_META_EFFECT_SIZE,
  IfThenPlanSchema,
  instantiateTemplate,
  LALLY_MEDIAN_DAYS,
  LALLY_RANGE_DAYS,
  listTemplateDomains,
  OBSTACLE_LIBRARY,
  projectAutomaticity,
  type AdherenceDay,
} from '../src/implementation-intentions'

function makePlan(overrides: Partial<Parameters<typeof IfThenPlanSchema.parse>[0]> = {}) {
  return IfThenPlanSchema.parse({
    id: 'p1',
    goal: 'Study daily',
    trigger: 'After I finish breakfast at the kitchen table',
    triggerKind: 'event',
    action: 'I open the review queue and complete my due cards',
    obstacle: 'Phone notifications',
    obstacleResponse: 'If a notification appears, then I note it and return to the card',
    ...overrides,
  })
}

function days(n: number, performedEvery = 1): AdherenceDay[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    performed: i % performedEvery === 0,
  }))
}

describe('research constants', () => {
  it('documents the Gollwitzer & Sheeran (2006) effect size', () => {
    expect(II_META_EFFECT_SIZE).toBeCloseTo(0.65, 2)
  })

  it('documents the Lally et al. (2009) anchors', () => {
    expect(LALLY_MEDIAN_DAYS).toBe(66)
    expect(LALLY_RANGE_DAYS).toEqual({ min: 18, max: 254 })
    expect(AUTOMATICITY_CURVE_DEFAULTS.referenceMedianDays).toBe(66)
  })
})

describe('evaluatePlanQuality', () => {
  it('scores a complete MCII plan highly', () => {
    const q = evaluatePlanQuality(makePlan())
    expect(q.qualityIndex).toBeGreaterThanOrEqual(70)
    expect(q.rationales.length).toBe(4)
  })

  it('penalizes vague actions', () => {
    const vague = evaluatePlanQuality(makePlan({ action: 'I will try to maybe work on stuff' }))
    const concrete = evaluatePlanQuality(makePlan())
    expect(vague.actionOperationality).toBeLessThan(concrete.actionOperationality)
    expect(vague.qualityIndex).toBeLessThan(concrete.qualityIndex)
  })

  it('rewards specific time-marked triggers', () => {
    const timed = evaluatePlanQuality(
      makePlan({ trigger: 'At 7:30 am on weekdays when my alarm ends', triggerKind: 'time' }),
    )
    const vague = evaluatePlanQuality(makePlan({ trigger: 'sometime soon', triggerKind: 'time' }))
    expect(timed.triggerSpecificity).toBeGreaterThan(vague.triggerSpecificity)
  })

  it('rates event cues above internal-state cues for reliability', () => {
    const event = evaluatePlanQuality(makePlan({ triggerKind: 'event' }))
    const internal = evaluatePlanQuality(makePlan({ triggerKind: 'internal_state' }))
    expect(event.cueReliability).toBeGreaterThan(internal.cueReliability)
  })

  it('penalizes plans without a coping response', () => {
    const bare = evaluatePlanQuality(makePlan({ obstacle: undefined, obstacleResponse: undefined }))
    expect(bare.obstacleCoverage).toBeLessThan(30)
  })

  it('keeps every score within 0..100 on adversarial input', () => {
    const q = evaluatePlanQuality(
      makePlan({ trigger: 'x', action: 'try maybe', triggerKind: 'internal_state' }),
    )
    for (const key of [
      'triggerSpecificity',
      'actionOperationality',
      'cueReliability',
      'obstacleCoverage',
      'qualityIndex',
    ] as const) {
      expect(q[key]).toBeGreaterThanOrEqual(0)
      expect(q[key]).toBeLessThanOrEqual(100)
    }
  })
})

describe('projectAutomaticity', () => {
  it('projects ~0 days remaining when already at automaticity', () => {
    const p = projectAutomaticity(days(200))
    expect(p.currentStrength).toBeGreaterThanOrEqual(95)
    expect(p.daysToAutomaticity).toBe(0)
  })

  it('reaches ~95% at the Lally median under perfect adherence', () => {
    const p = projectAutomaticity(days(66))
    expect(p.currentStrength).toBeGreaterThanOrEqual(90)
    expect(p.currentStrength).toBeLessThanOrEqual(100)
  })

  it('slower adherence extends the projection', () => {
    const daily = projectAutomaticity(days(30, 1))
    const half = projectAutomaticity(days(30, 2))
    expect(half.daysToAutomaticity).toBeGreaterThan(daily.daysToAutomaticity)
  })

  it('higher complexity extends the projection', () => {
    const simple = projectAutomaticity(days(30), 1)
    const complex = projectAutomaticity(days(30), 1.5)
    expect(complex.daysToAutomaticity).toBeGreaterThan(simple.daysToAutomaticity)
  })

  it('an empty record yields strength 0 with an honest caveat', () => {
    const p = projectAutomaticity([])
    expect(p.currentStrength).toBe(0)
    expect(p.adherenceRate).toBe(0)
    expect(p.caveat.length).toBeGreaterThan(0)
  })

  it('computes the current streak from the record tail', () => {
    const record = days(10)
    record[9].performed = true
    record[8].performed = true
    record[7].performed = false
    const p = projectAutomaticity(record)
    expect(p.currentStreak).toBe(2)
  })

  it('never reports negative days', () => {
    expect(projectAutomaticity(days(365)).daysToAutomaticity).toBe(0)
  })
})

describe('plan templates', () => {
  it('offers templates across multiple domains', () => {
    expect(CANONICAL_PLAN_TEMPLATES.length).toBeGreaterThanOrEqual(8)
    expect(listTemplateDomains().length).toBeGreaterThanOrEqual(5)
  })

  it('every template carries full MCII scaffolding', () => {
    for (const t of CANONICAL_PLAN_TEMPLATES) {
      expect(t.triggerFrame.length).toBeGreaterThan(10)
      expect(t.actionFrame.length).toBeGreaterThan(10)
      expect(t.commonObstacle.length).toBeGreaterThan(0)
      expect(t.obstacleResponseFrame.length).toBeGreaterThan(0)
    }
  })

  it('lookup round-trips and unknown ids return undefined', () => {
    const first = getCanonicalPlanTemplates()[0]
    expect(getPlanTemplateById(first.id)?.id).toBe(first.id)
    expect(getPlanTemplateById('nope')).toBeUndefined()
  })

  it('instantiateTemplate produces a schema-valid plan', () => {
    const plan = instantiateTemplate('ii-study-spaced-review', 'Master organic chemistry')
    expect(plan.goal).toBe('Master organic chemistry')
    expect(plan.triggerKind).toBe('event')
    expect(() => IfThenPlanSchema.parse(plan)).not.toThrow()
  })

  it('instantiateTemplate throws on unknown ids', () => {
    expect(() => instantiateTemplate('nope', 'goal')).toThrow()
  })
})

describe('obstacle library', () => {
  it('covers the recurring obstacle categories', () => {
    const categories = new Set(OBSTACLE_LIBRARY.map((o) => o.category))
    expect(categories.has('energy')).toBe(true)
    expect(categories.has('distraction')).toBe(true)
    expect(categories.has('emotion')).toBe(true)
  })

  it('every entry pairs an obstacle with a response pattern', () => {
    for (const o of OBSTACLE_LIBRARY) {
      expect(o.obstacle.length).toBeGreaterThan(5)
      expect(o.responsePattern.length).toBeGreaterThan(20)
    }
  })
})

describe('generateIIFSRSCards', () => {
  it('emits one card per template plus one per obstacle', () => {
    const cards = generateIIFSRSCards()
    expect(cards.length).toBe(CANONICAL_PLAN_TEMPLATES.length + OBSTACLE_LIBRARY.length)
  })

  it('respects a template subset', () => {
    const cards = generateIIFSRSCards(['ii-study-spaced-review'])
    expect(cards.length).toBe(1 + OBSTACLE_LIBRARY.length)
    expect(cards.filter((c) => c.sourceRef === 'ii-template:ii-study-spaced-review').length).toBe(1)
  })

  it('ignores unknown ids', () => {
    const cards = generateIIFSRSCards(['nope'])
    expect(cards.length).toBe(OBSTACLE_LIBRARY.length)
  })

  it('cards carry non-empty front and back', () => {
    for (const c of generateIIFSRSCards()) {
      expect(c.front.length).toBeGreaterThan(0)
      expect(c.back.length).toBeGreaterThan(0)
    }
  })
})
