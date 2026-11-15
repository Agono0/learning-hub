import { describe, expect, it } from 'vitest'
import {
  calculateRetentionGain,
  calculateSwsWindows,
  generateSleepConsolidationPlan,
  type TmrCandidateCard,
} from '../src/tmr/index'

describe('Targeted Memory Reactivation (TMR) Sleep Consolidation Engine', () => {
  it('identifies slow-wave sleep windows according to human sleep architecture', () => {
    const windows7h = calculateSwsWindows(7.5)
    expect(windows7h.length).toBe(2)
    expect(windows7h[0].cycleIndex).toBe(1)
    expect(windows7h[0].startMinute).toBe(35)
    expect(windows7h[0].endMinute).toBe(85)
    expect(windows7h[1].cycleIndex).toBe(2)

    // Short nap (4h) has only 1 SWS cycle
    const windows4h = calculateSwsWindows(4.0)
    expect(windows4h.length).toBe(1)
  })

  it('calculates empirical retention gain within physiological caps', () => {
    // 0 cues -> 0 gain
    expect(calculateRetentionGain(0, 1.0)).toBe(0)

    // 10 cues with low stability -> significant boost
    const gain10 = calculateRetentionGain(10, 1.5)
    expect(gain10).toBeGreaterThanOrEqual(0.15)
    expect(gain10).toBeLessThanOrEqual(0.28)
  })

  it('sequences vulnerable cards inside deep sleep cycles safely', () => {
    const candidates: TmrCandidateCard[] = [
      {
        cardId: 101,
        stability: 0.8,
        difficulty: 0.7,
        baseFrequency: 330,
        harmonicType: 'major_triad',
        title: 'Biology',
      },
      {
        cardId: 102,
        stability: 4.5,
        difficulty: 0.3,
        baseFrequency: 440,
        harmonicType: 'perfect_fifth',
        title: 'Chemistry',
      },
      {
        cardId: 103,
        stability: 1.2,
        difficulty: 0.5,
        baseFrequency: 550,
        harmonicType: 'octave_bloom',
        title: 'Physics',
      },
    ]

    const plan = generateSleepConsolidationPlan(candidates, 7.5)

    expect(plan.cues.length).toBe(3)
    // Most vulnerable (lowest stability 0.8) should be scheduled first
    expect(plan.cues[0].cardId).toBe(101)
    expect(plan.cues[1].cardId).toBe(103)
    expect(plan.cues[2].cardId).toBe(102)

    // Verified within safe whisper volume
    expect(plan.targetAcousticDba).toBe(35)
    expect(plan.forecastedRetentionGain).toBeGreaterThan(0.1)
  })

  it('handles empty card queue gracefully', () => {
    const emptyPlan = generateSleepConsolidationPlan([])
    expect(emptyPlan.cues).toEqual([])
    expect(emptyPlan.forecastedRetentionGain).toBe(0)
    expect(emptyPlan.advisory).toContain('No reviewed cards queued')
  })
})
