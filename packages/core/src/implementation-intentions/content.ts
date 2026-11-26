/**
 * @file content.ts
 * @description Canonical content bank for the Implementation Intentions &
 * Habit Formation Studio: plan templates across life domains, an obstacle
 * library for MCII coping planning, and the automaticity curve defaults
 * calibrated to Lally et al. (2009).
 */

import { z } from 'zod'
import type { TriggerKind } from './ii-engine'

/* ==========================================================================
 * PLAN TEMPLATES
 * ========================================================================== */

/** A canonical if-then plan template with MCII scaffolding. */
export interface PlanTemplate {
  id: string
  domain: string
  habitName: string
  triggerKind: TriggerKind
  /** If-part frame; [brackets] mark slots the learner fills. */
  triggerFrame: string
  /** Then-part frame. */
  actionFrame: string
  /** The standing obstacle this habit most often dies on. */
  commonObstacle: string
  /** Coping response frame for the obstacle. */
  obstacleResponseFrame: string
  /** >1 slows the automaticity curve (complex/aversive behaviors). */
  complexityFactor: number
}

export const CANONICAL_PLAN_TEMPLATES: readonly PlanTemplate[] = [
  {
    id: 'ii-study-spaced-review',
    domain: 'study',
    habitName: 'Daily spaced-repetition review',
    triggerKind: 'event',
    triggerFrame: 'After I finish [breakfast / my morning coffee] at [place]',
    actionFrame: 'I open the review queue and complete my due cards before anything else',
    commonObstacle: 'Phone notifications pull attention before the first card',
    obstacleResponseFrame:
      'If a notification appears, then I note it on paper and return to the current card',
    complexityFactor: 1,
  },
  {
    id: 'ii-study-deep-work',
    domain: 'study',
    habitName: 'Daily deep-work block',
    triggerKind: 'time',
    triggerFrame: 'At [time] on [days], when my calendar block starts',
    actionFrame:
      'I close all messaging apps, set a 50-minute timer, and work on [the current project]',
    commonObstacle: 'The urge to check messages in the first ten minutes',
    obstacleResponseFrame:
      'If the urge to check appears, then I write down what I wanted to check and keep working',
    complexityFactor: 1.3,
  },
  {
    id: 'ii-exercise-morning',
    domain: 'exercise',
    habitName: 'Morning exercise',
    triggerKind: 'event',
    triggerFrame: 'After I get out of bed and put my feet on the floor',
    actionFrame:
      'I put on the training clothes laid out the night before and start the planned session',
    commonObstacle: 'Feeling tired and negotiating with myself to skip',
    obstacleResponseFrame:
      'If I want to skip, then I do just the first two minutes — starting is the plan, not finishing',
    complexityFactor: 1.4,
  },
  {
    id: 'ii-reading-evening',
    domain: 'reading',
    habitName: 'Evening reading',
    triggerKind: 'event',
    triggerFrame: 'After I sit on [the sofa / my bed] after dinner',
    actionFrame: 'I pick up the book on the pillow and read one chapter before any screen',
    commonObstacle: 'The phone is closer than the book',
    obstacleResponseFrame:
      'If I reach for the phone, then I place it in another room and pick up the book',
    complexityFactor: 1,
  },
  {
    id: 'ii-sleep-winddown',
    domain: 'sleep',
    habitName: 'Consistent sleep wind-down',
    triggerKind: 'time',
    triggerFrame: 'At [wind-down time] each night',
    actionFrame:
      'I dim the lights, set the phone to charge outside the bedroom, and start the wind-down routine',
    commonObstacle: 'One more video turns into an hour',
    obstacleResponseFrame:
      'If I am still watching at wind-down time, then I finish the current video only and start the routine',
    complexityFactor: 1.2,
  },
  {
    id: 'ii-focus-distraction',
    domain: 'focus',
    habitName: 'Distraction capture during focus sessions',
    triggerKind: 'internal_state',
    triggerFrame: 'If I notice the urge to open a distracting site or app during a focus session',
    actionFrame:
      'I write the distraction on the capture card and return to the task for five more minutes',
    commonObstacle: 'The urge feels urgent and rational in the moment',
    obstacleResponseFrame:
      'If the urge persists after five minutes, then the session ends by plan — not by drift',
    complexityFactor: 1.1,
  },
  {
    id: 'ii-language-commute',
    domain: 'language',
    habitName: 'Commute language listening',
    triggerKind: 'event',
    triggerFrame: 'When I [board the train / start the car] for my commute',
    actionFrame: 'I press play on the current lesson playlist before any music or podcast',
    commonObstacle: 'Defaulting to entertainment audio out of habit',
    obstacleResponseFrame:
      'If I open a music app, then I switch to the lesson playlist for the first ten minutes',
    complexityFactor: 0.9,
  },
  {
    id: 'ii-notes-capture',
    domain: 'knowledge',
    habitName: 'Same-day note processing',
    triggerKind: 'event',
    triggerFrame: 'After my last meeting or lecture of the day',
    actionFrame:
      'I spend ten minutes converting today’s raw notes into permanent notes in my own words',
    commonObstacle: 'End-of-day tiredness makes postponing easy',
    obstacleResponseFrame:
      'If I am too tired for ten minutes, then I process exactly one note — the most important one',
    complexityFactor: 1.2,
  },
  {
    id: 'ii-math-daily-problem',
    domain: 'study',
    habitName: 'One hard problem a day',
    triggerKind: 'event',
    triggerFrame: 'After I open my textbook or course page for the day',
    actionFrame:
      'I attempt today’s hardest problem for fifteen minutes before reading any solution',
    commonObstacle: 'The pull to read the solution when stuck',
    obstacleResponseFrame:
      'If I feel stuck at minute five, then I write down exactly where I am stuck and try one more representation',
    complexityFactor: 1.5,
  },
  {
    id: 'ii-meditation-anchor',
    domain: 'wellbeing',
    habitName: 'Brief daily meditation',
    triggerKind: 'place',
    triggerFrame: 'When I sit down at [my desk / the kitchen table] for the first time each day',
    actionFrame: 'I set a five-minute timer and follow the breath before opening any device',
    commonObstacle: 'Opening the laptop first out of reflex',
    obstacleResponseFrame:
      'If I have already opened a device, then I close it, meditate, and only then reopen it',
    complexityFactor: 0.8,
  },
  {
    id: 'ii-coding-daily-practice',
    domain: 'study',
    habitName: 'Daily coding practice',
    triggerKind: 'event',
    triggerFrame: 'After I close [my last class / work task] of the day',
    actionFrame: 'I open my practice repo and solve one small problem before any entertainment',
    commonObstacle: 'The blank-editor stall: not knowing what to work on',
    obstacleResponseFrame:
      'If I stall choosing a problem, then I pick the top item of my pre-made problem list and start a ten-minute timer',
    complexityFactor: 1.4,
  },
  {
    id: 'ii-writing-morning-pages',
    domain: 'study',
    habitName: 'Daily writing session',
    triggerKind: 'time',
    triggerFrame: 'At [time], immediately after I sit down with [my morning drink]',
    actionFrame: 'I write three hundred words on [current project] before opening any inbox',
    commonObstacle: 'Editing the first paragraph instead of moving forward',
    obstacleResponseFrame:
      'If I catch myself re-reading to edit, then I move to the end of the document and write the next sentence',
    complexityFactor: 1.5,
  },
  {
    id: 'ii-exercise-gym-anchor',
    domain: 'health',
    habitName: 'Gym session after work',
    triggerKind: 'event',
    triggerFrame: 'When I leave [work / my last lecture] on [days]',
    actionFrame: 'I walk directly to the gym and start my warm-up before going home',
    commonObstacle: 'Going home first and never leaving again',
    obstacleResponseFrame:
      'If I find myself heading home, then I redirect at the next corner and do at least the warm-up',
    complexityFactor: 1.6,
  },
  {
    id: 'ii-diet-meal-prep',
    domain: 'health',
    habitName: 'Weekly meal preparation',
    triggerKind: 'time',
    triggerFrame: 'At [time] on [day], when I finish [lunch / my last morning task]',
    actionFrame: 'I take out the containers and cook the two staple dishes for the week',
    commonObstacle: 'The session feels too large to start',
    obstacleResponseFrame:
      'If the task feels too big, then I commit to only washing and chopping the vegetables first',
    complexityFactor: 1.7,
  },
  {
    id: 'ii-language-shadowing',
    domain: 'study',
    habitName: 'Daily language shadowing',
    triggerKind: 'event',
    triggerFrame: 'When I plug in my headphones for [my commute / my walk]',
    actionFrame: 'I play one lesson audio and shadow each sentence aloud',
    commonObstacle: 'Switching to music when shadowing feels effortful',
    obstacleResponseFrame:
      'If I reach for music, then I finish the current lesson first and earn the music after',
    complexityFactor: 1.2,
  },
  {
    id: 'ii-instrument-scales',
    domain: 'study',
    habitName: 'Daily instrument practice',
    triggerKind: 'place',
    triggerFrame: 'When I enter [the practice room / my room] after [dinner / school]',
    actionFrame: 'I play one slow scale set before any pieces or songs',
    commonObstacle: 'Skipping the fundamentals to play fun pieces',
    obstacleResponseFrame:
      'If I start a piece first, then I stop after one minute, do the scales, and return to the piece',
    complexityFactor: 1.3,
  },
  {
    id: 'ii-exam-past-paper',
    domain: 'study',
    habitName: 'Weekly past-paper block',
    triggerKind: 'time',
    triggerFrame: 'At [time] every [day], when my exam-prep block begins',
    actionFrame: 'I attempt one timed past-paper section before reviewing any notes',
    commonObstacle: 'Re-reading notes feels safer than testing myself',
    obstacleResponseFrame:
      'If I reach for notes first, then I set them aside and answer just the first question before deciding anything else',
    complexityFactor: 1.5,
  },
  {
    id: 'ii-sleep-consistent-wake',
    domain: 'health',
    habitName: 'Consistent wake time',
    triggerKind: 'time',
    triggerFrame: 'When my [time] alarm rings, on weekdays and weekends alike',
    actionFrame: 'I put both feet on the floor and open the curtains before checking my phone',
    commonObstacle: 'Snoozing through the first alarm',
    obstacleResponseFrame:
      'If I reach for snooze, then I sit up and count down from five before deciding',
    complexityFactor: 1.4,
  },
  {
    id: 'ii-mindful-commute-walk',
    domain: 'wellbeing',
    habitName: 'Daily walking break',
    triggerKind: 'event',
    triggerFrame: 'After [lunch / my midday meal], when I put down my fork',
    actionFrame: 'I take a ten-minute walk outside without my phone',
    commonObstacle: 'Desk gravity: staying seated to finish one more thing',
    obstacleResponseFrame:
      'If I catch myself saying one more thing, then I stand up mid-thought and leave it written on a sticky note',
    complexityFactor: 0.9,
  },
  {
    id: 'ii-finance-expense-log',
    domain: 'health',
    habitName: 'Same-day expense logging',
    triggerKind: 'event',
    triggerFrame: 'Whenever I pay for anything, before I leave [the till / the checkout page]',
    actionFrame: 'I log the amount in my tracker before doing anything else',
    commonObstacle: 'Telling myself I will log it later and forgetting',
    obstacleResponseFrame:
      'If I skip logging at the till, then I log it the moment I notice, using the receipt or bank alert',
    complexityFactor: 0.7,
  },
] as const

