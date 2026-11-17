import { describe, expect, it } from 'vitest'
import {
  analyzeMetacognitiveCalibration,
  formatGibbsMarkdown,
  formatFrictionMarkdown,
  generateMetacognitiveActionCard,
} from '../src/journal/metacognition'

describe('Metacognitive Reflection & Calibration Suite', () => {
  it('correctly diagnoses overconfidence and calibration bias', () => {
    // Expected 90%, actual 65% -> 25% bias
    const overconf = analyzeMetacognitiveCalibration(90, 65)
    expect(overconf.biasPct).toBe(25)
    expect(overconf.calibrationZone).toBe('overconfident')
    expect(overconf.diagnosis).toContain('Overconfidence bias')
    expect(overconf.remediationStrategy).toContain('active retrieval')
  })

  it('correctly diagnoses underconfidence bias', () => {
    const underconf = analyzeMetacognitiveCalibration(60, 85)
    expect(underconf.biasPct).toBe(-25)
    expect(underconf.calibrationZone).toBe('underconfident')
    expect(underconf.diagnosis).toContain('Underconfidence bias')
  })

  it('identifies accurate calibration within ±5%', () => {
    const wellCalibrated = analyzeMetacognitiveCalibration(80, 82)
    expect(wellCalibrated.biasPct).toBe(-2)
    expect(wellCalibrated.calibrationZone).toBe('well_calibrated')
  })

  it('formats Gibbs and Friction reflections to clean markdown', () => {
    const gibbsMd = formatGibbsMarkdown({
      description: 'Struggled with dynamic programming problem',
      feelings: 'Felt frustrated by overlapping subproblems',
      evaluation: 'Understood base case, failed state transition',
      analysis: 'Attempted to code before drawing subproblem DAG',
      conclusion: 'Should always draw table on paper first',
      actionPlan: 'Enforce 5-minute pencil-and-paper rule before coding',
    })

    expect(gibbsMd).toContain('### Gibbs Reflective Cycle')
    expect(gibbsMd).toContain('1. Description')
    expect(gibbsMd).toContain('6. Action Plan')

    const frictionMd = formatFrictionMarkdown({
      frictionTrigger: 'Phone notification at 14:00',
      cognitiveBottleneck: 'Context switching penalty',
      emotionalState: 'Mild distraction',
      microIntervention: 'Keep phone in separate room during focus blocks',
      accountabilityAnchor: 'Log session in Learning HUB',
    })

    expect(frictionMd).toContain('### Cognitive Friction Audit')
    expect(frictionMd).toContain('Micro-Intervention')
  })

  it('generates an actionable metacognitive flashcard', () => {
    const card = generateMetacognitiveActionCard('gibbs', {
      keyTakeaway: 'Struggling with multi-step math derivations',
      actionableBehavior: 'Write the goal theorem at top of page and cite intermediate lemmas',
      context: 'Linear Algebra Exam Prep',
    })

    expect(card.domainTag).toBe('metacognition')
    expect(card.sourceFramework).toBe('gibbs')
    expect(card.prompt).toContain('Linear Algebra Exam Prep')
    expect(card.prompt).toContain('Struggling with multi-step math derivations')
    expect(card.solution).toContain('Write the goal theorem')
  })
})
