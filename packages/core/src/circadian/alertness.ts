/**
 * Circadian Alertness Simulator & Cognitive Peak Optimizer Domain Logic.
 *
 * Grounded in chronobiology and cognitive neuroscience:
 * 1. Two-Process Model of Sleep Regulation (Borbély 1982; Dijk & Czeisler 1994).
 * 2. Circadian rhythms in executive function and working memory (Schmidt et al. 2007; Valdez 2019).
 * 3. The "Inspiration Hour" / Inhibitory Spillover Effect in problem solving (Wieth & Zacks 2011).
 * 4. Caffeine pharmacokinetics and adenosine receptor antagonism (Drake et al. 2013; Nehlig 2018).
 */

export type Chronotype = 'morning_lark' | 'intermediate' | 'night_owl'

export interface HourlyAlertnessPoint {
  hour: number // 0 to 23
  alertness: number // 0 to 100
  zone: 'peak' | 'optimal' | 'dip' | 'wind_down' | 'sleep'
  recommendedActivity: string
}

export interface CognitiveWindows {
  workingMemoryPeak: { startHour: number; endHour: number; description: string }
  creativeIncubation: { startHour: number; endHour: number; description: string }
  postLunchDip: { startHour: number; endHour: number; description: string }
  nocturnalConsolidation: { startHour: number; endHour: number; description: string }
  melatoninOnsetHour: number
}

export interface CircadianSimulationResult {
  chronotype: Chronotype
  wakeHour: number
  bedtimeHour: number
  hourlyCurve: HourlyAlertnessPoint[]
  windows: CognitiveWindows
}

export interface CaffeineDose {
  mg: number
  hour: number // 0 to 23
}

export interface CaffeineSimulationResult {
  hourlyRemainingMg: Array<{ hour: number; remainingMg: number }>
  bedtimeRemainingMg: number
  sleepDisruptionRisk: 'minimal' | 'moderate' | 'high'
  disruptionExplanation: string
  recommendedCutoffHour: number
}

const DEFAULT_HALF_LIFE_HOURS = 5.5

/**
 * Calculates 24-hour alertness curve and cognitive peak windows
 * based on chronotype and wake/bed schedules.
 */
export function simulateCircadianAlertness(
  chronotype: Chronotype = 'intermediate',
  wakeHour = 7,
  bedtimeHour = 23,
): CircadianSimulationResult {
  // Chronotype phase shift offset in hours
  // Larks wake earlier and peak ~2h earlier; owls peak ~3h later
  const phaseShift = chronotype === 'morning_lark' ? -2 : chronotype === 'night_owl' ? 3 : 0

  const curve: HourlyAlertnessPoint[] = []

  for (let h = 0; h < 24; h++) {
    const hoursSinceWake = (h - wakeHour + 24) % 24
    const isSleepTime =
      bedtimeHour > wakeHour ? h >= bedtimeHour || h < wakeHour : h >= bedtimeHour && h < wakeHour

    if (isSleepTime) {
      curve.push({
        hour: h,
        alertness: 10,
        zone: 'sleep',
        recommendedActivity: 'Deep Sleep & Slow-Wave Memory Consolidation (Diekelmann & Born 2010)',
      })
      continue
    }

    // Process C (Circadian drive) - sinusoidal curve peaked in late morning / early evening
    // adjusted by chronotype phase shift
    const shiftedHour = (h - phaseShift + 24) % 24
    const circadianDrive = Math.sin(((shiftedHour - 9) / 24) * 2 * Math.PI) * 25 + 65

    // Process S (Homeostatic sleep pressure) - steadily builds up with waking hours
    const sleepPressure = Math.min(35, hoursSinceWake * 2.2)

    // Post-lunch dip phenomenon (circadian dip typically ~7-8 hours after waking)
    const postWakeHour = (h - wakeHour + 24) % 24
    const isDipHour = postWakeHour >= 6 && postWakeHour <= 8
    const dipPenalty = isDipHour ? 15 : 0

    const rawAlertness = circadianDrive - sleepPressure - dipPenalty
    const clampedAlertness = Math.round(Math.max(15, Math.min(100, rawAlertness)))

    let zone: HourlyAlertnessPoint['zone'] = 'optimal'
    let recommendedActivity = 'General Study & Review'

    if (clampedAlertness >= 75) {
      zone = 'peak'
      recommendedActivity = 'Complex Problem Solving & Working Memory Demands'
    } else if (isDipHour || clampedAlertness < 45) {
      zone = 'dip'
      recommendedActivity = 'Low-Cognitive Load Tasks, Walks, or Non-Demanding Flashcard Reviews'
    } else if (h >= (bedtimeHour - 2 + 24) % 24 && !isSleepTime) {
      zone = 'wind_down'
      recommendedActivity = 'Passive Review, Metacognitive Journaling, or Light Reading'
    }

    curve.push({
      hour: h,
      alertness: clampedAlertness,
      zone,
      recommendedActivity,
    })
  }

  // Derive cognitive windows
  const wmPeakStart = (wakeHour + 2.5 + phaseShift + 24) % 24
  const wmPeakEnd = (wakeHour + 5.5 + phaseShift + 24) % 24

  const dipStart = (wakeHour + 6.5 + 24) % 24
  const dipEnd = (wakeHour + 8.5 + 24) % 24

  // Creative incubation often peaks during non-optimal inhibitory states (Wieth & Zacks 2011)
  const creativeStart = (wakeHour + 9 + phaseShift + 24) % 24
  const creativeEnd = (wakeHour + 12 + phaseShift + 24) % 24

  const windows: CognitiveWindows = {
    workingMemoryPeak: {
      startHour: Math.round(wmPeakStart),
      endHour: Math.round(wmPeakEnd),
      description:
        'Maximum prefrontal cortex activation and working memory capacity (Schmidt et al. 2007). Ideal for hard concepts, math proofs, and rigorous problem sets.',
    },
    creativeIncubation: {
      startHour: Math.round(creativeStart),
      endHour: Math.round(creativeEnd),
      description:
        'Reduced attentional inhibition allows novel cross-domain associations (Wieth & Zacks 2011). Ideal for mindmapping, essay drafting, and architecture design.',
    },
    postLunchDip: {
      startHour: Math.round(dipStart),
      endHour: Math.round(dipEnd),
      description:
        'Transient circadian alertness drop. Avoid heavy cognitive tests; schedule light card reviews, walks, or a 20-min power nap (Milner & Cote 2009).',
    },
    nocturnalConsolidation: {
      startHour: bedtimeHour,
      endHour: wakeHour,
      description:
        'Synaptic homeostasis and targeted memory replay during slow-wave and REM sleep (Rasch & Born 2013). Protect this window from blue light and late caffeine.',
    },
    melatoninOnsetHour: (bedtimeHour - 2 + 24) % 24,
  }

  return {
    chronotype,
    wakeHour,
    bedtimeHour,
    hourlyCurve: curve,
    windows,
  }
}

