import { describe, expect, it } from 'vitest'
import { simulateCircadianAlertness, simulateCaffeineDecay } from '../src/circadian/alertness'

describe('Circadian Alertness & Cognitive Peak Simulator', () => {
  it('computes 24-hour curve and shifts peak based on chronotype', () => {
    const lark = simulateCircadianAlertness('morning_lark', 6, 22)
    const owl = simulateCircadianAlertness('night_owl', 9, 1)

    expect(lark.hourlyCurve).toHaveLength(24)
    expect(owl.hourlyCurve).toHaveLength(24)

    // Lark should have sleep zone at 23:00
    const larkNight = lark.hourlyCurve.find((p) => p.hour === 23)
    expect(larkNight?.zone).toBe('sleep')
    expect(larkNight?.alertness).toBe(10)

    // Owl should peak later than lark
    expect(owl.windows.workingMemoryPeak.startHour).toBeGreaterThan(
      lark.windows.workingMemoryPeak.startHour,
    )
    expect(lark.windows.melatoninOnsetHour).toBe(20)
  })

  it('accurately calculates caffeine clearance and sleep disruption risk', () => {
    // 200mg coffee at 14:00 with 23:00 bedtime (9 hours elapsed)
    // 200 * (0.5)^(9 / 5.5) = 200 * 0.321 = ~64.3mg
    const sim = simulateCaffeineDecay([{ mg: 200, hour: 14 }], 23, 5.5)

    expect(sim.hourlyRemainingMg).toHaveLength(24)
    expect(sim.bedtimeRemainingMg).toBeGreaterThan(50)
    expect(sim.bedtimeRemainingMg).toBeLessThan(75)
    expect(sim.sleepDisruptionRisk).toBe('moderate')
    expect(sim.recommendedCutoffHour).toBe(14)
  })

  it('identifies high disruption risk when heavy caffeine is taken close to bedtime', () => {
    const highRiskSim = simulateCaffeineDecay([{ mg: 300, hour: 19 }], 23, 5.5)
    expect(highRiskSim.bedtimeRemainingMg).toBeGreaterThan(75)
    expect(highRiskSim.sleepDisruptionRisk).toBe('high')
    expect(highRiskSim.disruptionExplanation).toContain('Slow-Wave Sleep')
  })

  it('identifies minimal disruption risk for morning tea', () => {
    const lowRiskSim = simulateCaffeineDecay([{ mg: 40, hour: 8 }], 23, 5.5)
    expect(lowRiskSim.bedtimeRemainingMg).toBeLessThan(25)
    expect(lowRiskSim.sleepDisruptionRisk).toBe('minimal')
  })
})
