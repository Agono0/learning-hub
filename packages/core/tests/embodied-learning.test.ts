import { describe, expect, it } from 'vitest'

import {
  analyzeMismatch,
  EmbodiedScenarioSchema,
  evaluateGesturePlan,
  getEmbodiedScenario,
  listEmbodiedScenarios,
  nextStudioPhase,
  scoreEnactmentSession,
  STUDIO_PHASE_ORDER,
  validateFadingLadder,
} from '../src/embodied-learning'

describe('embodied-learning scenario library', () => {
  it('ships at least five canonical scenarios, all schema-valid', () => {
    const scenarios = listEmbodiedScenarios()
    expect(scenarios.length).toBeGreaterThanOrEqual(5)
    for (const s of scenarios) {
      expect(() => EmbodiedScenarioSchema.parse(s)).not.toThrow()
    }
  })

  it('every scenario ladder is a valid concreteness-fading ladder', () => {
    for (const s of listEmbodiedScenarios()) {
      expect(validateFadingLadder(s.ladder).valid).toBe(true)
    }
  })

  it('looks scenarios up by id', () => {
    expect(getEmbodiedScenario('bayes-base-rate')?.domain).toBe('Probability')
    expect(getEmbodiedScenario('nope')).toBeUndefined()
  })
})

describe('evaluateGesturePlan', () => {
  const elements = ['dividend as a length', 'counting how many units fit']

  it('flags missing elements and single-channel plans', () => {
    const report = evaluateGesturePlan(
      [
        {
          element: 'dividend as a length',
          channel: 'spatial-layout',
          gestureDescription: 'span the bar',
          verbalAnchor: 'the whole bar',
          rationale: 'grounding',
        },
        {
          element: 'an unrelated extra',
          channel: 'spatial-layout',
          gestureDescription: 'point at the bar again',
          verbalAnchor: 'still the bar',
          rationale: 'same channel again',
        },
      ],
      elements,
    )
    expect(report.missingElements).toEqual(['counting how many units fit'])
    expect(report.advice.some((a) => a.includes('counting how many units fit'))).toBe(true)
    expect(report.advice.some((a) => a.includes('one channel'))).toBe(true)
  })

  it('approves a full multi-channel anchored plan', () => {
    const report = evaluateGesturePlan(
      [
        {
          element: 'dividend as a length',
          channel: 'spatial-layout',
          gestureDescription: 'span the bar',
          verbalAnchor: 'the whole bar',
          rationale: 'grounding',
        },
        {
          element: 'counting how many units fit',
          channel: 'dynamic-process',
          gestureDescription: 'hop the unit along',
          verbalAnchor: 'one, two, three fit',
          rationale: 'enacting measurement',
        },
      ],
      elements,
    )
    expect(report.missingElements).toEqual([])
    expect(report.channels).toHaveLength(2)
    expect(report.advice[0]).toMatch(/covers every core element/)
  })
})

describe('analyzeMismatch', () => {
  it('marks high-mismatch samples as transitional', () => {
    const report = analyzeMismatch([
      { speechClaim: 'the slope is positive', gestureClaim: 'hand tilts down' },
      { speechClaim: 'it stays flat', gestureClaim: 'hand rises' },
      { speechClaim: 'steep here', gestureClaim: 'steep here' },
    ])
    expect(report.mismatchCount).toBe(2)
    expect(report.mismatchRate).toBeCloseTo(2 / 3)
    expect(report.transitional).toBe(true)
    expect(report.coaching[0]).toMatch(/transitional/)
  })

  it('encourages gesture-plus-speech when fully aligned', () => {
    const report = analyzeMismatch([{ speechClaim: 'six fit', gestureClaim: 'six fit' }])
    expect(report.transitional).toBe(false)
    expect(report.coaching[0]).toMatch(/aligned/i)
  })

  it('handles empty input', () => {
    const report = analyzeMismatch([])
    expect(report.mismatchRate).toBe(0)
    expect(report.coaching[0]).toMatch(/No usable samples/)
  })
})

describe('validateFadingLadder', () => {
  it('rejects backwards movement and missing bridges', () => {
    const report = validateFadingLadder({
      concept: 'x',
      rungs: [
        { modality: 'symbolic', activity: 'symbols', bridgePrompt: 'start' },
        { modality: 'enactive', activity: 'act it out physically', bridgePrompt: '' },
      ],
    })
    expect(report.valid).toBe(false)
    expect(report.problems.some((p) => p.includes('backwards'))).toBe(true)
  })

  it('accepts an enactive to iconic to symbolic ladder with bridges', () => {
    const report = validateFadingLadder({
      concept: 'x',
      rungs: [
        { modality: 'enactive', activity: 'act it out', bridgePrompt: 'draw what you did' },
        { modality: 'iconic', activity: 'draw it', bridgePrompt: 'write what the drawing shows' },
        {
          modality: 'symbolic',
          activity: 'write it',
          bridgePrompt: 'connect symbols back to the action',
        },
      ],
    })
    expect(report.valid).toBe(true)
  })
})

describe('scoreEnactmentSession', () => {
  it('reports the enactment advantage in recall rates', () => {
    const r = scoreEnactmentSession({
      taskCount: 10,
      enactedCount: 5,
      recallHitsEnacted: 4,
      recallHitsVerbal: 2,
      verbalCount: 5,
    })
    expect(r.enactedRecall).toBeCloseTo(0.8)
    expect(r.verbalRecall).toBeCloseTo(0.4)
    expect(r.enactmentAdvantage).toBeCloseTo(0.4)
    expect(r.interpretation).toMatch(/enactment advantage/i)
  })

  it('notes when nothing was enacted', () => {
    const r = scoreEnactmentSession({
      taskCount: 4,
      enactedCount: 0,
      recallHitsEnacted: 0,
      recallHitsVerbal: 3,
      verbalCount: 4,
    })
    expect(r.interpretation).toMatch(/No enacted tasks/)
  })
})

describe('studio phase flow', () => {
  it('walks ground -> gesture -> mismatch-check -> fade -> transfer -> reflect and stops', () => {
    expect(STUDIO_PHASE_ORDER[0]).toBe('ground')
    expect(nextStudioPhase('ground')).toBe('gesture')
    expect(nextStudioPhase('transfer')).toBe('reflect')
    expect(nextStudioPhase('reflect')).toBeNull()
  })
})
