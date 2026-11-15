import { z } from 'zod'

/**
 * Flow State & Ultradian Rhythm Engine.
 *
 * Grounded in:
 * - Mihaly Csikszentmihalyi (1990): Flow — The Psychology of Optimal Experience.
 *   The channel of flow requires balancing perceived challenge with learner skill.
 * - Nathaniel Kleitman (1982): Basic Rest-Activity Cycle (BRAC).
 *   Human attentional capacity operates in ~90-minute ultradian peaks followed
 *   by 15–20 minute restorative phases.
 * - Sweller (1988): Cognitive Load Theory (intrinsic vs extraneous load).
 */

export const flowZoneSchema = z.enum(['flow', 'boredom', 'anxiety', 'fatigue'])
export type FlowZone = z.infer<typeof flowZoneSchema>

export const sessionTelemetrySchema = z.object({
  accuracy: z.number().min(0).max(1),
  averageLatencyMs: z.number().positive(),
  expectedLatencyMs: z.number().positive().default(3000),
  cardsAnswered: z.number().int().nonnegative(),
  elapsedFocusMinutes: z.number().nonnegative(),
  subjectiveStrain: z.number().min(1).max(5).optional(),
})

export type SessionTelemetry = z.infer<typeof sessionTelemetrySchema>

export const flowStateEvaluationSchema = z.object({
  zone: flowZoneSchema,
  flowScore: z.number().min(0).max(100),
  challengeSkillRatio: z.number().positive(),
  ultradianPhase: z.enum(['peak_focus', 'sustained_effort', 'restorative_break_due']),
  remainingFocusMinutes: z.number().nonnegative(),
  recommendation: z.string(),
  suggestedAction: z.enum(['continue', 'increase_difficulty', 'ease_difficulty', 'take_rest']),
})

export type FlowStateEvaluation = z.infer<typeof flowStateEvaluationSchema>

/**
 * Standard 90-minute ultradian focus block (Kleitman BRAC).
 */
export const ULTRADIAN_BLOCK_MINUTES = 90

/**
 * Evaluates current cognitive flow state and ultradian alertness from session telemetry.
 */
export function evaluateFlowState(telemetry: SessionTelemetry): FlowStateEvaluation {
  const {
    accuracy,
    averageLatencyMs,
    expectedLatencyMs,
    elapsedFocusMinutes,
    subjectiveStrain = 3,
  } = telemetry

  // Challenge vs Skill Ratio
  // Accuracy < 0.70 indicates challenge > skill.
  // Accuracy > 0.92 indicates skill > challenge.
  const latencyRatio = averageLatencyMs / Math.max(500, expectedLatencyMs)
  const challengeScore = (1 - accuracy) * 60 + (latencyRatio - 1) * 20 + subjectiveStrain * 4
  const skillScore = accuracy * 80 - Math.max(0, latencyRatio - 1) * 15

  const challengeSkillRatio = Math.max(0.1, challengeScore / Math.max(1, skillScore))

  // Ultradian phase calculation
  let ultradianPhase: 'peak_focus' | 'sustained_effort' | 'restorative_break_due'
  let remainingFocusMinutes: number

  if (elapsedFocusMinutes < 45) {
    ultradianPhase = 'peak_focus'
    remainingFocusMinutes = Math.max(0, ULTRADIAN_BLOCK_MINUTES - elapsedFocusMinutes)
  } else if (elapsedFocusMinutes < 80) {
    ultradianPhase = 'sustained_effort'
    remainingFocusMinutes = Math.max(0, ULTRADIAN_BLOCK_MINUTES - elapsedFocusMinutes)
  } else {
    ultradianPhase = 'restorative_break_due'
    remainingFocusMinutes = 0
  }

  // Zone determination
  let zone: FlowZone
  let recommendation: string
  let suggestedAction: 'continue' | 'increase_difficulty' | 'ease_difficulty' | 'take_rest'

  if (elapsedFocusMinutes >= 85 || (elapsedFocusMinutes >= 60 && accuracy < 0.65)) {
    zone = 'fatigue'
    recommendation =
      'Ultradian limit approached. Working memory capacity is saturating; a 15-minute rest will consolidate learning.'
    suggestedAction = 'take_rest'
  } else if (accuracy < 0.7 || (accuracy < 0.75 && latencyRatio > 1.4)) {
    zone = 'anxiety'
    recommendation =
      'Challenge is currently outpacing retrieval confidence. Step down drill speed or review foundational flashcards.'
    suggestedAction = 'ease_difficulty'
  } else if (accuracy > 0.94 && latencyRatio < 0.8) {
    zone = 'boredom'
    recommendation =
      'High accuracy and rapid recall indicate mastery. Ramp up difficulty tier, activate speed drill, or test recall synthesis.'
    suggestedAction = 'increase_difficulty'
  } else {
    zone = 'flow'
    recommendation =
      'Optimal challenge-skill equilibrium detected. Cognitive engagement is in high-retention flow.'
    suggestedAction = 'continue'
  }

  // Calculate normalized 0-100 flow score
  let flowScore = 85
  if (zone === 'flow') {
    flowScore = Math.round(85 + (1 - Math.abs(accuracy - 0.85) / 0.15) * 15)
  } else if (zone === 'boredom') {
    flowScore = Math.round(50 + accuracy * 20)
  } else if (zone === 'anxiety') {
    flowScore = Math.max(10, Math.round(accuracy * 60))
  } else {
    flowScore = Math.max(5, Math.round(40 - (elapsedFocusMinutes - 80)))
  }

  return {
    zone,
    flowScore: Math.min(100, Math.max(0, flowScore)),
    challengeSkillRatio: Math.round(challengeSkillRatio * 100) / 100,
    ultradianPhase,
    remainingFocusMinutes: Math.round(remainingFocusMinutes),
    recommendation,
    suggestedAction,
  }
}
