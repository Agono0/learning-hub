/**
 * @file feedback-studio.test.ts
 * @description Unit tests for the Feedback Literacy & Formative Assessment
 * engine: level classification, FIT risk detection, Shute audits, level
 * balance, composite metrics, the formative response loop, timing guidance,
 * and the FSRS-6 bridge.
 */
import { describe, expect, it } from 'vitest'
import {
  auditFeedbackAgainstShute,
  calculateFLMetrics,
  CANONICAL_FEEDBACK_SCENARIOS,
  classifyFeedbackStatement,
  computeLevelBalanceScore,
  computeSelfFocusSafetyScore,
  FEEDBACK_CUE_LEXICON,
  FeedbackScenarioSchema,
  FeedbackStatementSchema,
  FIT_MEAN_EFFECT_SIZE,
  FIT_NEGATIVE_INTERVENTION_FRACTION,
  generateFeedbackFSRSCards,
  getCanonicalFeedbackScenarios,
  getFeedbackScenarioById,
  listMisconceptionTags,
  predictFITOutcome,
  SHUTE_GUIDELINES,
  suggestFeedbackTiming,
  TARGET_LEVEL_MIX,
  gradeScenarioResponse,
  type FeedbackStatement,
} from '../src/feedback-studio'

function stmt(id: string, text: string, declaredLevel?: FeedbackStatement['declaredLevel']) {
  return FeedbackStatementSchema.parse({ id, text, declaredLevel })
}

describe('feedback cue lexicon', () => {
  it('covers all four Hattie & Timperley levels', () => {
    const levels = new Set(FEEDBACK_CUE_LEXICON.map((c) => c.level))
    expect(levels).toEqual(new Set(['task', 'process', 'self_regulation', 'self']))
  })

  it('has unique cue ids and positive weights', () => {
    const ids = FEEDBACK_CUE_LEXICON.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const cue of FEEDBACK_CUE_LEXICON) {
      expect(cue.weight).toBeGreaterThan(0)
      expect(cue.pattern.length).toBeGreaterThan(0)
    }
  })

  it('documents the FIT research anchors', () => {
    expect(FIT_MEAN_EFFECT_SIZE).toBeCloseTo(0.41, 2)
    expect(FIT_NEGATIVE_INTERVENTION_FRACTION).toBeCloseTo(0.33, 2)
  })

  it('target mix sums to 1 and keeps self feedback rare', () => {
    const sum = Object.values(TARGET_LEVEL_MIX).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 6)
    expect(TARGET_LEVEL_MIX.self).toBeLessThanOrEqual(0.05)
  })
})

describe('classifyFeedbackStatement', () => {
  it('classifies task-level feedback', () => {
    const c = classifyFeedbackStatement(stmt('s1', 'Incorrect: the calculation drops a sign.'))
    expect(c.level).toBe('task')
    expect(c.confidence).toBeGreaterThan(0)
    expect(c.declaredMismatch).toBe(false)
  })

  it('classifies process-level feedback', () => {
    const c = classifyFeedbackStatement(
      stmt('s2', 'A better strategy is to estimate first and break the problem into subgoals.'),
    )
    expect(c.level).toBe('process')
  })

  it('classifies self-regulation feedback', () => {
    const c = classifyFeedbackStatement(
      stmt('s3', 'Check your work and ask yourself what would happen if x were zero.'),
    )
    expect(c.level).toBe('self_regulation')
  })

  it('classifies self-level feedback', () => {
    const c = classifyFeedbackStatement(stmt('s4', 'You are so smart, great work!'))
    expect(c.level).toBe('self')
  })

  it('defaults to task with zero confidence when no cue fires', () => {
    const c = classifyFeedbackStatement(stmt('s5', 'qzx vbnm lkjhgf'))
    expect(c.level).toBe('task')
    expect(c.confidence).toBe(0)
  })

  it('flags a declared-level mismatch', () => {
    const c = classifyFeedbackStatement(
      stmt('s6', 'You are so smart and talented.', 'self_regulation'),
    )
    expect(c.declaredMismatch).toBe(true)
  })

  it('is deterministic across runs', () => {
    const a = classifyFeedbackStatement(stmt('s7', 'Verify your strategy next time.'))
    const b = classifyFeedbackStatement(stmt('s7', 'Verify your strategy next time.'))
    expect(a).toEqual(b)
  })
})