/**
 * Simulates caffeine clearance kinetics across a 24-hour cycle.
 */
export function simulateCaffeineDecay(
  doses: CaffeineDose[],
  bedtimeHour = 23,
  halfLifeHours = DEFAULT_HALF_LIFE_HOURS,
): CaffeineSimulationResult {
  const hourlyRemaining: Array<{ hour: number; remainingMg: number }> = []

  for (let h = 0; h < 24; h++) {
    let totalMg = 0
    for (const dose of doses) {
      // Calculate elapsed hours considering 24h wrap
      const elapsed = h >= dose.hour ? h - dose.hour : 24 - dose.hour + h
      if (elapsed >= 0) {
        const remaining = dose.mg * Math.pow(0.5, elapsed / halfLifeHours)
        totalMg += remaining
      }
    }
    hourlyRemaining.push({
      hour: h,
      remainingMg: Math.round(totalMg * 10) / 10,
    })
  }

  const bedtimePoint = hourlyRemaining.find((p) => p.hour === bedtimeHour)
  const bedtimeRemainingMg = bedtimePoint ? bedtimePoint.remainingMg : 0

  let sleepDisruptionRisk: 'minimal' | 'moderate' | 'high' = 'minimal'
  let disruptionExplanation =
    'Caffeine level is sufficiently cleared (<25mg). Minimal impact on sleep architecture.'

  if (bedtimeRemainingMg > 75) {
    sleepDisruptionRisk = 'high'
    disruptionExplanation = `Elevated bedtime caffeine (${bedtimeRemainingMg}mg) substantially suppresses Slow-Wave Sleep (SWS) and impairs overnight memory consolidation (Drake et al. 2013).`
  } else if (bedtimeRemainingMg >= 25) {
    sleepDisruptionRisk = 'moderate'
    disruptionExplanation = `Residual caffeine (${bedtimeRemainingMg}mg) may prolong sleep onset latency and fragment REM sleep cycles.`
  }

  // Recommended cutoff is typically 8-10 hours prior to bedtime
  const recommendedCutoffHour = (((bedtimeHour - 9) % 24) + 24) % 24

  return {
    hourlyRemainingMg: hourlyRemaining,
    bedtimeRemainingMg,
    sleepDisruptionRisk,
    disruptionExplanation,
    recommendedCutoffHour,
  }
}
