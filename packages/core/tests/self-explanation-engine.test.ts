/**
 * @file self-explanation-engine.test.ts
 * @description Unit tests for Chi et al. (1989) Self-Explanation & Renkl (2002) Schema Inversion Engine.
 */

import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_EXPLANATION_PROBLEMS,
  evaluateSelfExplanationAttempt,
  exportSelfExplanationToFSRSCards,
  SelfExplanationSession,
} from '../src/explanation/self-explanation-engine'

describe('Chi et al. (1989) Self-Explanation & Aleven-Koedinger (2002) Rule Naming', () => {
  const raftProblem = CALIBRATED_EXPLANATION_PROBLEMS['raft_log_matching_invariant_proof']!
  const step1 = raftProblem.steps[0]!

  it('evaluates deep principle-based justification with correct rule naming and causal connectives', () => {
    const telemetry = evaluateSelfExplanationAttempt({
      step: step1,
      selectedRule: 'Election Safety Invariant',
      userJustification:
        'Because at most one leader is elected per term through majority quorum intersection, this guarantees unicity of the base entry index 1.',
      selectedInversionOptionId: 'opt_raft_1_correct',
    })

    expect(telemetry.ruleNamingAccuracy).toBe(true)
    expect(telemetry.inversionMastery).toBe(true)
    expect(telemetry.mechanisticKeywordCoverage).toBeGreaterThanOrEqual(0.75)
    expect(telemetry.justificationDepthScore).toBeGreaterThanOrEqual(75)
    expect(telemetry.justificationType).toBe('principle_based')
    expect(telemetry.retentionPotentiationMultiplier).toBeGreaterThan(2.0)
    expect(telemetry.identifiedDeficiencies.length).toBe(0)
  })

  it('detects superficial paraphrasing when learner merely restates the step without principle keywords', () => {
    const telemetry = evaluateSelfExplanationAttempt({
      step: step1,
      selectedRule: 'Leader Append-Only Property', // Incorrect distractor
      userJustification: 'Leaders make one entry at index 1 and that is what happens.',
      selectedInversionOptionId: 'opt_raft_1_wrong_heartbeat', // Incorrect inversion
    })

    expect(telemetry.ruleNamingAccuracy).toBe(false)
    expect(telemetry.inversionMastery).toBe(false)
    expect(telemetry.justificationType).toBe('superficial_paraphrase')
    expect(telemetry.justificationDepthScore).toBeLessThan(35)
    expect(telemetry.retentionPotentiationMultiplier).toBeLessThan(1.2)
    expect(telemetry.identifiedDeficiencies.length).toBeGreaterThanOrEqual(2)
  })

  it('classifies goal-operator justifications when sub-goal purpose is described without full formal rule', () => {
    const telemetry = evaluateSelfExplanationAttempt({
      step: step1,
      selectedRule: 'StateMachine Safety Invariant', // Wrong rule
      userJustification:
        'The goal is to ensure base case unicity so that index 1 cannot have duplicates across replicas.',
      selectedInversionOptionId: 'opt_raft_1_correct',
    })

    expect(telemetry.ruleNamingAccuracy).toBe(false)
    expect(telemetry.inversionMastery).toBe(true)
    expect(telemetry.justificationDepthScore).toBeGreaterThanOrEqual(35)
    expect(['goal_operator', 'coherence_building']).toContain(telemetry.justificationType)
  })
})

describe('Renkl (2002) Schema Inversion & Boundary Constraint Analysis', () => {
  const shannonProblem = CALIBRATED_EXPLANATION_PROBLEMS['shannon_source_coding_theorem']!
  const step1 = shannonProblem.steps[0]!

  it('validates counterfactual inversion options diagnosing Kraft tree boundary failures', () => {
    const correctTelemetry = evaluateSelfExplanationAttempt({
      step: step1,
      selectedRule: 'Kraft-McMillan Inequality',
      userJustification:
        'Because each codeword prunes a fraction of leaves in the prefix-free tree, the sum of fractions cannot exceed 1.',
      selectedInversionOptionId: 'opt_shannon_1_correct',
    })

    expect(correctTelemetry.inversionMastery).toBe(true)

    const wrongTelemetry = evaluateSelfExplanationAttempt({
      step: step1,
      selectedRule: 'Kraft-McMillan Inequality',
      userJustification:
        'Because each codeword prunes a fraction of leaves in the prefix-free tree, the sum of fractions cannot exceed 1.',
      selectedInversionOptionId: 'opt_shannon_1_wrong_entropy',
    })

    expect(wrongTelemetry.inversionMastery).toBe(false)
    expect(wrongTelemetry.identifiedDeficiencies).toContain(
      'Schema Inversion: Failed boundary constraint counterfactual analysis.',
    )
  })
})

