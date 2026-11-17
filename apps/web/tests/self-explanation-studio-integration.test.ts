/**
 * @file self-explanation-studio-integration.test.ts
 * @description Web SSR integration tests for Self-Explanation HUD and Studio components.
 */

import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import { SelfExplanationHUD } from '../src/ui/SelfExplanationHUD'
import { SelfExplanationStudio } from '../src/components/SelfExplanationStudio'
import {
  CALIBRATED_EXPLANATION_PROBLEMS,
  evaluateSelfExplanationAttempt,
} from '@learning-hub/core/explanation/self-explanation-engine'

describe('Self-Explanation & Schema Inversion Web Integration', () => {
  const problem = CALIBRATED_EXPLANATION_PROBLEMS['raft_log_matching_invariant_proof']!
  const step = problem.steps[0]!
  const telemetry = evaluateSelfExplanationAttempt({
    step,
    selectedRule: step.governingRuleName,
    userJustification:
      'Because at most one leader is elected per term through majority quorum intersection, this guarantees unicity of the base entry index 1.',
    selectedInversionOptionId: step.inversionChallenge.options[0]!.id,
  })

  describe('SelfExplanationHUD Component', () => {
    it('renders Justification Depth Index, Rule Naming, and Inversion check', () => {
      const html = renderToString(
        React.createElement(SelfExplanationHUD, {
          telemetry,
          currentStepNumber: 1,
          totalSteps: 2,
          activeRuleName: step.governingRuleName,
        }),
      )

      expect(html).toContain('Self-Explanation &amp; Schema Inversion HUD')
      expect(html).toContain('Chi et al. (1989) Justification Depth')
      expect(html).toContain('Justification Depth Index (JDI)')
      expect(html).toContain('FSRS Retention Multiplier')
      expect(html).toContain('Rule Naming')
      expect(html).toContain('Schema Inversion')
      expect(html).toContain('Election Safety Invariant')
      expect(html).toContain('Principle-Based Grounding')
    })
  })

  describe('SelfExplanationStudio Component', () => {
    it('renders derivation workbench, theorem statement, and tabs', () => {
      const html = renderToString(React.createElement(SelfExplanationStudio, {}))

      expect(html).toContain('Derivation Workbench')
      expect(html).toContain('Boundary Inversion')
      expect(html).toContain('Proof Chain')
      expect(html).toContain('FSRS Deck')
      expect(html).toContain('Election Safety Invariant')
      expect(html).toContain('Name the Governing Principle or Invariant')
      expect(html).toContain('Generative Self-Explanation')
      expect(html).toContain('Evaluate Justification')
    })
  })
})
