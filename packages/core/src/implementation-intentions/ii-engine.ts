/**
 * @file ii-engine.ts
 * @description Implementation Intentions & Habit Formation Cognitive Engine
 *
 * Implements three research traditions:
 *
 * 1. Gollwitzer (1999) implementation intentions — "if situation X arises,
 *    then I will perform response Y". By delegating control to an explicit
 *    situational trigger, goal-directed behavior becomes immediate and
 *    automatic. Gollwitzer & Sheeran's (2006) meta-analysis reports a
 *    medium-to-large effect (d ≈ 0.65) on goal attainment.
 *
 * 2. Lally, van Jaarsveld, Potts & Wardle (2009) — habit automaticity
 *    growth follows an asymptotic curve; median time to 95% of asymptote
 *    was 66 days (range 18–254). Missing one opportunity did not materially
 *    disrupt formation; consistency of context matters more than intensity.
 *
 * 3. Oettingen & Gollwitzer (2010) Mental Contrasting with Implementation
 *    Intentions (MCII) — contrasting the desired future with the standing
 *    obstacle, then forming an if-then plan that targets the obstacle,
 *    outperforms either technique alone.
 *
 * All functions are pure and deterministic.
 *
 * References:
 * - Gollwitzer, P. M. (1999). Implementation intentions: Strong effects of
 *   simple plans. American Psychologist, 54(7), 493-503.
 * - Gollwitzer, P., & Sheeran, P. (2006). Implementation intentions and goal
 *   achievement: A meta-analysis. Advances in Experimental Social Psychology,
 *   38, 69-119.
 * - Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W., & Wardle, J. (2009).
 *   How are habits formed. European Journal of Social Psychology, 40(6),
 *   998-1009.
 * - Oettingen, G., & Gollwitzer, P. M. (2010). Strategies of setting and
 *   implementing goals: Mental contrasting and implementation intentions. In
 *   Handbook of Self-Regulation.
 */

import { z } from 'zod'
import {
  AUTOMATICITY_CURVE_DEFAULTS,
  CANONICAL_PLAN_TEMPLATES,
  OBSTACLE_LIBRARY,
  getPlanTemplateById,
  type PlanTemplate,
} from './content'

/* ==========================================================================
 * ZOD SCHEMAS & TYPES
 * ========================================================================== */

/** Trigger kinds, ordered by cue reliability (Gollwitzer 1999). */
export const TriggerKindEnum = z.enum([
  /** "At 7:00 on weekdays" — clock time. */
  'time',
  /** "When I sit at my desk" — place or posture. */
  'place',
  /** "After I finish breakfast" — an event in an existing routine. */
  'event',
  /** "If I feel the urge to skip" — an internal state. */
  'internal_state',
])
export type TriggerKind = z.infer<typeof TriggerKindEnum>

/** One implementation intention: an if-then plan bound to a goal. */
export const IfThenPlanSchema = z.object({
  id: z.string().min(1),
  /** The superordinate goal this plan serves. */
  goal: z.string().min(1),
  /** If-part: the critical situation that will trigger the action. */
  trigger: z.string().min(1),
  triggerKind: TriggerKindEnum,
  /** Then-part: the concrete, operationalized response. */
  action: z.string().min(1),
  /** Optional coping plan for the standing obstacle (MCII). */
  obstacle: z.string().optional(),
  obstacleResponse: z.string().optional(),
})
export type IfThenPlan = z.infer<typeof IfThenPlanSchema>

/** One day of adherence evidence for a plan. */
export const AdherenceDaySchema = z.object({
  /** ISO date (YYYY-MM-DD). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Whether the planned action was performed in the cued context. */
  performed: z.boolean(),
})
export type AdherenceDay = z.infer<typeof AdherenceDaySchema>

