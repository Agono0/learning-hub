import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import { MetacognitiveCalibrationHUD } from '../src/ui/MetacognitiveCalibrationHUD'
import { MetacognitionStudio } from '../src/components/MetacognitionStudio'
import {
  evaluateMetacognitiveCalibrationProfile,
  TrialMetacognitiveRecord,
} from '@learning-hub/core/metacognition'

describe('Dynamic Metacognitive Calibration & Hypercorrection Web Integration', () => {
  const sampleTrials: TrialMetacognitiveRecord[] = [
    {
      itemId: 'crucible_thermal_equilibrium',
      selectedOptionId: 'opt_metal_temp',
      isCorrect: false,
      prospectiveJOL: 0.9,
      retrospectiveConfidence: 0.95,
      responseLatencyMs: 1200,
      epistemicSurpriseScore: 0.95,
      isHypercorrectionCandidate: true,
      detectedIllusion: 'intuitive_physics_bias',
    },
    {
      itemId: 'crucible_conjunction_fallacy',
      selectedOptionId: 'opt_linda_teller',
      isCorrect: true,
      prospectiveJOL: 0.8,
      retrospectiveConfidence: 0.85,
      responseLatencyMs: 1500,
      epistemicSurpriseScore: 0,
      isHypercorrectionCandidate: false,
    },
  ]

  const profile = evaluateMetacognitiveCalibrationProfile(sampleTrials)

  describe('MetacognitiveCalibrationHUD Component', () => {
    it('renders Calibration Index, Goodman-Kruskal Gamma, and Brier metrics', () => {
      const html = renderToString(
        React.createElement(MetacognitiveCalibrationHUD, {
          profile,
          lastEpistemicSurpriseScore: 0.95,
          isHypercorrectionTriggered: true,
          currentIllusion: 'intuitive_physics_bias',
        }),
      )

      expect(html).toContain('Metacognitive Calibration HUD')
      expect(html).toContain('Nelson-Narens Monitoring')
      expect(html).toContain('Calibration (MCI)')
      expect(html).toContain('Resolution (γ)')
      expect(html).toContain('Confidence Bias')
      expect(html).toContain('Brier Quadratic')
      expect(html).toContain('Epistemic Prediction Error Triggered')
      expect(html).toContain('Intuitive Physics Bias (McCloskey 1983)')
    })

    it('renders cleanly when no epistemic shock is active', () => {
      const html = renderToString(
        React.createElement(MetacognitiveCalibrationHUD, {
          profile,
          isHypercorrectionTriggered: false,
        }),
      )

      expect(html).toContain('Metacognitive Calibration HUD')
      expect(html).not.toContain('Epistemic Prediction Error Triggered')
    })
  })

  describe('MetacognitionStudio Component', () => {
    it('renders crucible workspace, dual JOL slider steps, and workspace tabs', () => {
      const html = renderToString(React.createElement(MetacognitionStudio, {}))

      expect(html).toContain('Epistemic Crucible')
      expect(html).toContain('Calibration Curve')
      expect(html).toContain('Hypercorrection Lab')
      expect(html).toContain('FSRS Flashcards')
      expect(html).toContain('Thermal Sensation')
      expect(html).toContain('Equilibrium Invariant')
      expect(html).toContain('Prospective Judgment of Learning')
    })
  })
})
