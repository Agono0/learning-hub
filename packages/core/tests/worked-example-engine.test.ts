import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_SCAFFOLDING_PROBLEMS,
  WorkedExampleSession,
  calculateCognitiveLoad,
  evaluateErroneousAttempt,
  evaluateSelfExplanation,
  exportStepToFSRS,
  getStepFadingStatus,
} from '../src/scaffolding/worked-example-engine'

describe('Cognitive Load Theory & Worked-Example Fading Engine', () => {
  const raftProblem = CALIBRATED_SCAFFOLDING_PROBLEMS.raft_leader_election!
  const knapsackProblem = CALIBRATED_SCAFFOLDING_PROBLEMS.knapsack_optimal_substructure!
  const transformerProblem = CALIBRATED_SCAFFOLDING_PROBLEMS.transformer_attention_derivation!

  describe('Cognitive Load Theory (CLT) Mathematical Models', () => {
    it('computes intrinsic, extraneous, and germane load within bounds', () => {
      const load = calculateCognitiveLoad({
        elementInteractivity: 4,
        stage: 2,
        learnerExpertise: 0.0,
        hasSubgoalLabels: true,
      })

      expect(load.intrinsicLoad).toBeGreaterThan(0.5)
      expect(load.intrinsicLoad).toBeLessThanOrEqual(5.0)
      expect(load.extraneousLoad).toBeGreaterThan(0.2)
      expect(load.germaneLoad).toBeGreaterThan(0.5)
      expect(load.totalLoad).toBeCloseTo(
        load.intrinsicLoad + load.extraneousLoad + load.germaneLoad,
        2,
      )
      expect(load.workingMemoryCapacity).toBe(4.0)
      expect(load.overloadProbability).toBeGreaterThanOrEqual(0.0)
      expect(load.overloadProbability).toBeLessThanOrEqual(1.0)
    })

    it('demonstrates the Expertise Reversal Effect (Kalyuga 2003)', () => {
      // For a novice, Stage 1 (worked example) has lower extraneous load than Stage 4 (independent)
      const noviceWorked = calculateCognitiveLoad({
        elementInteractivity: 4,
        stage: 1,
        learnerExpertise: -1.5,
      })
      const noviceIndependent = calculateCognitiveLoad({
        elementInteractivity: 4,
        stage: 4,
        learnerExpertise: -1.5,
      })
      expect(noviceWorked.extraneousLoad).toBeLessThan(noviceIndependent.extraneousLoad)

      // For an expert, Stage 1 (worked example) produces HIGHER extraneous load (redundancy) than Stage 4
      const expertWorked = calculateCognitiveLoad({
        elementInteractivity: 4,
        stage: 1,
        learnerExpertise: 1.8,
      })
      const expertIndependent = calculateCognitiveLoad({
        elementInteractivity: 4,
        stage: 4,
        learnerExpertise: 1.8,
      })
      expect(expertWorked.extraneousLoad).toBeGreaterThan(expertIndependent.extraneousLoad)
      expect(expertWorked.recommendedIntervention).toBe('fade_faster')
    })

    it('penalizes split attention with higher extraneous load and overload detection', () => {
      const unified = calculateCognitiveLoad({
        elementInteractivity: 5,
        stage: 3,
        learnerExpertise: -1.0,
        splitAttentionPresent: false,
      })
      const split = calculateCognitiveLoad({
        elementInteractivity: 5,
        stage: 3,
        learnerExpertise: -1.0,
        splitAttentionPresent: true,
      })

      expect(split.extraneousLoad).toBeGreaterThan(unified.extraneousLoad)
      expect(split.isOverloaded).toBe(true)
      expect(split.recommendedIntervention).toBe('reduce_split_attention')
    })
  })

  describe('Renkl-Atkinson Scaffolding Stages & Fading Strategies', () => {
    const totalSteps = raftProblem.steps.length // 4 steps

    it('keeps all steps read-only in Stage 1 (Worked Example)', () => {
      for (const step of raftProblem.steps) {
        const status = getStepFadingStatus({
          step,
          totalSteps,
          stage: 1,
          strategy: 'backward',
        })
        expect(status.isOmitted).toBe(false)
        expect(status.promptType).toBe('read_only')
      }
    })

    it('omits the last step in Stage 2 (Backward Fading)', () => {
      const step1 = raftProblem.steps[0]!
      const lastStep = raftProblem.steps[totalSteps - 1]!

      const status1 = getStepFadingStatus({
        step: step1,
        totalSteps,
        stage: 2,
        strategy: 'backward',
      })
      expect(status1.isOmitted).toBe(false)

      const statusLast = getStepFadingStatus({
        step: lastStep,
        totalSteps,
        stage: 2,
        strategy: 'backward',
      })
      expect(statusLast.isOmitted).toBe(true)
    })

    it('omits intermediate steps in Stage 3 (Forward/Intermediate Fading)', () => {
      const step2 = raftProblem.steps[1]!
      const status2 = getStepFadingStatus({
        step: step2,
        totalSteps,
        stage: 3,
        strategy: 'forward',
      })
      expect(status2.isOmitted).toBe(true)
    })

    it('requires free generation for all steps in Stage 4 (Independent)', () => {
      for (const step of raftProblem.steps) {
        const status = getStepFadingStatus({
          step,
          totalSteps,
          stage: 4,
          strategy: 'backward',
        })
        expect(status.isOmitted).toBe(true)
        expect(status.promptType).toBe('free_generation')
      }
    })
  })

  describe('Self-Explanation Prompt Evaluator (Chi et al. 1989)', () => {
    const prompt = raftProblem.selfExplanationPrompts[0]!

    it('awards high score for comprehensive principle-based explanation', () => {
      const evaluation = evaluateSelfExplanation({
        userExplanation:
          'Because commit requires a majority quorum of N/2 + 1 nodes and election also requires a majority quorum of N/2 + 1 nodes, their intersection cannot be empty by the Pigeonhole Principle. Thus at least one node contains the committed entry.',
        prompt,
      })

      expect(evaluation.score).toBeGreaterThanOrEqual(0.8)
      expect(evaluation.keywordCoverage).toBeGreaterThan(0.6)
      expect(evaluation.matchedRubricItems.length).toBeGreaterThanOrEqual(2)
      expect(evaluation.constructiveFeedback).toContain('Excellent')
    })

    it('flags partial understanding when explanation lacks canonical principles', () => {
      const evaluation = evaluateSelfExplanation({
        userExplanation: 'Because nodes talk to each other and sync up logs.',
        prompt,
      })

      expect(evaluation.score).toBeLessThan(0.6)
      expect(evaluation.constructiveFeedback).toContain('Partial understanding')
    })
  })

  describe('Erroneous Example Crucible (Große & Renkl 2007)', () => {
    const erroneous = knapsackProblem.erroneousVariants[0]!

    it('evaluates perfect identification of flawed step, category, and repair', () => {
      const result = evaluateErroneousAttempt({
        selectedStepIndex: 4,
        selectedMisconception: 'invariant_violation',
        learnerRepairText:
          'Must reference dp[i-1][w - w_i] instead of dp[i] to prevent unbounded item duplication.',
        erroneousVariant: erroneous,
      })

      expect(result.isStepIdentifiedCorrectly).toBe(true)
      expect(result.isMisconceptionIdentifiedCorrectly).toBe(true)
      expect(result.isRepairSufficient).toBe(true)
      expect(result.compositeScore).toBe(1.0)
      expect(result.diagnosticSummary).toContain('Flawless autopsy')
    })

    it('diagnoses incorrect step selection with targeted hints', () => {
      const result = evaluateErroneousAttempt({
        selectedStepIndex: 2,
        selectedMisconception: 'boundary_edge_case',
        learnerRepairText: 'No repair needed.',
        erroneousVariant: erroneous,
      })

      expect(result.isStepIdentifiedCorrectly).toBe(false)
      expect(result.compositeScore).toBeLessThan(0.4)
      expect(result.diagnosticSummary).toContain('The error lies in Step 4')
    })
  })

  describe('FSRS Flashcard Generation Bridge', () => {
    it('generates well-structured FSRS v5 card from faded step', () => {
      const card = exportStepToFSRS({
        problem: transformerProblem,
        stepIndex: 4,
        stage: 3,
      })

      expect(card.front).toContain('[MACHINE_LEARNING]')
      expect(card.front).toContain('Variance Invariant')
      expect(card.back).toContain('Governing Principle')
      expect(card.tags).toContain('scaffolding')
      expect(card.tags).toContain('stage-3')
      expect(card.suggestedDifficulty).toBeGreaterThanOrEqual(1)
      expect(card.suggestedStability).toBeGreaterThan(0)
    })
  })

  describe('WorkedExampleSession State Machine', () => {
    it('orchestrates interactive step evaluation and advances session state', () => {
      const session = new WorkedExampleSession('raft_leader_election', 2, 0.0)

      expect(session.getState().currentStepIndex).toBe(1)
      expect(session.getState().isCompleted).toBe(false)

      // Step 1 evaluation
      const eval1 = session.evaluateCurrentStepAnswer(
        'Quorum(Commit) \\cap Quorum(Voters) \\neq \\emptyset',
      )
      expect(eval1.isCorrect).toBe(true)
      expect(session.getState().currentStepIndex).toBe(2)

      // Step 2 evaluation with multiple choice index (index 0 is correct)
      const eval2 = session.evaluateCurrentStepAnswer('0')
      expect(eval2.isCorrect).toBe(true)
      expect(session.getState().currentStepIndex).toBe(3)

      // Hint usage
      const hint = session.useHint()
      expect(hint).toContain('Hint for Step 3')
      expect(session.getState().hintsUsed).toBe(1)

      // Step 3 evaluation with cloze target 'k'
      const eval3 = session.evaluateCurrentStepAnswer('k')
      expect(eval3.isCorrect).toBe(true)
      expect(session.getState().currentStepIndex).toBe(4)

      // Step 4 evaluation
      const eval4 = session.evaluateCurrentStepAnswer(
        '\\forall T > T_c, \\; Entry(Leader_T, k) = Entry(Leader_{T_c}, k)',
      )
      expect(eval4.isCorrect).toBe(true)
      expect(session.getState().isCompleted).toBe(true)
      expect(session.getState().learnerExpertise).toBeGreaterThan(0.0)
    })
  })
})
