/**
 * Unit Tests for the Categorization Study Planner
 *
 * Verifies (CI-only — tests never run locally, AGENTS.md rule 17):
 * 1. Determinism: identical (sessions, now) → identical schedule
 * 2. Empty history → the first canonical set is the frontier, day 0 carries
 *    a frontier block of discriminating trials
 * 3. Expanding retrieval: mastered sets refresh at +1/+3/+7/+14 days
 *    (Landauer & Bjork 1978) with correct ladder ordinals, elapsed steps
 *    skipped, steps past the horizon excluded
 * 4. Interleaving: no two consecutive blocks from the same set (Kang 2016)
 * 5. Daily budget: frontier keeps its slot, refreshes defer (never drop)
 * 6. Full mastery → no frontier, honest rest-day notes
 * 7. zod boundary rejections and unknown-set handling
 */

import { describe, expect, it } from 'vitest'
import {
  CANONICAL_CATEGORIZATION_SETS,
  FIVE_FOUR_STRUCTURE_SET,
  PROTOTYPE_DISTORTION_SET,
  planDiscriminatingBlock,
  planCategorizationStudy,
  studyPlanOptionsSchema,
  summarizeStudyHistory,
  type StudyPlanSession,
} from '../src/prototype-exemplar'

const NOW = '2026-01-15T09:00:00.000Z'

function session(
  setId: string,
  completedAt: string,
  accuracy: number,
  overrides: Partial<StudyPlanSession> = {},
): StudyPlanSession {
  return {
    setId,
    completedAt,
    accuracy,
    transferAccuracy: overrides.transferAccuracy ?? accuracy,
    tsc: overrides.tsc ?? 70,
    cri: overrides.cri ?? Math.round(0.35 * 70 + 0.4 * accuracy + 0.25 * 75),
    maturityBand: overrides.maturityBand ?? 'boundary_tracer',
  }
}

