import { describe, expect, it } from 'vitest'
import { evaluateFlowState, flowStateEvaluationSchema } from '../src/flow'

describe('Flow State & Ultradian Rhythm Engine', () => {
  it('identifies flow zone when accuracy and pacing are balanced', () => {
    const evalResult = evaluateFlowState({
      accuracy: 0.85,
      averageLatencyMs: 2800,
      expectedLatencyMs: 3000,
      cardsAnswered: 24,
      elapsedFocusMinutes: 30,
      subjectiveStrain: 3,
    })

    const parsed = flowStateEvaluationSchema.parse(evalResult)
    expect(parsed.zone).toBe('flow')
    expect(parsed.suggestedAction).toBe('continue')
    expect(parsed.ultradianPhase).toBe('peak_focus')
    expect(parsed.remainingFocusMinutes).toBe(60)
    expect(parsed.flowScore).toBeGreaterThanOrEqual(85)
  })

  it('detects anxiety zone when accuracy drops or latency spikes', () => {
    const evalResult = evaluateFlowState({
      accuracy: 0.55,
      averageLatencyMs: 5500,
      expectedLatencyMs: 2500,
      cardsAnswered: 15,
      elapsedFocusMinutes: 20,
      subjectiveStrain: 5,
    })

    expect(evalResult.zone).toBe('anxiety')
    expect(evalResult.suggestedAction).toBe('ease_difficulty')
    expect(evalResult.challengeSkillRatio).toBeGreaterThan(1)
  })

  it('detects boredom zone when mastery is high and latency is very rapid', () => {
    const evalResult = evaluateFlowState({
      accuracy: 0.98,
      averageLatencyMs: 1200,
      expectedLatencyMs: 2500,
      cardsAnswered: 40,
      elapsedFocusMinutes: 15,
      subjectiveStrain: 1,
    })

    expect(evalResult.zone).toBe('boredom')
    expect(evalResult.suggestedAction).toBe('increase_difficulty')
  })

  it('triggers restorative break when 90-minute ultradian limit is reached', () => {
    const evalResult = evaluateFlowState({
      accuracy: 0.78,
      averageLatencyMs: 3100,
      expectedLatencyMs: 3000,
      cardsAnswered: 80,
      elapsedFocusMinutes: 92,
    })

    expect(evalResult.zone).toBe('fatigue')
    expect(evalResult.suggestedAction).toBe('take_rest')
    expect(evalResult.ultradianPhase).toBe('restorative_break_due')
    expect(evalResult.remainingFocusMinutes).toBe(0)
  })
})