describe('FIT risk detection', () => {
  it('flags trait praise', () => {
    const c = classifyFeedbackStatement(stmt('r1', 'You are smart, a natural at math.'))
    expect(c.fitRisks).toContain('trait_praise')
  })

  it('flags normative comparison', () => {
    const c = classifyFeedbackStatement(
      stmt('r2', 'You did better than most of the class on this problem.'),
    )
    expect(c.fitRisks).toContain('normative_comparison')
  })

  it('flags content-free praise only without informational content', () => {
    const empty = classifyFeedbackStatement(stmt('r3', 'Well done!'))
    expect(empty.fitRisks).toContain('content_free_praise')
    const informative = classifyFeedbackStatement(
      stmt('r4', 'Well done — your strategy of checking each step caught the sign error.'),
    )
    expect(informative.fitRisks).not.toContain('content_free_praise')
  })

  it('flags ego threat language', () => {
    const c = classifyFeedbackStatement(stmt('r5', 'That was careless and sloppy.'))
    expect(c.fitRisks).toContain('ego_threat')
  })

  it('reports no risks for clean formative feedback', () => {
    const c = classifyFeedbackStatement(
      stmt('r6', 'Check your units in step 2; the strategy is otherwise sound.'),
    )
    expect(c.fitRisks).toEqual([])
  })
})

describe('auditFeedbackAgainstShute', () => {
  it('every guideline id is audited exactly once', () => {
    const { audits } = auditFeedbackAgainstShute([stmt('a1', 'Check your step 2 units.')])
    expect(audits.length).toBe(SHUTE_GUIDELINES.length)
    expect(new Set(audits.map((a) => a.guidelineId)).size).toBe(SHUTE_GUIDELINES.length)
  })

  it('violates task-focus when self-level feedback carries FIT risks', () => {
    const { audits, formativeAlignmentScore } = auditFeedbackAgainstShute([
      stmt('a2', 'You are careless and lazy. You are smart when you try.'),
    ])
    const taskFocus = audits.find((a) => a.guidelineId === 'shute-task-focus')
    expect(taskFocus?.status).toBe('violated')
    expect(formativeAlignmentScore).toBeLessThan(100)
  })

  it('passes a clean three-level formative set with high alignment', () => {
    const { formativeAlignmentScore } = auditFeedbackAgainstShute([
      stmt('a3', 'The calculation in step 2 drops a sign.', undefined),
      stmt('a4', 'Strategy tip: estimate the magnitude before computing each step.'),
      stmt('a5', 'Check your result against the boundary case to verify it.'),
    ])
    expect(formativeAlignmentScore).toBeGreaterThanOrEqual(70)
  })

  it('score stays within 0..100 for adversarial input', () => {
    const { formativeAlignmentScore } = auditFeedbackAgainstShute([
      stmt('a6', 'careless lazy disappointing '.repeat(40)),
    ])
    expect(formativeAlignmentScore).toBeGreaterThanOrEqual(0)
    expect(formativeAlignmentScore).toBeLessThanOrEqual(100)
  })
})

describe('level balance and safety scores', () => {
  it('perfect target mix scores 100', () => {
    const score = computeLevelBalanceScore({ task: 35, process: 30, self_regulation: 30, self: 5 })
    expect(score).toBe(100)
  })

  it('empty mix scores 0', () => {
    expect(computeLevelBalanceScore({ task: 0, process: 0, self_regulation: 0, self: 0 })).toBe(0)
  })

  it('all-task mix scores well below 100', () => {
    const score = computeLevelBalanceScore({ task: 100, process: 0, self_regulation: 0, self: 0 })
    expect(score).toBeLessThan(60)
  })

  it('safety score is 100 with no risks and drops with each risk', () => {
    const clean = [classifyFeedbackStatement(stmt('c1', 'Check your step 2 calculation.'))]
    expect(computeSelfFocusSafetyScore(clean)).toBe(100)
    const risky = [classifyFeedbackStatement(stmt('c2', 'You are smart, better than most.'))]
    expect(computeSelfFocusSafetyScore(risky)).toBeLessThan(100)
  })

  it('safety score never goes below 0', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      classifyFeedbackStatement(stmt(`c3-${i}`, 'careless lazy you are smart better than most')),
    )
    expect(computeSelfFocusSafetyScore(many)).toBe(0)
  })
})

