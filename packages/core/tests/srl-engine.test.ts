import { describe, it, expect } from 'vitest'
import {
  evaluateForethought,
  analyzeVolitionalControl,
  evaluateCausalAttributions,
  scoreMSLQ,
  computeZimmermanCyclicIndex,
  bridgeSRLToFSRS,
  ForethoughtPlan,
  VolitionalControlSession,
  CausalAttribution,
  SRLCyclicProfile,
} from '../src/srl/srl-engine'

describe('Self-Regulated Learning (SRL) & Zimmerman Engine', () => {
  describe('Phase 1: Forethought & Task Analysis', () => {
    it('evaluates a high-quality, calibrated forethought plan', () => {
      const plan: ForethoughtPlan = {
        id: 'plan_1',
        targetSkillOrTopic: 'Fourier Transform & Frequency Domain Analysis',
        proximalSubgoals: [
          'Derive Euler formula representation',
          'Solve 3 continuous-time Fourier integral transforms',
          'Implement discrete FFT algorithm in TypeScript',
        ],
        distalOutcome: 'Fluently analyze frequency spectra and filter responses without references',
        strategicPlans: [
          {
            id: 'strat_1',
            strategy: 'retrieval_practice',
            rationale: 'Active recall of standard transform pairs from memory',
            plannedMinutes: 25,
            completed: false,
          },
          {
            id: 'strat_2',
            strategy: 'dual_coding',
            rationale: 'Visualize phase and magnitude plots concurrently',
            plannedMinutes: 20,
            completed: false,
          },
          {
            id: 'strat_3',
            strategy: 'elaboration',
            rationale: 'Connect convolution theorem to spatial blurring in computer vision',
            plannedMinutes: 15,
            completed: false,
          },
        ],
        selfEfficacyRating: 80,
        expectedDifficulty: 4, // 4 * 20 = 80 -> ratio 1.0 (calibrated)
        intrinsicInterest: 9,
        goalOrientation: 'mastery_approach',
        createdAt: new Date().toISOString(),
      }

      const result = evaluateForethought(plan)
      expect(result.goalSpecificityScore).toBeGreaterThanOrEqual(80)
      expect(result.strategicVarietyScore).toBe(100)
      expect(result.calibrationDiagnosis).toBe('calibrated')
      expect(result.calibrationRatio).toBe(1.0)
      expect(result.masteryOrientationStrength).toBe(100)
      expect(result.forethoughtQualityScore).toBeGreaterThanOrEqual(85)
      expect(result.recommendations.length).toBe(0)
    })

    it('identifies overconfidence and lack of proximal decomposition', () => {
      const underplannedPlan: ForethoughtPlan = {
        id: 'plan_2',
        targetSkillOrTopic: 'Quantum Mechanics',
        proximalSubgoals: ['Read chapter'],
        distalOutcome: 'Pass test',
        strategicPlans: [
          {
            id: 'strat_1',
            strategy: 'summarization',
            rationale: 'Reread notes',
            plannedMinutes: 30,
            completed: false,
          },
        ],
        selfEfficacyRating: 95,
        expectedDifficulty: 2, // 2 * 20 = 40 -> ratio 95/40 = 2.375 (overconfident)
        intrinsicInterest: 4,
        goalOrientation: 'performance_avoidance',
        createdAt: new Date().toISOString(),
      }

      const result = evaluateForethought(underplannedPlan)
      expect(result.calibrationDiagnosis).toBe('overconfident')
      expect(result.calibrationRatio).toBeGreaterThan(1.5)
      expect(result.masteryOrientationStrength).toBe(30)
      expect(result.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringContaining('proximal subgoals'),
          expect.stringContaining('generative strategies'),
          expect.stringContaining('mastery-approach'),
        ]),
      )
    })
  })

  describe('Phase 2: Volitional Control & Performance', () => {
    it('analyzes a stable, high-focus volitional study session', () => {
      const session: VolitionalControlSession = {
        id: 'sess_1',
        forethoughtPlanId: 'plan_1',
        startedAt: '2026-11-18T00:00:00Z',
        endedAt: '2026-11-18T01:00:00Z',
        durationMinutes: 60,
        distractionTally: 1,
        activeFocusMinutes: 56,
        attentionInterventions: [
          {
            id: 'int_1',
            timestamp: '2026-11-18T00:35:00Z',
            trigger: 'mind_wandering',
            interventionStrategy:
              'Deep breath and write immediate next derivation step on whiteboard',
            resolved: true,
            latencySeconds: 12,
          },
        ],
        selfInstructionPromptsUsed: [
          'Break the integral into symmetric real and imaginary bounds.',
          'Focus purely on the current exponent substitution.',
        ],
        perceivedCognitiveLoad: 6,
      }

      const result = analyzeVolitionalControl(session)
      expect(result.focusEfficiencyRatio).toBe(93) // 56/60 = 93.3% -> 93%
      expect(result.distractionRatePerHour).toBe(1.0)
      expect(result.interventionResolutionRate).toBe(100)
      expect(result.executiveControlLevel).toBe('exceptional')
      expect(result.volitionalStabilityScore).toBeGreaterThanOrEqual(90)
    })

    it('detects fragile executive control during high distraction and overload', () => {
      const session: VolitionalControlSession = {
        id: 'sess_fragile',
        forethoughtPlanId: 'plan_2',
        startedAt: '2026-11-18T00:00:00Z',
        durationMinutes: 45,
        distractionTally: 8,
        activeFocusMinutes: 20,
        attentionInterventions: [
          {
            id: 'int_1',
            timestamp: '2026-11-18T00:10:00Z',
            trigger: 'impulsive_device_check',
            interventionStrategy: 'Put phone away',
            resolved: false,
            latencySeconds: 45,
          },
        ],
        selfInstructionPromptsUsed: [],
        perceivedCognitiveLoad: 9,
      }

      const result = analyzeVolitionalControl(session)
      expect(result.focusEfficiencyRatio).toBe(44) // 20/45 = 44%
      expect(result.distractionRatePerHour).toBeGreaterThan(10)
      expect(result.interventionResolutionRate).toBe(0)
      expect(result.executiveControlLevel).toBe('fragile')
      expect(result.insights.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Phase 3: Self-Reflection & Causal Attributions', () => {
    it('identifies adaptive mastery attributions (strategy & effort)', () => {
      const attributions: CausalAttribution[] = [
        {
          id: 'attr_1',
          outcomeDescription: 'Mastered 8 out of 10 Fourier problem sets',
          outcomeValence: 'success',
          category: 'strategy',
          locus: 'internal',
          stability: 'unstable',
          controllability: 'controllable',
          justification: 'Dual coding visualization made frequency symmetry evident.',
        },
        {
          id: 'attr_2',
          outcomeDescription: 'Stumbled on Dirac delta pulse transform',
          outcomeValence: 'failure',
          category: 'effort',
          locus: 'internal',
          stability: 'unstable',
          controllability: 'controllable',
          justification: 'Did not review sampling distribution theorems prior to computation.',
        },
      ]

      const result = evaluateCausalAttributions(attributions)
      expect(result.controllableInternalRatio).toBe(100)
      expect(result.isGrowthMindsetOriented).toBe(true)
      expect(result.learnedHelplessnessRisk).toBe(false)
      expect(result.adaptiveInferenceScore).toBe(100)
    })

    it('flags learned helplessness when failure is attributed to fixed ability', () => {
      const attributions: CausalAttribution[] = [
        {
          id: 'attr_fixed',
          outcomeDescription: 'Failed calculus practice midterm',
          outcomeValence: 'failure',
          category: 'ability',
          locus: 'internal',
          stability: 'stable',
          controllability: 'uncontrollable',
          justification: 'I just do not have the math brain for this kind of abstraction.',
        },
      ]

      const result = evaluateCausalAttributions(attributions)
      expect(result.learnedHelplessnessRisk).toBe(true)
      expect(result.isGrowthMindsetOriented).toBe(false)
      expect(result.reframingDirectives).toEqual(
        expect.arrayContaining([expect.stringContaining('CRITICAL REFRAMING')]),
      )
    })
  })

  describe('MSLQ Diagnostic Scoring', () => {
    it('computes 15 subscales, percentiles, benchmarks, and detects bottlenecks', () => {
      const responses: Record<string, number> = {
        mslq_1: 6, // intrinsic
        mslq_2: 4, // extrinsic
        mslq_3: 7, // task value
        mslq_4: 6, // control of learning
        mslq_5: 6, // self efficacy
        mslq_6: 5, // test anxiety (elevated)
        mslq_7: 3, // rehearsal
        mslq_8: 6, // elaboration (high)
        mslq_9: 5, // organization
        mslq_10: 6, // critical thinking
        mslq_11: 6, // metacognitive self regulation
        mslq_12: 5, // time & study env
        mslq_13: 2, // effort regulation (LOW bottleneck!)
        mslq_14: 4, // peer learning
        mslq_15: 5, // help seeking
      }

      const profile = scoreMSLQ(responses)
      expect(profile.scales.intrinsic_goal_orientation.rawMean).toBe(6)
      expect(profile.scales.elaboration.rawMean).toBe(6)
      expect(profile.scales.effort_regulation.rawMean).toBe(2)
      expect(profile.scales.effort_regulation.benchmarkLevel).toBe('low')
      expect(profile.criticalBottlenecks).toContain('Effort Regulation & Persistence')
      expect(profile.topStrengths.length).toBeGreaterThanOrEqual(1)
      expect(profile.prescribedInterventions).toEqual(
        expect.arrayContaining([expect.stringContaining('Dual risk profile detected')]),
      )
    })
  })

  describe('Zimmerman Cyclical Profile & FSRS Bridge', () => {
    it('computes holistic cyclic self-regulation index and detects weakest phase', () => {
      const profile: SRLCyclicProfile = {
        id: 'prof_1',
        userId: 'user_1',
        forethoughtPlans: [
          {
            id: 'p1',
            targetSkillOrTopic: 'Neuroscience',
            proximalSubgoals: ['Action potential mechanisms', 'Neurotransmitter vesicles'],
            distalOutcome: 'Explain synaptic transmission flawlessly',
            strategicPlans: [
              {
                id: 's1',
                strategy: 'retrieval_practice',
                rationale: 'Active recall',
                plannedMinutes: 30,
                completed: true,
              },
            ],
            selfEfficacyRating: 80,
            expectedDifficulty: 4,
            intrinsicInterest: 8,
            goalOrientation: 'mastery_approach',
            createdAt: '2026-11-18T00:00:00Z',
          },
        ],
        volitionalSessions: [
          {
            id: 'vs1',
            forethoughtPlanId: 'p1',
            startedAt: '2026-11-18T00:00:00Z',
            durationMinutes: 40,
            distractionTally: 1,
            activeFocusMinutes: 38,
            attentionInterventions: [],
            selfInstructionPromptsUsed: [],
            perceivedCognitiveLoad: 5,
          },
        ],
        reflections: [
          {
            id: 'ref1',
            volitionalSessionId: 'vs1',
            masteryStandardScore: 85,
            observedPerformanceScore: 88,
            performanceDiscrepancy: 3,
            attributions: [
              {
                id: 'a1',
                outcomeDescription: 'Exceeded target',
                outcomeValence: 'success',
                category: 'strategy',
                locus: 'internal',
                stability: 'unstable',
                controllability: 'controllable',
                justification: 'Retrieval practice cemented axon physiology',
              },
            ],
            selfSatisfactionRating: 9,
            adaptiveInferences: {
              maintainStrategies: true,
              strategyModifications: [],
              proximalTargetForNextForethought: 'Dopaminergic pathways',
            },
            defensiveReactionDetected: false,
            createdAt: '2026-11-18T01:00:00Z',
          },
        ],
        lastUpdated: new Date().toISOString(),
      }

      const result = computeZimmermanCyclicIndex(profile)
      expect(result.compositeSRLIndex).toBeGreaterThanOrEqual(80)
      expect(result.maturityLevel).toMatch(/proficient|expert_self_regulated/)
      expect(result.cyclicPhaseEquilibrium).toBeGreaterThan(70)
    })

    it('bridges SRL metacognitive index into FSRS stability multiplier', () => {
      // Novice/low SRL (index 20)
      const lowSrl = bridgeSRLToFSRS(20, 10.0)
      expect(lowSrl.srlRetentionMultiplier).toBe(0.93)
      expect(lowSrl.modulatedStability).toBe(9.3)

      // Expert SRL (index 95)
      const expertSrl = bridgeSRLToFSRS(95, 10.0)
      expect(expertSrl.srlRetentionMultiplier).toBe(1.23)
      expect(expertSrl.modulatedStability).toBe(12.3)
    })
  })
})