describe('study-plan determinism', () => {
  it('returns an identical schedule for identical input', () => {
    const sessions = [
      session('proto-bird-typicality', '2026-01-10T12:00:00.000Z', 88),
      session('proto-bird-typicality', '2026-01-12T12:00:00.000Z', 92),
    ]
    const options = { now: NOW, horizonDays: 10 }
    const a = planCategorizationStudy(sessions, options)
    const b = planCategorizationStudy(sessions, options)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('never reads the wall clock — different runs months apart differ only via `now`', () => {
    const sessions = [session('proto-bird-typicality', '2026-01-10T12:00:00.000Z', 50)]
    const january = planCategorizationStudy(sessions, { now: '2026-01-15T00:00:00.000Z' })
    const june = planCategorizationStudy(sessions, { now: '2026-06-15T00:00:00.000Z' })
    expect(january.days[0]!.day).toBe('2026-01-15')
    expect(june.days[0]!.day).toBe('2026-06-15')
  })
})

describe('frontier selection', () => {
  it('with no history, the first canonical set is the frontier and day 0 has one frontier block', () => {
    const plan = planCategorizationStudy([], { now: NOW, horizonDays: 5 })
    expect(plan.frontierSetId).toBe(CANONICAL_CATEGORIZATION_SETS[0]!.id)
    expect(plan.days).toHaveLength(5)
    expect(plan.days[0]!.day).toBe('2026-01-15')
    expect(plan.days[0]!.blocks).toHaveLength(1)
    const block = plan.days[0]!.blocks[0]!
    expect(block.kind).toBe('frontier')
    expect(block.setId).toBe('proto-bird-typicality')
    expect(block.trials.length).toBe(6)
    // Trials ARE the engine's discriminating trials for that set.
    const enginePlan = planDiscriminatingBlock(CANONICAL_CATEGORIZATION_SETS[0]!, 6)
    expect(block.trials).toEqual(enginePlan.trials)
    // Days 1..4 also carry the daily frontier block.
    expect(plan.days[3]!.blocks[0]!.kind).toBe('frontier')
    // Notes are honest about the mastery rule.
    expect(plan.notes[0]).toContain('Day 0 is 2026-01-15')
  })

  it('the frontier advances past fully-mastered sets in canonical order', () => {
    const sessions = [
      session('proto-bird-typicality', '2026-01-12T08:00:00.000Z', 95),
      session('proto-bird-typicality', '2026-01-13T08:00:00.000Z', 90),
    ]
    const plan = planCategorizationStudy(sessions, { now: NOW, horizonDays: 3 })
    expect(plan.frontierSetId).toBe(PROTOTYPE_DISTORTION_SET.id)
    expect(plan.days[0]!.blocks[0]!.setId).toBe(PROTOTYPE_DISTORTION_SET.id)
  })

  it('when every canonical set is mastered there is no frontier and rest days are noted', () => {
    const sessions = CANONICAL_CATEGORIZATION_SETS.flatMap((set) => [
      session(set.id, '2026-01-11T08:00:00.000Z', 100),
      session(set.id, '2026-01-13T08:00:00.000Z', 96),
    ])
    const plan = planCategorizationStudy(sessions, { now: NOW, horizonDays: 4 })
    expect(plan.frontierSetId).toBeNull()
    // Anchor = latest session (01-13): +1d elapsed, +3d = 01-16 → day 1,
    // +7d falls past the 4-day horizon → exactly one refresh per set, all on day 1.
    const day1 = plan.days[1]!.blocks
    expect(day1.length).toBeGreaterThanOrEqual(4) // budget caps at 4
    expect(day1.every((b) => b.kind === 'refresh')).toBe(true)
    // Day 0 and day 3 are honest rest days (spacing needs gaps).
    expect(plan.days[0]!.blocks).toHaveLength(0)
    expect(plan.notes.some((n) => n.includes('rest day'))).toBe(true)
  })
})

describe('expanding retrieval (Landauer & Bjork 1978)', () => {
  it('schedules mastered-set refreshes on the expanding ladder with correct ordinals', () => {
    // Two bird sessions at 90%+ → mastered; anchor = 2026-01-12.
    const sessions = [
      session('proto-bird-typicality', '2026-01-10T08:00:00.000Z', 85),
      session('proto-bird-typicality', '2026-01-12T08:00:00.000Z', 90),
    ]
    const plan = planCategorizationStudy(sessions, { now: NOW, horizonDays: 10 })
    // Ladder from the anchor: +1d = 01-13 (elapsed before 01-15, skipped),
    // +3d = 01-15 (day 0), +7d = 01-19 (day 4), +14d = 01-26 (day 11 — past horizon 10).
    const day0 = plan.days[0]!.blocks.filter((b) => b.kind === 'refresh')
    expect(day0).toHaveLength(1)
    expect(day0[0]!.setId).toBe('proto-bird-typicality')
    expect(day0[0]!.intervalDays).toBe(3)
    expect(day0[0]!.retrievalOrdinal).toBe(2)
    const day4Refresh = plan.days[4]!.blocks.filter((b) => b.kind === 'refresh')
    expect(day4Refresh).toHaveLength(1)
    expect(day4Refresh[0]!.intervalDays).toBe(7)
    expect(day4Refresh[0]!.retrievalOrdinal).toBe(3)
    // No refresh lands on days 1-3 or past day 4.
    for (const idx of [1, 2, 3, 5, 6, 7, 8, 9]) {
      expect(plan.days[idx]!.blocks.every((b) => b.kind === 'frontier')).toBe(true)
    }
  })

  it('refresh trials are exactly the engine plan for that set and trial count', () => {
    const sessions = [
      session(FIVE_FOUR_STRUCTURE_SET.id, '2026-01-11T08:00:00.000Z', 100),
      session(FIVE_FOUR_STRUCTURE_SET.id, '2026-01-13T08:00:00.000Z', 92),
    ]
    const plan = planCategorizationStudy(sessions, { now: NOW, horizonDays: 8 })
    const refresh = plan.days.flatMap((d) => d.blocks).find((b) => b.kind === 'refresh')
    expect(refresh).toBeDefined()
    expect(refresh!.trials).toEqual(planDiscriminatingBlock(FIVE_FOUR_STRUCTURE_SET, 3).trials)
  })

  it('honors a custom expanding ladder', () => {
    const sessions = [
      session('proto-bird-typicality', '2026-01-10T08:00:00.000Z', 85),
      session('proto-bird-typicality', '2026-01-12T08:00:00.000Z', 90),
    ]
    const plan = planCategorizationStudy(sessions, {
      now: NOW,
      horizonDays: 6,
      expandingIntervals: [2, 4],
    })
    // Anchor 01-12: +2d = 01-14 (elapsed), +4d = 01-16 → day 1.
    const refreshes = plan.days.flatMap((d) => d.blocks).filter((b) => b.kind === 'refresh')
    expect(refreshes).toHaveLength(1)
    expect(refreshes[0]!.intervalDays).toBe(4)
    expect(refreshes[0]!.retrievalOrdinal).toBe(2)
  })
})

describe('interleaving & budget (Kang 2016)', () => {
  it('never places two consecutive blocks from the same set in one day', () => {
    const sessions = [
      session('proto-bird-typicality', '2026-01-12T08:00:00.000Z', 90),
      session('proto-bird-typicality', '2026-01-13T08:00:00.000Z', 91),
      session(FIVE_FOUR_STRUCTURE_SET.id, '2026-01-12T09:00:00.000Z', 90),
      session(FIVE_FOUR_STRUCTURE_SET.id, '2026-01-13T09:00:00.000Z', 93),
    ]
    const plan = planCategorizationStudy(sessions, { now: NOW, horizonDays: 5 })
    for (const day of plan.days) {
      for (let i = 1; i < day.blocks.length; i++) {
        expect(day.blocks[i]!.setId).not.toBe(day.blocks[i - 1]!.setId)
      }
    }
  })

  it('the frontier keeps its slot and overflow refreshes defer to the next day', () => {
    // Two mastered sets due on day 0 (+3d from the shared 01-12 anchor), budget
    // 2 = frontier + at most 1 refresh: the lexicographically-first refresh fits
    // and the other defers to day 1 (frontier + deferred refresh).
    const sessions = [
      session('proto-bird-typicality', '2026-01-12T08:00:00.000Z', 90),
      session('proto-bird-typicality', '2026-01-12T14:00:00.000Z', 91),
      session(FIVE_FOUR_STRUCTURE_SET.id, '2026-01-12T09:00:00.000Z', 90),
      session(FIVE_FOUR_STRUCTURE_SET.id, '2026-01-12T15:00:00.000Z', 93),
    ]
    const collides = planCategorizationStudy(sessions, {
      now: NOW,
      horizonDays: 4,
      dailyBlockBudget: 2,
    })
    const day0 = collides.days[0]!.blocks
    expect(day0).toHaveLength(2)
    expect(day0.filter((b) => b.kind === 'refresh')).toHaveLength(1)
    // …and the deferred refresh lands on day 1 (frontier + refresh).
    const day1 = collides.days[1]!.blocks
    expect(day1).toHaveLength(2)
    expect(day1.some((b) => b.kind === 'refresh')).toBe(true)
  })

  it('a daily budget of 1 lets the frontier win and defers every refresh', () => {
    const sessions = [
      session('proto-bird-typicality', '2026-01-12T08:00:00.000Z', 90),
      session('proto-bird-typicality', '2026-01-13T08:00:00.000Z', 91),
    ]
    const plan = planCategorizationStudy(sessions, {
      now: NOW,
      horizonDays: 5,
      dailyBlockBudget: 1,
    })
    for (const day of plan.days) {
      expect(day.blocks).toHaveLength(1)
      expect(day.blocks[0]!.kind).toBe('frontier')
    }
  })
})

describe('history summary & boundaries', () => {
  it('summarizes per-set history canonically and flags mastery', () => {
    const { summaries, unknownSetIds } = summarizeStudyHistory([
      session('proto-bird-typicality', '2026-01-10T08:00:00.000Z', 60),
      session('proto-bird-typicality', '2026-01-12T08:00:00.000Z', 88),
      session('no-such-set', '2026-01-12T08:00:00.000Z', 50),
    ])
    expect(unknownSetIds).toEqual(['no-such-set'])
    expect(summaries[0]!.sessionsCount).toBe(2)
    expect(summaries[0]!.latestAccuracy).toBe(88)
    expect(summaries[0]!.bestAccuracy).toBe(88)
    expect(summaries[0]!.mastered).toBe(true)
    expect(summaries[1]!.sessionsCount).toBe(0)
    expect(summaries[1]!.mastered).toBe(false)
  })

  it('mastery respects the configured thresholds', () => {
    const sessions = [session('proto-bird-typicality', '2026-01-12T08:00:00.000Z', 70)]
    const strict = summarizeStudyHistory(sessions, {
      masteryAccuracy: 80,
      minSessionsForMastery: 2,
    })
    const lenient = summarizeStudyHistory(sessions, {
      masteryAccuracy: 70,
      minSessionsForMastery: 1,
    })
    expect(strict.summaries[0]!.mastered).toBe(false)
    expect(lenient.summaries[0]!.mastered).toBe(true)
  })

  it('reports unknown sets in the plan notes and skips them', () => {
    const plan = planCategorizationStudy([session('no-such-set', '2026-01-12T08:00:00.000Z', 90)], {
      now: NOW,
      horizonDays: 3,
    })
    expect(plan.notes.some((n) => n.includes('no-such-set'))).toBe(true)
    expect(plan.setSummaries.every((s) => s.sessionsCount === 0 || s.setId !== 'no-such-set')).toBe(
      true,
    )
  })

  it('rejects invalid options and sessions at the zod boundary', () => {
    expect(() => studyPlanOptionsSchema.parse({ now: 'not-a-date' })).toThrow()
    expect(() => studyPlanOptionsSchema.parse({ now: NOW, horizonDays: 0 })).toThrow()
    expect(() => studyPlanOptionsSchema.parse({ now: NOW, dailyBlockBudget: 9 })).toThrow()
    expect(() =>
      planCategorizationStudy([session('proto-bird-typicality', '2026-01-12T08:00:00.000Z', 150)], {
        now: NOW,
      }),
    ).toThrow()
    expect(() =>
      planCategorizationStudy([session('proto-bird-typicality', 'yesterday', 80)], { now: NOW }),
    ).toThrow()
  })
})