/** Rubric scores for one plan, each 0-100 with a rationale. */
export const PlanQualitySchema = z.object({
  /** Is the trigger a detectable, specific critical situation? */
  triggerSpecificity: z.number().min(0).max(100),
  /** Is the action concrete and operationalized (not a vague intention)? */
  actionOperationality: z.number().min(0).max(100),
  /** Is the trigger reliably encountered (good cue opportunities)? */
  cueReliability: z.number().min(0).max(100),
  /** Does a coping plan target the standing obstacle (MCII)? */
  obstacleCoverage: z.number().min(0).max(100),
  /** Weighted composite: Implementation Intention Quality Index. */
  qualityIndex: z.number().min(0).max(100),
  rationales: z.array(z.string()),
})
export type PlanQuality = z.infer<typeof PlanQualitySchema>

/** Automaticity projection for a habit under a given adherence record. */
export const AutomaticityProjectionSchema = z.object({
  /** Current estimated habit strength, 0-100 (as % of asymptote). */
  currentStrength: z.number().min(0).max(100),
  /** Projected days from today to reach 95% of asymptote at current adherence. */
  daysToAutomaticity: z.number().min(0),
  /** The Lally et al. (2009) reference median (66 days). */
  referenceMedianDays: z.number().min(0),
  /** Adherence rate over the observed window, 0-1. */
  adherenceRate: z.number().min(0).max(1),
  /** Current run of consecutive performed days. */
  currentStreak: z.number().int().min(0),
  /** One-line honest caveat about the projection. */
  caveat: z.string(),
})
export type AutomaticityProjection = z.infer<typeof AutomaticityProjectionSchema>

/** One FSRS-6 bridge card. */
export const IICardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  tags: z.array(z.string()),
  sourceRef: z.string().min(1),
})
export type IICard = z.infer<typeof IICardSchema>

/* ==========================================================================
 * RESEARCH CONSTANTS
 * ========================================================================== */

/** Gollwitzer & Sheeran (2006) meta-analytic effect on goal attainment. */
export const II_META_EFFECT_SIZE = 0.65

/** Lally et al. (2009): median days to 95% automaticity asymptote. */
export const LALLY_MEDIAN_DAYS = 66
/** Lally et al. (2009): observed range. */
export const LALLY_RANGE_DAYS = { min: 18, max: 254 } as const

/** Composite weights for the plan quality index. */
export const II_QUALITY_WEIGHTS = {
  triggerSpecificity: 0.35,
  actionOperationality: 0.25,
  cueReliability: 0.2,
  obstacleCoverage: 0.2,
} as const

/* ==========================================================================
 * PLAN QUALITY RUBRIC
 * ========================================================================== */

const VAGUE_ACTION_WORDS = ['try', 'maybe', 'somehow', 'work on', 'think about', 'do better']
const SPECIFIC_ACTION_MARKERS = [
  'open',
  'write',
  'read',
  'solve',
  'walk',
  'run',
  'review',
  'complete',
  'start',
  'close',
  'put',
  'set',
]
const TIME_MARKERS = ['am', 'pm', ':', "o'clock", 'morning', 'evening', 'noon']
const EVENT_MARKERS = ['after', 'before', 'when i', 'once i', 'as soon as']

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

/**
 * Score a plan against the implementation-intention rubric.
 *
 * Trigger specificity and action operationality are lexically estimated
 * (transparent heuristics, rationales returned); cue reliability rewards
 * event/place triggers anchored in existing routines, which Gollwitzer
 * (1999) identifies as the most dependable cues.
 */
