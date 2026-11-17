import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import { BreathingCoherenceStudio } from '../src/components/BreathingCoherenceStudio'
import { SleepConsolidationStudio } from '../src/components/SleepConsolidationStudio'
import { AudioCommuteStudio } from '../src/components/AudioCommuteStudio'

describe('Coherence, Audio Commute & Sleep TMR Integration Surfaces', () => {
  describe('BreathingCoherenceStudio Component', () => {
    it('renders resonance breathing studio with initial 0.1 Hz protocol', () => {
      const html = renderToString(
        React.createElement(BreathingCoherenceStudio, {
          initialProtocol: 'resonance_0_1hz',
          targetDurationSeconds: 120,
        }),
      )

      expect(html).toContain('Autonomic Resonance &amp; Cardiac Coherence Studio')
      expect(html).toContain('0.1 Hz Baroreflex Resonance')
      expect(html).toContain('Vagal RMSSD')
      expect(html).toContain('Cognitive Readiness')
      expect(html).toContain('Begin Resonance')
    })

    it('renders all 4 scientific breathing protocols in the selector dock', () => {
      const html = renderToString(
        React.createElement(BreathingCoherenceStudio, {
          initialProtocol: 'box_focus',
        }),
      )

      expect(html).toContain('Parasympathetic Vagal Flush')
      expect(html).toContain('Tactical Box Focus')
      expect(html).toContain('Alerting Gamma Cadence')
      expect(html).toContain('Tap Pulse')
    })
  })

  describe('SleepConsolidationStudio Component', () => {
    it('renders night lab with SWS ultradian architecture timeline', () => {
      const sampleCues = [
        {
          cardId: 401,
          frontText: 'Mitochondrial ATP synthase mechanism',
          earcon: {
            cardId: 401,
            baseFrequency: 440,
            harmonicType: 'major_triad' as const,
            durationMs: 400,
            targetSleepStage: 'sws_nrem' as const,
            maxDbSpl: 40,
          },
          difficulty: 0.7,
          replaysToday: 2,
        },
        {
          cardId: 402,
          frontText: 'Action potential depolarisation threshold',
          earcon: {
            cardId: 402,
            baseFrequency: 520,
            harmonicType: 'perfect_fifth' as const,
            durationMs: 400,
            targetSleepStage: 'sws_nrem' as const,
            maxDbSpl: 40,
          },
          difficulty: 0.85,
          replaysToday: 1,
        },
      ]

      const html = renderToString(
        React.createElement(SleepConsolidationStudio, {
          cues: sampleCues,
          sleepHours: 8,
        }),
      )

      expect(html).toContain('Targeted Memory Reactivation (TMR) Night Lab')
      expect(html).toContain('SWS Slow-Wave Replay')
      expect(html).toContain('Mitochondrial ATP synthase mechanism')
      expect(html).toContain('Action potential depolarisation threshold')
      expect(html).toContain('Whisper Volume Ceiling')
      expect(html).toContain('Activate TMR Night Consolidation')
    })

    it('renders empty queue message when no cards are due', () => {
      const html = renderToString(
        React.createElement(SleepConsolidationStudio, {
          cues: [],
          sleepHours: 7,
        }),
      )

      expect(html).toContain('No recent cards queued')
    })
  })

  describe('AudioCommuteStudio Component', () => {
    it('renders commute player with hands-free voice controls', () => {
      const sampleCards = [
        {
          id: 501,
          front: 'What neurotransmitter is released by postganglionic parasympathetic neurons?',
          back: 'Acetylcholine (ACh)',
          deckName: 'Neurobiology',
        },
      ]

      const html = renderToString(
        React.createElement(AudioCommuteStudio, {
          cards: sampleCards,
        }),
      )

      expect(html).toContain('Hands-Free Commute Audio Studio')
      expect(html).toContain('Voice &amp; Earcon Engine')
      expect(html).toContain('Neurobiology')
      expect(html).toContain(
        'What neurotransmitter is released by postganglionic parasympathetic neurons?',
      )
      expect(html).toContain('Reveal Answer (Say &quot;Flip&quot;)')
    })

    it('renders completion screen when cards queue is exhausted', () => {
      const html = renderToString(
        React.createElement(AudioCommuteStudio, {
          cards: [],
        }),
      )

      expect(html).toContain('Commute Audio Session Complete!')
    })
  })
})
