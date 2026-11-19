import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_COGNITIVE_LOAD_SCENARIOS,
  calculateKeystrokeJitter,
  calculatePaasEfficiency,
  decomposeTripartiteLoad,
  evaluateComprehensiveCognitiveLoad,
  evaluateFlowChannel,
} from '../src/cognitive-load'

describe('Cognitive Load Theory & Intrinsic Load Engine (Sweller, Paas, Csikszentmihalyi)', () => {
  describe('calculateKeystrokeJitter (Retrieval Hesitation Variance)', () => {
    it('returns 0 for missing, empty, or single/double keypress sequences', () => {
      expect(calculateKeystrokeJitter([])).toBe(0)
      expect(calculateKeystrokeJitter([100])).toBe(0)
      expect(calculateKeystrokeJitter([100, 250])).toBe(0)
    })

    it('returns 0 for perfectly metronomic, steady typing cadences', () => {
      const timestamps = [100, 200, 300, 400, 500, 600]
      expect(calculateKeystrokeJitter(timestamps)).toBe(0)
    })

    it('calculates standard deviation of inter-keystroke intervals accurately for hesitant typing', () => {
      // Intervals: [100, 900, 100, 900] -> mean = 500, deviations: [-400, 400, -400, 400], variance = 160000, sd = 400
      const timestamps = [0, 100, 1000, 1100, 2000]
      const jitter = calculateKeystrokeJitter(timestamps)
      expect(jitter).toBeCloseTo(400, 1)
    })
  })

  describe('decomposeTripartiteLoad (Sweller 1988, 2011 & Cowan 2001 Capacity)', () => {
    it('allocates Cowan chunks within capacity for low element interactivity and high mastery', () => {
      const load = decomposeTripartiteLoad(2, 0.9, 0.1, 4.0)
      expect(load.intrinsicChunks).toBeLessThanOrEqual(1.5)
      expect(load.extraneousChunks).toBeLessThanOrEqual(0.5)
      expect(load.germaneChunks).toBeGreaterThan(0)
      expect(load.isOverloaded).toBe(false)
      expect(load.freeWorkingMemoryHeadroom).toBeGreaterThan(0)
    })

    it('detects working memory overload when complex elements and high friction exceed 4 chunks', () => {
      const load = decomposeTripartiteLoad(9, 0.1, 0.9, 4.0)
      expect(load.intrinsicChunks).toBeGreaterThanOrEqual(3.0)
      expect(load.extraneousChunks).toBeGreaterThanOrEqual(1.8)
      expect(load.totalLoadChunks).toBeGreaterThan(4.0)
      expect(load.isOverloaded).toBe(true)
      expect(load.freeWorkingMemoryHeadroom).toBeLessThan(0)
      expect(load.germaneChunks).toBe(0.1) // minimal baseline when headroom is exhausted
    })

    it('demonstrates expertise reversal effect where mastery reduces intrinsic chunk burden', () => {
      const noviceLoad = decomposeTripartiteLoad(6, 0.1, 0.2, 4.0)
      const expertLoad = decomposeTripartiteLoad(6, 0.95, 0.2, 4.0)
      expect(expertLoad.intrinsicChunks).toBeLessThan(noviceLoad.intrinsicChunks)
    })
  })

  describe('calculatePaasEfficiency (Paas & Van Merriënboer 1993 2D Metric)', () => {
    it('identifies high instructional efficiency (schema automation) for high performance with low effort', () => {
      const result = calculatePaasEfficiency(1.0, 2)
      expect(result.quadrant).toBe('high_efficiency')
      expect(result.cognitiveEfficiencyIndex).toBeGreaterThan(0.35)
      expect(result.performanceZ).toBeGreaterThan(0)
      expect(result.mentalEffortZ).toBeLessThan(0)
    })

    it('identifies critical cognitive thrashing for poor performance despite extreme mental effort', () => {
      const result = calculatePaasEfficiency(0.3, 8)
      expect(result.quadrant).toBe('critical_thrashing')
      expect(result.cognitiveEfficiencyIndex).toBeLessThan(-0.35)
      expect(result.interpretation).toContain('Critical Cognitive Thrashing')
    })

    it('identifies low instructional efficiency when mental effort outstrips recall accuracy', () => {
      const result = calculatePaasEfficiency(0.5, 7)
      expect(result.quadrant).toBe('low_efficiency')
      expect(result.cognitiveEfficiencyIndex).toBeLessThan(-0.35)
    })

    it('identifies balanced medium efficiency when effort matches performance proportional norm', () => {
      const result = calculatePaasEfficiency(0.65, 5)
      expect(result.quadrant).toBe('medium_efficiency')
      expect(Math.abs(result.cognitiveEfficiencyIndex)).toBeLessThan(0.35)
    })
  })

  describe('evaluateFlowChannel (Csikszentmihalyi 1990 & Yerkes-Dodson 1908)', () => {
    it('classifies boredom when challenge is trivial relative to mastery', () => {
      const flow = evaluateFlowChannel(0.2, 0.9)
      expect(flow.flowZone).toBe('boredom')
      expect(flow.challengeToSkillRatio).toBeLessThan(0.7)
      expect(flow.isWithinFlowCorridor).toBe(false)
    })

    it('classifies relaxation when task is comfortable but manageable', () => {
      const flow = evaluateFlowChannel(0.72, 0.95)
      expect(flow.flowZone).toBe('relaxation')
      expect(flow.challengeToSkillRatio).toBeGreaterThanOrEqual(0.7)
      expect(flow.challengeToSkillRatio).toBeLessThan(0.85)
    })

    it('classifies optimal flow when challenge matches learner skill within ±15%', () => {
      const flow = evaluateFlowChannel(0.8, 0.8)
      expect(flow.flowZone).toBe('flow')
      expect(flow.challengeToSkillRatio).toBe(1.0)
      expect(flow.flowChannelCoherence).toBe(1.0)
      expect(flow.isWithinFlowCorridor).toBe(true)
    })

    it('classifies productive arousal when challenge slightly pushes past mastery', () => {
      const flow = evaluateFlowChannel(0.96, 0.8)
      expect(flow.flowZone).toBe('arousal')
      expect(flow.challengeToSkillRatio).toBe(1.2)
      expect(flow.isWithinFlowCorridor).toBe(true)
    })

    it('classifies anxiety when challenge significantly exceeds mastery', () => {
      const flow = evaluateFlowChannel(0.95, 0.7)
      expect(flow.flowZone).toBe('anxiety')
      expect(flow.challengeToSkillRatio).toBeGreaterThan(1.25)
      expect(flow.isWithinFlowCorridor).toBe(false)
    })

    it('classifies cognitive collapse when challenge severely outstrips capacity', () => {
      const flow = evaluateFlowChannel(0.95, 0.4)
      expect(flow.flowZone).toBe('cognitive_collapse')
      expect(flow.challengeToSkillRatio).toBeGreaterThan(1.45)
      expect(flow.guidance).toContain('Cognitive Overload / Panic')
    })

    it('adjusts Yerkes-Dodson optimal target percentage based on task complexity', () => {
      const complexTask = evaluateFlowChannel(0.8, 0.8, 'complex')
      const moderateTask = evaluateFlowChannel(0.8, 0.8, 'moderate')
      const simpleTask = evaluateFlowChannel(0.8, 0.8, 'simple')
      expect(complexTask.optimalArousalTargetPct).toBe(45)
      expect(moderateTask.optimalArousalTargetPct).toBe(60)
      expect(simpleTask.optimalArousalTargetPct).toBe(75)
    })
  })

  describe('evaluateComprehensiveCognitiveLoad (Diagnostic Synthesis & Micro-Interventions)', () => {
    it('evaluates optimal flow scenario with expanded FSRS stability and intervals', () => {
      const evalResult = evaluateComprehensiveCognitiveLoad({
        responseLatencyMs: 3500,
        baselineLatencyMs: 4000,
        keystrokeTimestamps: [0, 150, 300, 450, 600],
        backspaceCount: 0,
        recentErrorsInLast5Cards: 0,
        subjectiveMentalEffortRating: 3,
        learnerDomainMastery: 0.85,
        targetTaskDifficulty: 0.8,
        taskElementCount: 3,
      })

      expect(evalResult.cli).toBeLessThan(0.35)
      expect(evalResult.flowEvaluation.flowZone).toBe('flow')
      expect(evalResult.paasEfficiency.quadrant).toBe('high_efficiency')
      expect(evalResult.recommendedIntervention).toBe('none')
      expect(evalResult.fsrsModulation.stabilityMultiplier).toBe(1.25)
      expect(evalResult.fsrsModulation.difficultyDelta).toBe(-0.5)
      expect(evalResult.fsrsModulation.recommendedIntervalFactor).toBe(1.3)
      expect(evalResult.recommendedScaffoldStage.phase).toBe('systemic_synthesis')
    })

    it('prescribes worked example intervention and contracts FSRS intervals under error burst overload', () => {
      const evalResult = evaluateComprehensiveCognitiveLoad({
        responseLatencyMs: 14000,
        baselineLatencyMs: 3800,
        keystrokeTimestamps: [0, 200, 1500, 1600, 3200],
        backspaceCount: 7,
        recentErrorsInLast5Cards: 3,
        subjectiveMentalEffortRating: 9,
        learnerDomainMastery: 0.25,
        targetTaskDifficulty: 0.9,
        taskElementCount: 8,
      })

      expect(evalResult.cli).toBeGreaterThan(0.65)
      expect(evalResult.tripartiteLoad.isOverloaded).toBe(true)
      expect(evalResult.recommendedIntervention).toBe('worked_example')
      expect(evalResult.fsrsModulation.stabilityMultiplier).toBe(0.75)
      expect(evalResult.fsrsModulation.difficultyDelta).toBe(1.5)
      expect(evalResult.fsrsModulation.recommendedIntervalFactor).toBe(0.65)
      expect(evalResult.recommendedScaffoldStage.phase).toBe('isolated_elements')
      expect(
        evalResult.narrativeDiagnostics.some((d) => d.includes('Working memory capacity exceeded')),
      ).toBe(true)
    })

    it('prescribes format stepdown when backspace churn is high without error burst', () => {
      const evalResult = evaluateComprehensiveCognitiveLoad({
        responseLatencyMs: 9500,
        baselineLatencyMs: 4000,
        keystrokeTimestamps: [0, 100, 1200, 1300, 2400],
        backspaceCount: 5,
        recentErrorsInLast5Cards: 1,
        subjectiveMentalEffortRating: 8,
        learnerDomainMastery: 0.3,
        targetTaskDifficulty: 0.85,
        taskElementCount: 7,
      })

      expect(evalResult.recommendedIntervention).toBe('format_stepdown')
      expect(evalResult.narrativeDiagnostics.some((d) => d.includes('hesitation variance'))).toBe(
        true,
      )
    })

    it('prescribes challenge acceleration when learner experiences trivial underload', () => {
      const evalResult = evaluateComprehensiveCognitiveLoad({
        responseLatencyMs: 800,
        baselineLatencyMs: 4200,
        keystrokeTimestamps: [0, 100, 200, 300],
        backspaceCount: 0,
        recentErrorsInLast5Cards: 0,
        subjectiveMentalEffortRating: 1,
        learnerDomainMastery: 0.95,
        targetTaskDifficulty: 0.4,
        taskElementCount: 2,
      })

      expect(evalResult.recommendedIntervention).toBe('accelerate_challenge')
      expect(evalResult.fsrsModulation.stabilityMultiplier).toBe(1.35)
      expect(evalResult.fsrsModulation.difficultyDelta).toBe(-1.0)
    })
  })

  describe('CALIBRATED_COGNITIVE_LOAD_SCENARIOS (Curricular Benchmarks)', () => {
    it('provides valid 3-phase scaffold progression for distributed Paxos consensus', () => {
      const paxos = CALIBRATED_COGNITIVE_LOAD_SCENARIOS['distributed_paxos_consensus']
      expect(paxos).toBeDefined()
      expect(paxos!.elementInteractivityScore).toBe(9)
      expect(paxos!.defaultScaffoldStages).toHaveLength(3)

      const [p1, p2, p3] = paxos!.defaultScaffoldStages
      expect(p1.phase).toBe('isolated_elements')
      expect(p2.phase).toBe('pairwise_coupling')
      expect(p3.phase).toBe('systemic_synthesis')

      expect(p1.targetWorkingMemoryChunks).toBeLessThan(p2.targetWorkingMemoryChunks)
      expect(p2.targetWorkingMemoryChunks).toBeLessThan(p3.targetWorkingMemoryChunks)
    })

    it('provides valid benchmark scenarios for AST interpreter and SQL window partitions', () => {
      const ast = CALIBRATED_COGNITIVE_LOAD_SCENARIOS['recursive_ast_interpreter']
      const sql = CALIBRATED_COGNITIVE_LOAD_SCENARIOS['sql_window_partition']
      expect(ast).toBeDefined()
      expect(sql).toBeDefined()
      expect(ast!.defaultScaffoldStages[0].phase).toBe('isolated_elements')
      expect(sql!.defaultScaffoldStages[2].phase).toBe('systemic_synthesis')
    })
  })
})
