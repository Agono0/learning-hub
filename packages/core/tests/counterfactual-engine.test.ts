import { describe, it, expect } from 'vitest'
import {
  createStandardEducationSCM,
  getTopologicalSort,
  getParents,
  getChildren,
  getDescendants,
  classifySegment,
  isPathBlocked,
  checkDSeparation,
  evaluateBackdoorAdmissibility,
  mutilateGraph,
  simulateIntervention,
  evaluateCounterfactual,
  getStandardDiagnosticProblems,
  evaluateDiagnosticResponses,
  bridgeCausalToCurriculum,
} from '../src/causal/counterfactual-engine'

describe('Structural Causal Modeling & Counterfactual Simulator Engine', () => {
  it('correctly constructs SCM and derives topological ordering', () => {
    const scm = createStandardEducationSCM()
    expect(scm.id).toBe('edu_exam_causality')
    expect(Object.keys(scm.variables).length).toBe(6)

    const order = getTopologicalSort(scm)
    expect(order).toContain('Aptitude')
    expect(order).toContain('ExamScore')

    // Aptitude must precede StudyTechnique and ExamScore
    const aptIdx = order.indexOf('Aptitude')
    const techIdx = order.indexOf('StudyTechnique')
    const examIdx = order.indexOf('ExamScore')
    expect(aptIdx).toBeLessThan(techIdx)
    expect(techIdx).toBeLessThan(examIdx)

    // Check parents and children
    const examParents = getParents(scm, 'ExamScore')
    expect(examParents).toContain('Aptitude')
    expect(examParents).toContain('StudyTechnique')
    expect(examParents).toContain('StudyHours')
    expect(examParents).toContain('WorkingMemoryStrain')

    const aptChildren = getChildren(scm, 'Aptitude')
    expect(aptChildren).toContain('StudyTechnique')
    expect(aptChildren).toContain('ExamScore')

    const aptDescendants = getDescendants(scm, 'Aptitude')
    expect(aptDescendants.has('StudyTechnique')).toBe(true)
    expect(aptDescendants.has('ExamScore')).toBe(true)
  })

  it('classifies path segments and validates d-separation on chains, forks, and colliders', () => {
    const scm = createStandardEducationSCM()

    // 1. Chain: Aptitude -> StudyTechnique -> ExamScore
    const chainType = classifySegment(scm, 'Aptitude', 'StudyTechnique', 'ExamScore')
    expect(chainType).toBe('chain')

    // Conditioning on intermediate node in chain blocks the path
    const chainBlocked = isPathBlocked(
      scm,
      ['Aptitude', 'StudyTechnique', 'ExamScore'],
      new Set(['StudyTechnique']),
    )
    expect(chainBlocked.isBlocked).toBe(true)

    // 2. Collider: StudyHours -> WorkingMemoryStrain <- SleepRest
    const colliderType = classifySegment(scm, 'StudyHours', 'WorkingMemoryStrain', 'SleepRest')
    expect(colliderType).toBe('collider')

    // Unconditioned collider blocks path
    const colliderUnconditioned = isPathBlocked(
      scm,
      ['StudyHours', 'WorkingMemoryStrain', 'SleepRest'],
      new Set(),
    )
    expect(colliderUnconditioned.isBlocked).toBe(true)

    // Conditioning on collider OPENS path (Berkson bias / collider stratification)
    const colliderConditioned = isPathBlocked(
      scm,
      ['StudyHours', 'WorkingMemoryStrain', 'SleepRest'],
      new Set(['WorkingMemoryStrain']),
    )
    expect(colliderConditioned.isBlocked).toBe(false)

    // Check full d-separation analysis
    const dsep = checkDSeparation(scm, 'StudyTechnique', 'ExamScore', ['Aptitude'])
    expect(dsep.paths.length).toBeGreaterThan(0)
  })

  it('evaluates backdoor criterion admissibility correctly', () => {
    const scm = createStandardEducationSCM()

    // Estimating causal effect of StudyTechnique on ExamScore:
    // Backdoor path: StudyTechnique <- Aptitude -> ExamScore
    // Candidate Z = ['Aptitude'] should be admissible!
    const admissible = evaluateBackdoorAdmissibility(scm, 'StudyTechnique', 'ExamScore', [
      'Aptitude',
    ])
    expect(admissible.isAdmissible).toBe(true)
    expect(admissible.violations.length).toBe(0)

    // Conditioning on nothing leaves backdoor path open
    const unconditioned = evaluateBackdoorAdmissibility(scm, 'StudyTechnique', 'ExamScore', [])
    expect(unconditioned.isAdmissible).toBe(false)
    expect(unconditioned.violations.some((v) => v.includes('remains open'))).toBe(true)

    // Conditioning on descendant of treatment violates condition 1
    // (ExamScore is descendant of StudyTechnique)
    const invalidDescendant = evaluateBackdoorAdmissibility(scm, 'StudyTechnique', 'ExamScore', [
      'Aptitude',
      'ExamScore',
    ])
    expect(invalidDescendant.isAdmissible).toBe(false)
    expect(invalidDescendant.violations.some((v) => v.includes('descendant'))).toBe(true)
  })

  it('performs Level 2 graph surgery and intervention forward simulation', () => {
    const scm = createStandardEducationSCM()

    // Intervene do(StudyTechnique = 90)
    const { mutilatedModel, removedEdges } = mutilateGraph(scm, ['StudyTechnique'])
    expect(removedEdges.some((e) => e.toId === 'StudyTechnique')).toBe(true)
    expect(mutilatedModel.edges.some((e) => e.toId === 'StudyTechnique')).toBe(false)

    // Run interventional forward simulation
    const normalRun = simulateIntervention(scm, {})
    const intervenedRun = simulateIntervention(scm, { StudyTechnique: 90 })

    expect(intervenedRun.StudyTechnique).toBe(90)
    expect(intervenedRun.ExamScore).toBeGreaterThan(normalRun.ExamScore)
  })

  it('executes Level 3 Pearl 3-step counterfactual algorithm (Abduction-Action-Prediction)', () => {
    const scm = createStandardEducationSCM()

    // Factual observation: Student with Aptitude 50, StudyHours 5, SleepRest 50, scored 52.8
    const query = {
      modelId: scm.id,
      evidence: {
        Aptitude: 50,
        StudyHours: 5,
        SleepRest: 50,
        ExamScore: 50,
      },
      interventions: {
        StudyHours: 20, // hypothetical counterfactual action
        SleepRest: 85,
      },
      targetVariableId: 'ExamScore',
    }

    const cfResult = evaluateCounterfactual(scm, query)

    expect(cfResult.targetVariableId).toBe('ExamScore')
    expect(cfResult.factualValue).toBe(50)
    expect(cfResult.counterfactualValue).toBeGreaterThan(cfResult.factualValue)
    expect(cfResult.causalLift).toBeGreaterThan(0)
    expect(cfResult.exogenousStates.Aptitude).toBeDefined()
    expect(cfResult.narrativeExplanation).toContain('Factual baseline')
    expect(cfResult.narrativeExplanation).toContain('counterfactual condition')
  })

  it('evaluates diagnostic problems and bridges to curriculum transfer', () => {
    const problems = getStandardDiagnosticProblems()
    expect(problems.length).toBe(3)

    // Submit correct answers
    const assessment = evaluateDiagnosticResponses({
      p1_confounding_aptitude: 'opt1_correct',
      p2_collider_fatigue: 'opt2_correct',
      p3_counterfactual_abduction: 'opt3_correct',
    })

    expect(assessment.overallMasteryScore).toBe(100)
    expect(assessment.ladderLevelAchieved).toBe('L3_COUNTERFACTUAL')
    expect(assessment.diagnosedMisconceptions.length).toBe(0)

    // Bridge to curriculum
    const bridge = bridgeCausalToCurriculum(
      0.75,
      assessment.overallMasteryScore,
      'L3_COUNTERFACTUAL',
    )
    expect(bridge.originalMastery).toBe(0.75)
    expect(bridge.transferMultiplier).toBeGreaterThan(1.0)
    expect(bridge.modulatedMastery).toBeGreaterThan(0.75)
  })
})
