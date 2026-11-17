import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import { AdaptiveExamHUD } from '../src/ui/AdaptiveExamHUD'
import { AdaptiveExamStudio } from '../src/components/AdaptiveExamStudio'
import { CALIBRATED_QUESTION_BANKS } from '@learning-hub/core/practice'

describe('Computerized Adaptive Testing (CAT) & IRT Integration Surfaces', () => {
  const sampleItem = CALIBRATED_QUESTION_BANKS.neuroscience_memory![0]!

  describe('AdaptiveExamHUD Component', () => {
    it('renders latent ability theta, percentile rank, and SEM precision meter', () => {
      const html = renderToString(
        React.createElement(AdaptiveExamHUD, {
          currentTheta: 1.25,
          currentSem: 0.3,
          targetSem: 0.28,
          questionNumber: 4,
          totalQuestionsLimit: 15,
          timeRemainingSeconds: 720,
          sprtDecision: 'pass',
          currentItem: sampleItem,
        }),
      )

      expect(html).toContain('Item Response Theory (CAT 3PL)')
      expect(html).toContain('Question')
      expect(html).toContain('(Adaptive Route)')
      expect(html).toContain('+1.25')
      expect(html).toContain('th %ile')
      expect(html).toContain('Measurement Precision (SEM)')
      expect(html).toContain('0.30')
      expect(html).toContain('Mastery Verified (SPRT Pass)')
      expect(html).toContain('12:00')
    })

    it('renders difficulty and predicted probability for current question item', () => {
      const html = renderToString(
        React.createElement(AdaptiveExamHUD, {
          currentTheta: 0.0,
          currentSem: 0.45,
          targetSem: 0.28,
          questionNumber: 2,
          totalQuestionsLimit: 10,
          currentItem: sampleItem,
        }),
      )

      expect(html).toContain('Item Difficulty (b)')
      expect(html).toContain(sampleItem.difficulty.toFixed(2))
    })
  })

  describe('AdaptiveExamStudio Component', () => {
    it('renders pre-exam overview, stopping rules, and begin examination button', () => {
      const html = renderToString(
        React.createElement(AdaptiveExamStudio, {
          initialDomain: 'neuroscience_memory',
        }),
      )

      expect(html).toContain('Neuroscience &amp; Synaptic Plasticity CAT')
      expect(html).toContain('High-Stakes Adaptive Examination')
      expect(html).toContain('Stopping Rule')
      expect(html).toContain('Time Budget')
      expect(html).toContain('Begin Adaptive Examination')
      expect(html).toContain('Toggle Audio Cues')
    })
  })
})