export function evaluatePlanQuality(plan: IfThenPlan): PlanQuality {
  const trigger = plan.trigger.toLowerCase()
  const action = plan.action.toLowerCase()
  const rationales: string[] = []

  // Trigger specificity: length + presence of concrete markers.
  let triggerSpecificity = 30
  if (trigger.length >= 15) triggerSpecificity += 20
  if (trigger.length >= 35) triggerSpecificity += 10
  if (TIME_MARKERS.some((m) => trigger.includes(m))) triggerSpecificity += 20
  if (EVENT_MARKERS.some((m) => trigger.includes(m))) triggerSpecificity += 20
  triggerSpecificity = clamp100(triggerSpecificity)
  rationales.push(
    triggerSpecificity >= 70
      ? 'Trigger names a detectable critical situation.'
      : 'Trigger is vague; specify when/where/after-what it fires.',
  )

  // Action operationality: penalize vague verbs, reward concrete ones.
  let actionOperationality = 50
  if (VAGUE_ACTION_WORDS.some((m) => action.includes(m))) actionOperationality -= 30
  if (SPECIFIC_ACTION_MARKERS.some((m) => action.includes(m))) actionOperationality += 30
  if (action.length >= 20) actionOperationality += 10
  actionOperationality = clamp100(actionOperationality)
  rationales.push(
    actionOperationality >= 70
      ? 'Action is concrete and executable as-is.'
      : 'Action is vague; replace intentions like "try" with a physical first step.',
  )

  // Cue reliability by trigger kind.
  const reliabilityByKind: Record<TriggerKind, number> = {
    event: 85,
    place: 75,
    time: 65,
    internal_state: 40,
  }
  const cueReliability = reliabilityByKind[plan.triggerKind]
  rationales.push(
    plan.triggerKind === 'event'
      ? 'Event triggers piggyback on existing routines — the most reliable cues.'
      : plan.triggerKind === 'internal_state'
        ? 'Internal-state triggers are easy to miss; prefer an external event or place.'
        : 'Cue reliability is moderate; anchoring to an existing routine strengthens it.',
  )

  // Obstacle coverage (MCII).
  const obstacleCoverage = plan.obstacle && plan.obstacleResponse ? 90 : plan.obstacle ? 50 : 15
  rationales.push(
    obstacleCoverage >= 80
      ? 'Coping plan targets the standing obstacle (full MCII).'
      : 'Add mental contrasting: name the standing obstacle and plan the response.',
  )

  const qualityIndex = clamp100(
    II_QUALITY_WEIGHTS.triggerSpecificity * triggerSpecificity +
      II_QUALITY_WEIGHTS.actionOperationality * actionOperationality +
      II_QUALITY_WEIGHTS.cueReliability * cueReliability +
      II_QUALITY_WEIGHTS.obstacleCoverage * obstacleCoverage,
  )

  return {
    triggerSpecificity,
    actionOperationality,
    cueReliability,
    obstacleCoverage,
    qualityIndex,
    rationales,
  }
}

/* ==========================================================================
 * AUTOMATICITY PROJECTION (LALLY ET AL. 2009)
 * ========================================================================== */

/**
 * Project habit automaticity from an adherence record.
 *
 * Model: strength grows asymptotically toward 100 with a per-day gain
 * scaled by performed days. The daily gain constant is calibrated so a
 * perfectly adherent record reaches 95% at the Lally median (66 days);
 * missed days simply forgo that day's gain, encoding Lally's finding that
 * one missed opportunity did not materially disrupt formation. Complex or
 * aversive behaviors form slower — the template's `complexityFactor`
 * (>1 = slower) scales the curve, keeping projections inside the reported
 * 18–254 day range.
 */