describe('SelfExplanationSession State Machine & FSRS Flashcard Bridge', () => {
  it('manages multi-step derivation session and advances through steps', () => {
    const session = new SelfExplanationSession()
    expect(session.getState().currentProblemId).toBe('raft_log_matching_invariant_proof')
    expect(session.getState().currentStepIndex).toBe(0)

    const step1 = session.getCurrentStep()!
    session.setRule(step1.governingRuleName)
    session.setJustificationText(
      'Because majority quorum guarantees unicity of one leader per term.',
    )
    session.setInversionOption(step1.inversionChallenge.options[0]!.id)

    const telemetry = session.evaluateCurrentStep()
    expect(telemetry.ruleNamingAccuracy).toBe(true)
    expect(session.getState().isStepEvaluated).toBe(true)

    const advanced = session.advanceToNextStep()
    expect(advanced).toBe(true)
    expect(session.getState().currentStepIndex).toBe(1)
  })

  it('exports evaluated derivations into dual-sided FSRS review cards with scaled stability', () => {
    const session = new SelfExplanationSession()
    const step1 = session.getCurrentStep()!
    session.setRule(step1.governingRuleName)
    session.setJustificationText(
      'Because majority quorum prevents two leaders from being elected in term t, guaranteeing unicity.',
    )
    session.setInversionOption(step1.inversionChallenge.options[0]!.id)
    session.evaluateCurrentStep()

    const cards = exportSelfExplanationToFSRSCards(session)
    expect(cards.length).toBe(2) // 1 Rule-Naming card + 1 Inversion card

    const ruleCard = cards[0]!
    expect(ruleCard.front).toContain('Derivation Step 1')
    expect(ruleCard.back).toContain('Governing Rule')
    expect(ruleCard.back).toContain('Election Safety Invariant')
    expect(ruleCard.suggestedInitialStability).toBeGreaterThan(4.0)
    expect(ruleCard.tags).toContain('self-explanation')

    const inversionCard = cards[1]!
    expect(inversionCard.front).toContain('Schema Inversion / Boundary Test')
    expect(inversionCard.back).toContain('Failure Consequence')
    expect(inversionCard.tags).toContain('schema-inversion')
  })

  it('correctly handles backpropagation matrix calculus derivation and dimension checks', () => {
    const session = new SelfExplanationSession()
    session.selectProblem('backprop_matrix_calculus_chain_rule')

    const prob = session.getCurrentProblem()
    expect(prob).not.toBeNull()
    expect(prob?.domain).toBe('deep_learning')
    expect(prob?.steps.length).toBe(2)

    const step1 = session.getCurrentStep()!
    expect(step1.governingRuleName).toBe('Matrix Differential Trace Invariance & Chain Rule')

    session.setRule('Matrix Differential Trace Invariance & Chain Rule')
    session.setJustificationText(
      'Because cyclic trace invariance allows cyclic permutation so that substituting dY isolates the transposed input X^T to guarantee dimension compatibility.',
    )
    session.setInversionOption(step1.inversionChallenge.options[0]!.id)

    const telemetry = session.evaluateCurrentStep()
    expect(telemetry.ruleNamingAccuracy).toBe(true)
    expect(telemetry.justificationDepthScore).toBeGreaterThanOrEqual(45)
    expect(telemetry.inversionMastery).toBe(true)
    expect(telemetry.retentionPotentiationMultiplier).toBeGreaterThanOrEqual(1.5)
  })
})