/* ==========================================================================
 * OBSTACLE LIBRARY (MCII)
 * ========================================================================== */

/** A recurring obstacle with its coping-response pattern. */
export interface ObstacleEntry {
  id: string
  category: string
  obstacle: string
  responsePattern: string
}

export const OBSTACLE_LIBRARY: readonly ObstacleEntry[] = [
  {
    id: 'ob-fatigue',
    category: 'energy',
    obstacle: 'Feeling too tired at the planned moment',
    responsePattern:
      'If I feel too tired, then I shrink the action to its first two minutes — the plan is to start, not to finish.',
  },
  {
    id: 'ob-forgetting',
    category: 'memory',
    obstacle: 'Simply forgetting the plan',
    responsePattern:
      'If the trigger might slip by unnoticed, then I attach a physical cue (object in the way, calendar alert) at the trigger location.',
  },
  {
    id: 'ob-temptation',
    category: 'distraction',
    obstacle: 'A tempting alternative appears at the trigger moment',
    responsePattern:
      'If the temptation appears, then I postpone it explicitly: "I can do that at [later time], after the planned action."',
  },
  {
    id: 'ob-social',
    category: 'social',
    obstacle: 'Other people’s requests collide with the plan',
    responsePattern:
      'If someone interrupts at the trigger moment, then I name a concrete time I will join them and return to the plan.',
  },
  {
    id: 'ob-travel',
    category: 'context',
    obstacle: 'Travel or a broken routine removes the usual cue',
    responsePattern:
      'If the usual cue is unavailable, then I use the pre-committed backup trigger: [backup event] in the new context.',
  },
  {
    id: 'ob-perfectionism',
    category: 'emotion',
    obstacle: 'Skipping because conditions are not ideal',
    responsePattern:
      'If I catch myself waiting for ideal conditions, then I do the worst acceptable version on purpose — consistency beats quality at formation time.',
  },
  {
    id: 'ob-mood',
    category: 'emotion',
    obstacle: 'Low mood or motivation at the trigger moment',
    responsePattern:
      'If motivation is absent, then I rely on the trigger, not the feeling: the cue starts the action regardless of mood.',
  },
  {
    id: 'ob-overload',
    category: 'energy',
    obstacle: 'The day becomes overloaded and the plan feels impossible',
    responsePattern:
      'If the day collapses, then the floor version still happens: the smallest complete rep that keeps the cue-action link alive.',
  },
] as const

