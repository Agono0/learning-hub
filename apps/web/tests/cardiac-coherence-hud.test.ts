import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import { CardiacCoherenceHUD } from '../src/ui/CardiacCoherenceHUD'

describe('CardiacCoherenceHUD Component', () => {
  it('renders default resting metrics without crashing', () => {
    const html = renderToString(
      React.createElement(CardiacCoherenceHUD, {
        interBeatIntervals: [800, 820, 810, 830, 815],
      }),
    )

    expect(html).toContain('Coherence')
    expect(html).toContain('BPM:')
    expect(html).toContain('RMSSD:')
    expect(html).toContain('Autonomic Insight:')
  })

  it('renders high coherence badge and styling for resonant pulse streams', () => {
    // Coherent sinusoidal intervals
    const resonantIbis = [
      760, 780, 820, 880, 930, 950, 930, 870, 820, 770, 760, 790, 840, 900, 940, 910, 850, 800, 760,
    ]
    const html = renderToString(
      React.createElement(CardiacCoherenceHUD, {
        interBeatIntervals: resonantIbis,
      }),
    )

    expect(html).toMatch(/High Coherence|Moderate Coherence/)
    expect(html).toContain('Cognitive Readiness Score:')
  })

  it('renders studio button action when onOpenStudio is provided', () => {
    const html = renderToString(
      React.createElement(CardiacCoherenceHUD, {
        interBeatIntervals: [800, 810, 820],
        onOpenStudio: () => {},
      }),
    )

    expect(html).toContain('Prime Focus (2 min)')
  })

  it('shows pacer active status during active breathing sessions', () => {
    const html = renderToString(
      React.createElement(CardiacCoherenceHUD, {
        interBeatIntervals: [800, 810, 820],
        isBreathingActive: true,
        protocolName: '0.1 Hz Baroreflex Resonance',
      }),
    )

    expect(html).toMatch(/Pacer Active:.*0\.1 Hz Baroreflex Resonance/)
  })

  it('respects metrics override for pre-computed lab values', () => {
    const html = renderToString(
      React.createElement(CardiacCoherenceHUD, {
        metricsOverride: {
          heartRateBpm: 62,
          rmssd: 68,
          coherenceRatio: 0.92,
          coherenceTier: 'high',
          autonomicState: 'deep_parasympathetic',
          cognitiveReadinessScore: 95,
          recommendation: 'Peak parasympathetic vagal coherence established.',
        },
      }),
    )

    expect(html).toMatch(/92.*%/)
    expect(html).toContain('62')
    expect(html).toMatch(/68.*ms/)
    expect(html).toContain('High Coherence')
    expect(html).toContain('Deep Parasympathetic')
    expect(html).toContain('Peak parasympathetic vagal coherence established.')
  })
})