describe('calculateFLMetrics', () => {
  it('returns bounded composite metrics', () => {
    const m = calculateFLMetrics([
      stmt('m1', 'The calculation in step 2 is incorrect: a sign was dropped.'),
      stmt('m2', 'Try the strategy of estimating the magnitude first.'),
      stmt('m3', 'Check your answer against the boundary case to verify.'),
    ])
    expect(m.feedbackQualityIndex).toBeGreaterThanOrEqual(0)
    expect(m.feedbackQualityIndex).toBeLessThanOrEqual(100)
    expect(m.statementCount).toBe(3)
    expect(m.levelCounts.task).toBe(1)
  })

  it('handles an empty body of feedback', () => {
    const m = calculateFLMetrics([])
    expect(m.statementCount).toBe(0)
    expect(m.levelBalanceScore).toBe(0)
  })

  it('ranks clean formative feedback above self-focused feedback', () => {
    const formative = calculateFLMetrics([
      stmt('f1', 'The calculation in step 2 drops a sign.'),
      stmt('f2', 'Strategy: estimate the magnitude before each step of the method.'),
      stmt('f3', 'Check your answer against the boundary case to verify.'),
    ])
    const selfFocused = calculateFLMetrics([
      stmt('g1', 'You are so smart, well done, better than most of the class.'),
      stmt('g2', 'Careless mistake, you never check anything, lazy work.'),
    ])
    expect(formative.feedbackQualityIndex).toBeGreaterThan(selfFocused.feedbackQualityIndex)
  })
})

describe('canonical scenarios', () => {
  it('bank validates against the public schema', () => {
    for (const s of CANONICAL_FEEDBACK_SCENARIOS) {
      expect(() => FeedbackScenarioSchema.parse(s)).not.toThrow()
    }
  })

  it('every scenario has exactly one correct option', () => {
    for (const s of CANONICAL_FEEDBACK_SCENARIOS) {
      expect(s.options.filter((o) => o.isCorrect).length).toBe(1)
    }
  })

  it('every incorrect option carries a misconception tag', () => {
    for (const s of CANONICAL_FEEDBACK_SCENARIOS) {
      for (const o of s.options) {
        if (!o.isCorrect) expect(o.misconceptionTag).toBeTruthy()
      }
    }
  })

  it('spans at least three domains and five scenarios', () => {
    const domains = new Set(CANONICAL_FEEDBACK_SCENARIOS.map((s) => s.domain))
    expect(CANONICAL_FEEDBACK_SCENARIOS.length).toBeGreaterThanOrEqual(5)
    expect(domains.size).toBeGreaterThanOrEqual(3)
  })

  it('lookup by id round-trips and unknown ids return undefined', () => {
    const first = getCanonicalFeedbackScenarios()[0]
    expect(getFeedbackScenarioById(first.id)?.id).toBe(first.id)
    expect(getFeedbackScenarioById('does-not-exist')).toBeUndefined()
  })

  it('misconception tag list is deduplicated and sorted', () => {
    const tags = listMisconceptionTags()
    expect(new Set(tags).size).toBe(tags.length)
    expect([...tags].sort()).toEqual(tags)
    expect(tags.length).toBeGreaterThan(0)
  })
})

