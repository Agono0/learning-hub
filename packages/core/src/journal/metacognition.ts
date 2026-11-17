/**
 * Metacognitive Reflection & Retrospective Domain Logic.
 *
 * Grounded in learning science and cognitive metacognition:
 * 1. Gibbs Reflective Cycle (Gibbs 1988) — structured experiential learning.
 * 2. Metacognitive Monitoring and Judgment of Learning (JOL) calibration
 *    (Flavell 1979; Dunlosky & Rawson 2012; Rhodes 2016).
 * 3. The Illusion of Explanatory Depth and Overconfidence Bias (Rozenblit & Keil 2002).
 * 4. Implementation Intentions & Friction Reduction (Gollwitzer 1999).
 */

export type MetacognitiveFramework = 'gibbs' | 'friction_audit' | 'exam_retro'

export interface GibbsReflectionSteps {
  description: string // What happened?
  feelings: string // What were you thinking & feeling?
  evaluation: string // What was good and bad about the experience?
  analysis: string // What sense can you make of the situation?
  conclusion: string // What else could you have done?
  actionPlan: string // If it arose again, what would you do?
}

export interface FrictionAuditSteps {
  frictionTrigger: string // Where did focus or motivation collapse?
  cognitiveBottleneck: string // Working memory overload, ambiguity, or fatigue?
  emotionalState: string // Anxiety, boredom, or frustration?
  microIntervention: string // 2-minute friction reduction rule
  accountabilityAnchor: string // Habit stack or environment modification
}

export interface ExamRetroSteps {
  examTitle: string
  predictedScorePct: number // 0-100
  actualScorePct: number // 0-100
  spacingEffectiveness: string // Did reviews adhere to optimal intervals?
  surprisesAndBlindspots: string // What did you mistakenly think you understood?
  futurePreparationAdjustment: string // What concrete changes will you make?
}

export interface MetacognitiveCalibrationResult {
  predictedScorePct: number
  actualScorePct: number
  biasPct: number // predicted - actual
  calibrationZone: 'well_calibrated' | 'overconfident' | 'underconfident'
  diagnosis: string
  remediationStrategy: string
}

export interface MetacognitiveActionCard {
  prompt: string
  solution: string
  sourceFramework: MetacognitiveFramework
  domainTag: string
}

/**
 * Evaluates metacognitive calibration (Judgment of Learning vs Actual Performance).
 * Identifies overconfidence (Dunning-Kruger/Illusion of competence) vs underconfidence (imposter effect).
 */
export function analyzeMetacognitiveCalibration(
  predictedScorePct: number,
  actualScorePct: number,
): MetacognitiveCalibrationResult {
  const pred = Math.max(0, Math.min(100, Math.round(predictedScorePct)))
  const act = Math.max(0, Math.min(100, Math.round(actualScorePct)))
  const bias = pred - act

  let calibrationZone: MetacognitiveCalibrationResult['calibrationZone'] = 'well_calibrated'
  let diagnosis = 'Accurate metacognitive calibration (within ±5% margin of error).'
  let remediationStrategy =
    'Your internal mental model matches reality. Maintain current self-testing heuristics.'

  if (bias > 5) {
    calibrationZone = 'overconfident'
    diagnosis = `Overconfidence bias (+${bias}% gap). You expected ${pred}% but scored ${act}%. Susceptible to the Illusion of Explanatory Depth (Rozenblit & Keil 2002).`
    remediationStrategy =
      'Shift from passive recognition to closed-book active retrieval and Feynman explanations before declaring mastery.'
  } else if (bias < -5) {
    calibrationZone = 'underconfident'
    diagnosis = `Underconfidence bias (${bias}% gap). You expected ${pred}% but performed substantially higher (${act}%).`
    remediationStrategy =
      'Your competence exceeds your subjective confidence. Increase problem difficulty to stimulate engagement.'
  }

  return {
    predictedScorePct: pred,
    actualScorePct: act,
    biasPct: bias,
    calibrationZone,
    diagnosis,
    remediationStrategy,
  }
}

/**
 * Formats Gibbs Reflective Cycle into structured markdown.
 */
export function formatGibbsMarkdown(steps: GibbsReflectionSteps): string {
  return [
    '### Gibbs Reflective Cycle',
    `- **1. Description**: ${steps.description.trim() || 'N/A'}`,
    `- **2. Feelings**: ${steps.feelings.trim() || 'N/A'}`,
    `- **3. Evaluation**: ${steps.evaluation.trim() || 'N/A'}`,
    `- **4. Analysis**: ${steps.analysis.trim() || 'N/A'}`,
    `- **5. Conclusion**: ${steps.conclusion.trim() || 'N/A'}`,
    `- **6. Action Plan**: ${steps.actionPlan.trim() || 'N/A'}`,
  ].join('\n')
}

/**
 * Formats Friction Audit into structured markdown.
 */
export function formatFrictionMarkdown(steps: FrictionAuditSteps): string {
  return [
    '### Cognitive Friction Audit',
    `- **Trigger Point**: ${steps.frictionTrigger.trim() || 'N/A'}`,
    `- **Cognitive Bottleneck**: ${steps.cognitiveBottleneck.trim() || 'N/A'}`,
    `- **Emotional State**: ${steps.emotionalState.trim() || 'N/A'}`,
    `- **Micro-Intervention**: ${steps.microIntervention.trim() || 'N/A'}`,
    `- **Accountability Anchor**: ${steps.accountabilityAnchor.trim() || 'N/A'}`,
  ].join('\n')
}

/**
 * Generates an active recall flashcard from a reflection takeaway.
 */
export function generateMetacognitiveActionCard(
  framework: MetacognitiveFramework,
  input: { keyTakeaway: string; actionableBehavior: string; context?: string },
): MetacognitiveActionCard {
  const contextPrefix = input.context ? `[Context: ${input.context}] ` : ''
  const prompt = `${contextPrefix}When facing situations like "${input.keyTakeaway}", what is my committed action rule?`
  const solution = input.actionableBehavior

  return {
    prompt,
    solution,
    sourceFramework: framework,
    domainTag: 'metacognition',
  }
}