export function projectAutomaticity(
  days: AdherenceDay[],
  complexityFactor = 1,
): AutomaticityProjection {
  const { asymptote } = AUTOMATICITY_CURVE_DEFAULTS
  // k chosen so that perfect adherence hits 95% at LALLY_MEDIAN_DAYS:
  // 95 = 100 * (1 - e^{-k*66})  =>  k = -ln(0.05)/66
  const baseK = -Math.log(1 - 0.95) / LALLY_MEDIAN_DAYS
  const k = baseK / Math.max(0.25, complexityFactor)

  let performed = 0
  for (const d of days) if (d.performed) performed += 1
  const adherenceRate = days.length === 0 ? 0 : performed / days.length

  const currentStrength = Math.min(100, asymptote * (1 - Math.exp(-k * performed)))

  // Remaining performed-days needed to reach 95% of asymptote:
  const targetStrength = 0.95 * asymptote
  const neededPerformedDays =
    currentStrength >= targetStrength
      ? 0
      : Math.ceil(-Math.log(1 - targetStrength / asymptote) / k) - performed
  // Convert needed performed days into calendar days at current adherence.
  const effectiveRate = Math.max(0.05, adherenceRate || 0.5)
  const daysToAutomaticity = Math.max(0, Math.ceil(neededPerformedDays / effectiveRate))

  let currentStreak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].performed) currentStreak += 1
    else break
  }

  return {
    currentStrength: Math.round(currentStrength * 10) / 10,
    daysToAutomaticity,
    referenceMedianDays: LALLY_MEDIAN_DAYS,
    adherenceRate: Math.round(adherenceRate * 100) / 100,
    currentStreak,
    caveat:
      'Projection calibrated to Lally et al. (2009) medians; individual habits ' +
      'varied 18–254 days. Context consistency matters more than streaks.',
  }
}

/* ==========================================================================
 * TEMPLATE & OBSTACLE ACCESS
 * ========================================================================== */

/** All canonical plan templates. */
export function getCanonicalPlanTemplates(): readonly PlanTemplate[] {
  return CANONICAL_PLAN_TEMPLATES
}

export { getPlanTemplateById, OBSTACLE_LIBRARY }

/**
 * Instantiate a template into a draft plan. The learner's own words should
 * replace the bracketed slots; the returned plan is a scaffold, not a
 * finished intention.
 */
export function instantiateTemplate(templateId: string, goal: string): IfThenPlan {
  const template = getPlanTemplateById(templateId)
  if (!template) throw new Error(`Unknown plan template: ${templateId}`)
  return IfThenPlanSchema.parse({
    id: `plan-${templateId}`,
    goal,
    trigger: template.triggerFrame,
    triggerKind: template.triggerKind,
    action: template.actionFrame,
    obstacle: template.commonObstacle,
    obstacleResponse: template.obstacleResponseFrame,
  })
}

/* ==========================================================================
 * FSRS-6 BRIDGE
 * ========================================================================== */

/**
 * Generate FSRS-6 cards teaching plan anatomy: one card per template
 * (reconstruct the if-then structure for a goal) plus one card per obstacle
 * in the library (name the MCII coping response pattern).
 */
export function generateIIFSRSCards(templateIds?: string[]): IICard[] {
  const templates = templateIds
    ? templateIds
        .map((id) => getPlanTemplateById(id))
        .filter((t): t is PlanTemplate => t !== undefined)
    : [...CANONICAL_PLAN_TEMPLATES]

  const cards: IICard[] = []
  for (const t of templates) {
    cards.push({
      front: `You want to build this habit: ${t.habitName}. Write an if-then plan (trigger → action) and name its weakest part to check first.`,
      back: `Trigger (${t.triggerKind}): ${t.triggerFrame}\nAction: ${t.actionFrame}\nObstacle: ${t.commonObstacle}\nCoping: ${t.obstacleResponseFrame}`,
      tags: ['implementation-intentions', t.domain, 'plan-anatomy'],
      sourceRef: `ii-template:${t.id}`,
    })
  }
  for (const o of OBSTACLE_LIBRARY) {
    cards.push({
      front: `MCII drill: your goal is blocked by "${o.obstacle}". What does the obstacle-targeting if-then response look like?`,
      back: `${o.responsePattern}\nWhy: mental contrasting + implementation intention (Oettingen & Gollwitzer 2010).`,
      tags: ['implementation-intentions', 'obstacle', o.category],
      sourceRef: `ii-obstacle:${o.id}`,
    })
  }
  return cards
}