/* ==========================================================================
 * AUTOMATICITY CURVE DEFAULTS
 * ========================================================================== */

/** Parameters for the Lally et al. (2009) asymptotic automaticity model. */
export const AUTOMATICITY_CURVE_DEFAULTS = {
  /** Maximum habit strength (percent of full automaticity). */
  asymptote: 100,
  /** Reference: median days to 95% asymptote in the original study. */
  referenceMedianDays: 66,
  /** Observed range in the original study. */
  rangeDays: { min: 18, max: 254 },
} as const

/* ==========================================================================
 * VALIDATED EXPORTS
 * ========================================================================== */

const TemplateSchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  habitName: z.string().min(1),
  triggerKind: z.enum(['time', 'place', 'event', 'internal_state']),
  triggerFrame: z.string().min(1),
  actionFrame: z.string().min(1),
  commonObstacle: z.string().min(1),
  obstacleResponseFrame: z.string().min(1),
  complexityFactor: z.number().min(0.25).max(3),
})

/** Validated template bank (fails fast at import if malformed). */
export const VALIDATED_PLAN_TEMPLATES: readonly PlanTemplate[] = CANONICAL_PLAN_TEMPLATES.map((t) =>
  TemplateSchema.parse(t),
)

/** Look up one template by id (undefined when unknown). */
export function getPlanTemplateById(id: string): PlanTemplate | undefined {
  return CANONICAL_PLAN_TEMPLATES.find((t) => t.id === id)
}

/** All template domains, deduplicated and sorted. */
export function listTemplateDomains(): string[] {
  return [...new Set(CANONICAL_PLAN_TEMPLATES.map((t) => t.domain))].sort()
}