describe('gradeScenarioResponse', () => {
  it('grades a correct response with three-level feedback', () => {
    const scenario = CANONICAL_FEEDBACK_SCENARIOS[0]
    const correct = scenario.options.find((o) => o.isCorrect)!
    const r = gradeScenarioResponse({
      scenarioId: scenario.id,
      optionId: correct.id,
      confidence: 3,
    })
    expect(r.isCorrect).toBe(true)
    expect(r.misconceptionTag).toBeUndefined()
    expect(r.feedback.task.length).toBeGreaterThan(0)
    expect(r.feedback.process.length).toBeGreaterThan(0)
    expect(r.feedback.selfRegulation.length).toBeGreaterThan(0)
    expect(r.hypercorrectionFlag).toBe(false)
  })

  it('flags high-confidence errors for hypercorrection', () => {
    const scenario = CANONICAL_FEEDBACK_SCENARIOS[0]
    const wrong = scenario.options.find((o) => !o.isCorrect)!
    const r = gradeScenarioResponse({ scenarioId: scenario.id, optionId: wrong.id, confidence: 5 })
    expect(r.isCorrect).toBe(false)
    expect(r.misconceptionTag).toBe(wrong.misconceptionTag)
    expect(r.hypercorrectionFlag).toBe(true)
  })

  it('throws on unknown scenario and option ids', () => {
    expect(() =>
      gradeScenarioResponse({ scenarioId: 'nope', optionId: 'a', confidence: 1 }),
    ).toThrow()
    const scenario = CANONICAL_FEEDBACK_SCENARIOS[0]
    expect(() =>
      gradeScenarioResponse({ scenarioId: scenario.id, optionId: 'zzz', confidence: 1 }),
    ).toThrow()
  })
})

describe('suggestFeedbackTiming', () => {
  it('delays feedback for retrieval practice and transfer goals', () => {
    expect(
      suggestFeedbackTiming({
        taskDifficulty: 2,
        isProcedural: false,
        transferGoal: true,
        isRetrievalPractice: false,
      }).timing,
    ).toBe('delayed')
    expect(
      suggestFeedbackTiming({
        taskDifficulty: 2,
        isProcedural: false,
        transferGoal: false,
        isRetrievalPractice: true,
      }).timing,
    ).toBe('delayed')
  })

  it('keeps feedback immediate for hard procedural acquisition', () => {
    expect(
      suggestFeedbackTiming({
        taskDifficulty: 5,
        isProcedural: true,
        transferGoal: false,
        isRetrievalPractice: false,
      }).timing,
    ).toBe('immediate')
  })
})

describe('generateFeedbackFSRSCards', () => {
  it('emits a concept card plus one card per misconception', () => {
    const cards = generateFeedbackFSRSCards()
    const conceptCards = cards.filter((c) => c.tags.includes('concept'))
    const misconceptionCards = cards.filter((c) => c.tags.includes('misconception'))
    expect(conceptCards.length).toBe(CANONICAL_FEEDBACK_SCENARIOS.length)
    const totalMisconceptions = CANONICAL_FEEDBACK_SCENARIOS.reduce(
      (n, s) => n + s.options.filter((o) => !o.isCorrect && o.misconceptionTag).length,
      0,
    )
    expect(misconceptionCards.length).toBe(totalMisconceptions)
  })

  it('respects a scenario subset', () => {
    const first = CANONICAL_FEEDBACK_SCENARIOS[0]
    const cards = generateFeedbackFSRSCards([first.id])
    expect(cards.every((c) => c.sourceRef.startsWith(`feedback-scenario:${first.id}`))).toBe(true)
  })

  it('ignores unknown ids silently', () => {
    expect(generateFeedbackFSRSCards(['nope'])).toEqual([])
  })

  it('cards carry non-empty front and back', () => {
    for (const card of generateFeedbackFSRSCards()) {
      expect(card.front.length).toBeGreaterThan(0)
      expect(card.back.length).toBeGreaterThan(0)
    }
  })
})

describe('predictFITOutcome', () => {
  it('maps each locus to the FIT-predicted direction', () => {
    expect(predictFITOutcome('task_learning').expectedDirection).toBe('improvement')
    expect(predictFITOutcome('task_motivation').expectedDirection).toBe('neutral_or_decline')
    expect(predictFITOutcome('meta_task_self').expectedDirection).toBe('decline_risk')
  })
})
