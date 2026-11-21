/**
 * Learner profile — the "readiness" engine.
 *
 * At first run the learner either picks a preset (ADHD-Friendly, Exam Sprint,
 * Night Owl, …) or answers 8 plain questions; `deriveProfile` scores the
 * answers into a small trait vector and a named archetype, and
 * `applyProfile` turns the profile into concrete app knobs (session length,
 * desired retention, quest dose, workload easy-days, chronotype inputs).
 * The profile is stored on `user_settings.learner_profile` (migration 030)
 * and every knob it touched stays user-editable in Settings — the profile
 * recommends, the learner decides.
 *
 * Pure domain: no I/O, no clocks, no randomness. Same answers → same profile,
 * byte for byte (unit-tested).
 *
 * Research anchors (kept honest and small): chronotype → morningness/
 * eveningness (Horne & Östberg 1976; Roenneberg et al. 2003); shorter,
 * variable blocks for attention-style diversity rather than one-size-fits-all
 * 25-minute blocks; retrieval dose per session left bounded (Rawson &
 * Dunlosky 2011 on successive relearning dose); desired-retention trade-off
 * follows the FSRS consensus that targets above ~0.92 cost super-linearly
 * more review time per unit retention.
 */
import { z } from 'zod'

// ── Traits ──────────────────────────────────────────────────────────────────

/** Chronotype in the standard morningness/eveningness sense (Horne & Östberg 1976). */
export const learnerChronotypeSchema = z.enum(['lark', 'intermediate', 'owl'])
export type ProfileChronotype = z.infer<typeof learnerChronotypeSchema>

/** How attention behaves across a block: one long dive, short bursts, or day-dependent. */
export const attentionStyleSchema = z.enum(['sustained', 'sprints', 'variable'])
export type AttentionStyle = z.infer<typeof attentionStyleSchema>

/** What the learner is optimizing for right now. */
export const goalHorizonSchema = z.enum(['exam', 'skill', 'lifelong'])
export type GoalHorizon = z.infer<typeof goalHorizonSchema>

/** Continuous trait, 0..1, derived from questionnaire weights. */
const trait01 = z.number().min(0).max(1)

export const learnerTraitsSchema = z.object({
  chronotype: learnerChronotypeSchema,
  attentionStyle: attentionStyleSchema,
  goalHorizon: goalHorizonSchema,
  /** Appetite for hard material: 0 = hard cards demotivate, 1 = hard cards are the point. */
  challengeAppetite: trait01,
  /** Need for explicit structure/scheduling: 0 = improvise, 1 = minute-by-minute plan. */
  structureNeed: trait01,
  /** Novelty drive: 0 = same routine comforts, 1 = routine drains. */
  noveltySeeking: trait01,
})
export type LearnerTraits = z.infer<typeof learnerTraitsSchema>

// ── Profile ─────────────────────────────────────────────────────────────────

export const learnerArchetypeSchema = z.enum([
  'steady',
  'sprinter',
  'marathoner',
  'explorer',
  'architect',
  'owl',
  'lark',
])
export type LearnerArchetype = z.infer<typeof learnerArchetypeSchema>

export const ARCHETYPE_LABELS: Record<LearnerArchetype, string> = {
  steady: 'Steady Learner',
  sprinter: 'Sprinter',
  marathoner: 'Marathoner',
  explorer: 'Explorer',
  architect: 'Architect',
  owl: 'Night Owl',
  lark: 'Early Bird',
}

/** The knob values the profile recommended, as applied (kept for the undo banner + Settings display). */
export const appliedKnobsSchema = z.record(z.string(), z.union([z.number(), z.string()]))
export type AppliedKnobs = z.infer<typeof appliedKnobsSchema>

export const learnerProfileSchema = z.object({
  /** Profile-shape version; bump when trait semantics change so old rows can migrate. */
  version: z.literal(1),
  /** Which preset produced this profile, when one did. */
  presetId: z.string().optional(),
  archetypeId: learnerArchetypeSchema,
  archetypeLabel: z.string().min(1),
  traits: learnerTraitsSchema,
  /** Preferred block length in minutes (10–90); feeds sessionMinutes. */
  sessionLengthPref: z.number().int().min(10).max(90),
  /** Knob snapshot as applied by `applyProfile` — display + undo only, never re-read as truth. */
  appliedKnobs: appliedKnobsSchema,
  createdAt: z.string().min(1),
})
export type LearnerProfile = z.infer<typeof learnerProfileSchema>

// ── Questionnaire ───────────────────────────────────────────────────────────

export interface ProfileQuestionOption {
  id: string
  label: string
  weights: Partial<{
    chronotype: ProfileChronotype
    attentionStyle: AttentionStyle
    goalHorizon: GoalHorizon
    challengeAppetite: number
    structureNeed: number
    noveltySeeking: number
  }>
  /** Direct block-length preference (minutes) for the session-length question. */
  sessionLengthPref?: number
}

export interface ProfileQuestion {
  id: string
  question: string
  helper?: string
  options: ProfileQuestionOption[]
}

/**
 * The first-run questionnaire. Eight questions, one trait each mostly; every
 * option maps onto trait weights (or a direct value). Plain language — no
 * psych jargon; the science stays in this file, not in the learner's face.
 */
export const PROFILE_QUESTIONS: readonly ProfileQuestion[] = [
  {
    id: 'focus_time',
    question: 'When does your brain naturally focus best?',
    helper: 'Be honest — the app will schedule around it.',
    options: [
      {
        id: 'early',
        label: 'Early morning, before the world wakes up',
        weights: { chronotype: 'lark' },
      },
      { id: 'midday', label: 'Somewhere through the day', weights: { chronotype: 'intermediate' } },
      { id: 'late', label: 'Late evening or at night', weights: { chronotype: 'owl' } },
    ],
  },
  {
    id: 'session_length',
    question: 'How long can a study block run before it stops working?',
    options: [
      {
        id: 'short',
        label: '10–15 minutes, then I need a change',
        weights: { attentionStyle: 'sprints', noveltySeeking: 0.3 },
        sessionLengthPref: 15,
      },
      {
        id: 'standard',
        label: 'About 25 minutes',
        weights: { attentionStyle: 'variable', noveltySeeking: 0 },
        sessionLengthPref: 25,
      },
      {
        id: 'long',
        label: '45+ minutes of deep work',
        weights: { attentionStyle: 'sustained' },
        sessionLengthPref: 50,
      },
    ],
  },
  {
    id: 'sit_down',
    question: 'When you sit down to study, what actually happens?',
    options: [
      {
        id: 'deep',
        label: 'I go deep on one thing and stay there',
        weights: { attentionStyle: 'sustained', structureNeed: 0.15 },
      },
      {
        id: 'bursts',
        label: 'Short bursts, then I need a break',
        weights: { attentionStyle: 'sprints', noveltySeeking: 0.15 },
      },
      {
        id: 'depends',
        label: 'Honestly — it depends on the day',
        weights: { attentionStyle: 'variable' },
      },
    ],
  },
  {
    id: 'hard_cards',
    question: 'Cards that feel really hard are…',
    options: [
      {
        id: 'the_point',
        label: 'The point — that’s where I grow',
        weights: { challengeAppetite: 0.85 },
      },
      { id: 'fine', label: 'Fine in moderation', weights: { challengeAppetite: 0.5 } },
      {
        id: 'draining',
        label: 'Demotivating — I avoid them',
        weights: { challengeAppetite: 0.15 },
      },
    ],
  },
  {
    id: 'structure',
    question: 'You stick to a plan best when it is…',
    options: [
      {
        id: 'strict',
        label: 'Scheduled — tell me exactly what to do',
        weights: { structureNeed: 0.85 },
      },
      { id: 'rhythm', label: 'A flexible rhythm, not a cage', weights: { structureNeed: 0.5 } },
      { id: 'improv', label: 'Loose — I improvise', weights: { structureNeed: 0.15 } },
    ],
  },
  {
    id: 'novelty',
    question: 'Reviewing the same deck every day feels…',
    options: [
      { id: 'comfort', label: 'Comforting — routine helps me', weights: { noveltySeeking: 0.15 } },
      { id: 'ok', label: 'Okay, I don’t mind', weights: { noveltySeeking: 0.5 } },
      { id: 'draining', label: 'Draining — mix it up for me', weights: { noveltySeeking: 0.85 } },
    ],
  },
  {
    id: 'goal',
    question: 'What are you here for?',
    options: [
      {
        id: 'exam',
        label: 'A real exam on a date',
        weights: { goalHorizon: 'exam', structureNeed: 0.1 },
      },
      { id: 'skill', label: 'Mastering a specific skill', weights: { goalHorizon: 'skill' } },
      { id: 'life', label: 'Lifelong learning', weights: { goalHorizon: 'lifelong' } },
    ],
  },
  {
    id: 'friction',
    question: 'If an app fights you for ten seconds, you…',
    options: [
      {
        id: 'push',
        label: 'Push through',
        weights: { structureNeed: 0.2, challengeAppetite: 0.1 },
      },
      {
        id: 'quit',
        label: 'Usually quit and come back later',
        weights: { attentionStyle: 'sprints', noveltySeeking: 0.1 },
      },
      {
        id: 'switch',
        label: 'Switch to something else immediately',
        weights: { attentionStyle: 'variable', noveltySeeking: 0.2 },
      },
    ],
  },
]

/** Answers keyed by question id → option id. */
export const profileAnswersSchema = z.record(z.string(), z.string().min(1))
export type ProfileAnswers = z.infer<typeof profileAnswersSchema>

// ── deriveProfile ───────────────────────────────────────────────────────────

/** One-line story per archetype, shown under the label in Settings/onboarding. */
export const ARCHETYPE_BLURBS: Record<LearnerArchetype, string> = {
  steady: 'balanced habits — the app keeps a gentle, even rhythm',
  sprinter: 'short, intense blocks — doses stay small and varied',
  marathoner: 'long deep blocks — bigger doses, calmer pace',
  explorer: 'variety first — decks interleave and rotate',
  architect: 'structure first — plans, exams and gates come forward',
  owl: 'evening chronotype — gentle mornings, real targets at night',
  lark: 'morning chronotype — the hard stuff lands early',
}

function majority(values: Array<number | undefined>): number {
  const xs = values.filter((v): v is number => typeof v === 'number')
  if (xs.length === 0) return 0.5
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/**
 * Score questionnaire answers into a profile. Deterministic: the same answer
 * map always yields the same traits and archetype. Unknown question ids are
 * ignored; a missing/invalid answer for a question contributes nothing.
 */
export function deriveProfile(answers: ProfileAnswers): LearnerProfile {
  let chronotype: ProfileChronotype | undefined
  let attentionStyle: AttentionStyle | undefined
  let goalHorizon: GoalHorizon | undefined
  let sessionLengthPref: number | undefined
  const challenge: number[] = []
  const structure: number[] = []
  const novelty: number[] = []

  for (const q of PROFILE_QUESTIONS) {
    const chosen = answers[q.id]
    if (typeof chosen !== 'string') continue
    const option = q.options.find((o) => o.id === chosen)
    if (!option) continue
    const w = option.weights
    if (w.chronotype) chronotype = w.chronotype
    if (w.attentionStyle) attentionStyle = w.attentionStyle
    if (w.goalHorizon) goalHorizon = w.goalHorizon
    if (typeof w.challengeAppetite === 'number') challenge.push(w.challengeAppetite)
    if (typeof w.structureNeed === 'number') structure.push(w.structureNeed)
    if (typeof w.noveltySeeking === 'number') novelty.push(w.noveltySeeking)
    if (option.sessionLengthPref !== undefined) sessionLengthPref = option.sessionLengthPref
  }

  const traits: LearnerTraits = {
    chronotype: chronotype ?? 'intermediate',
    attentionStyle: attentionStyle ?? 'variable',
    goalHorizon: goalHorizon ?? 'lifelong',
    challengeAppetite: majority(challenge),
    structureNeed: majority(structure),
    noveltySeeking: majority(novelty),
  }

  return {
    version: 1,
    archetypeId: pickArchetype(traits),
    archetypeLabel: ARCHETYPE_LABELS[pickArchetype(traits)],
    traits,
    sessionLengthPref: sessionLengthPref ?? 25,
    appliedKnobs: {},
    createdAt: 'derived',
  }
}

/** Deterministic archetype selection from the trait vector. */
export function pickArchetype(traits: LearnerTraits): LearnerArchetype {
  if (traits.chronotype === 'owl') return 'owl'
  if (traits.chronotype === 'lark') return 'lark'
  // Exam + structure is the strongest non-chronotype signal (checked before
  // marathoner so an exam-driven planner reads as Architect, not Marathoner).
  if (traits.goalHorizon === 'exam' && traits.structureNeed >= 0.3) return 'architect'
  if (traits.attentionStyle === 'sprints' && traits.noveltySeeking >= 0.3) return 'sprinter'
  if (traits.attentionStyle === 'sustained' && traits.structureNeed >= 0.3) return 'marathoner'
  if (traits.noveltySeeking >= 0.5 && traits.structureNeed <= 0.45) return 'explorer'
  return 'steady'
}

// ── Presets ─────────────────────────────────────────────────────────────────

export interface LearnerPreset {
  id: string
  label: string
  /** One honest line: what this preset changes. */
  blurb: string
  traits: LearnerTraits
  sessionLengthPref: number
}

/**
 * Preset profiles. ADHD-Friendly encodes what the attention literature and the
 * app's own friction data suggest for stimulant-medication-independent study:
 * shorter blocks, more variety, smaller retrieval doses, immediate feedback —
 * it changes knobs, never disables honest mechanics (no dark patterns).
 */
export const LEARNER_PRESETS: readonly LearnerPreset[] = [
  {
    id: 'adhd-friendly',
    label: 'ADHD-Friendly',
    blurb: 'Short blocks, small doses, more variety — momentum over marathons.',
    traits: {
      chronotype: 'intermediate',
      attentionStyle: 'sprints',
      goalHorizon: 'skill',
      challengeAppetite: 0.5,
      structureNeed: 0.45,
      noveltySeeking: 0.75,
    },
    sessionLengthPref: 15,
  },
  {
    id: 'exam-sprint',
    label: 'Exam Sprint',
    blurb: 'Exam-date first: tighter retention target, plans and gates forward.',
    traits: {
      chronotype: 'intermediate',
      attentionStyle: 'sustained',
      goalHorizon: 'exam',
      challengeAppetite: 0.7,
      structureNeed: 0.75,
      noveltySeeking: 0.35,
    },
    sessionLengthPref: 35,
  },
  {
    id: 'professional',
    label: 'Working Professional',
    blurb: 'Compact sessions that survive a calendar; commute-friendly.',
    traits: {
      chronotype: 'intermediate',
      attentionStyle: 'variable',
      goalHorizon: 'skill',
      challengeAppetite: 0.5,
      structureNeed: 0.6,
      noveltySeeking: 0.4,
    },
    sessionLengthPref: 20,
  },
  {
    id: 'night-owl',
    label: 'Night Owl',
    blurb: 'Gentle mornings, real targets after dark.',
    traits: {
      chronotype: 'owl',
      attentionStyle: 'variable',
      goalHorizon: 'lifelong',
      challengeAppetite: 0.5,
      structureNeed: 0.4,
      noveltySeeking: 0.5,
    },
    sessionLengthPref: 30,
  },
  {
    id: 'deep-worker',
    label: 'Deep Worker',
    blurb: 'Long uninterrupted dives; fewer, bigger doses.',
    traits: {
      chronotype: 'lark',
      attentionStyle: 'sustained',
      goalHorizon: 'skill',
      challengeAppetite: 0.8,
      structureNeed: 0.55,
      noveltySeeking: 0.25,
    },
    sessionLengthPref: 55,
  },
  {
    id: 'gentle-start',
    label: 'Gentle Start',
    blurb: 'Low targets that never punish a bad day — build the habit first.',
    traits: {
      chronotype: 'intermediate',
      attentionStyle: 'variable',
      goalHorizon: 'lifelong',
      challengeAppetite: 0.3,
      structureNeed: 0.35,
      noveltySeeking: 0.5,
    },
    sessionLengthPref: 15,
  },
]

/** Build a full profile from a preset (used by onboarding + Settings preset switch). */
export function profileFromPreset(presetId: string): LearnerProfile | undefined {
  const preset = LEARNER_PRESETS.find((p) => p.id === presetId)
  if (!preset) return undefined
  const archetypeId = pickArchetype(preset.traits)
  return {
    version: 1,
    presetId: preset.id,
    archetypeId,
    archetypeLabel: ARCHETYPE_LABELS[archetypeId],
    traits: preset.traits,
    sessionLengthPref: preset.sessionLengthPref,
    appliedKnobs: {},
    createdAt: 'preset',
  }
}

// ── applyProfile: profile → concrete knobs ─────────────────────────────────

export interface ProfileKnobs {
  /** FSRS desired retention, clamped to the settings route's [0.5, 0.97]. */
  desiredRetention: number
  /** Default review-session size. */
  reviewDefaultLimit: number
  /** Daily-quest review dose ceiling. */
  questMaxReviews: number
  /** Focus-block minutes. */
  sessionMinutes: number
  /** Workload planner: days per week with a reduced target. */
  easyDays: number
  /** Workload planner: hard cap of reviews per day. */
  maxPerDay: number
  /** Circadian inputs. */
  chronotype: ProfileChronotype
  wakeHour: number
  bedtimeHour: number
}

export interface ProfileKnobChange {
  key: keyof ProfileKnobs
  from: number | string
  to: number | string
  rationale: string
}

const CLAMP = {
  sessionMinutes: (v: number) => Math.min(180, Math.max(5, Math.round(v))),
  desiredRetention: (v: number) => Math.min(0.97, Math.max(0.5, Math.round(v * 1000) / 1000)),
  reviewDefaultLimit: (v: number) => Math.min(100, Math.max(5, Math.round(v))),
  questMaxReviews: (v: number) => Math.min(60, Math.max(5, Math.round(v))),
  maxPerDay: (v: number) => Math.min(300, Math.max(5, Math.round(v))),
} as const

const CHRONO_SCHEDULE: Record<ProfileChronotype, { wakeHour: number; bedtimeHour: number }> = {
  lark: { wakeHour: 6, bedtimeHour: 22 },
  intermediate: { wakeHour: 7, bedtimeHour: 23 },
  owl: { wakeHour: 9, bedtimeHour: 1 },
}

/**
 * Turn a profile into concrete knob values, paired with the current values so
 * the UI can show "25 → 15" and offer one-click undo. Deterministic; every
 * knob lands inside the range its Settings control enforces.
 */
export function applyProfile(
  profile: Pick<LearnerProfile, 'traits' | 'sessionLengthPref'>,
  current: { sessionMinutes: number; desiredRetention: number },
): ProfileKnobChange[] {
  const t = profile.traits
  const changes: ProfileKnobChange[] = []
  const push = (
    key: keyof ProfileKnobs,
    from: number | string,
    to: number | string,
    rationale: string,
  ) => {
    if (from !== to) changes.push({ key, from, to, rationale })
  }

  const sessionMinutes = CLAMP.sessionMinutes(profile.sessionLengthPref)
  push(
    'sessionMinutes',
    current.sessionMinutes,
    sessionMinutes,
    'block length you said works for you',
  )

  const desiredRetention = CLAMP.desiredRetention(
    t.goalHorizon === 'exam'
      ? 0.92
      : t.goalHorizon === 'skill'
        ? 0.9
        : t.challengeAppetite <= 0.35
          ? 0.86
          : 0.9,
  )
  push(
    'desiredRetention',
    current.desiredRetention,
    desiredRetention,
    t.goalHorizon === 'exam'
      ? 'exam horizon: keep more per card, accept more reviews'
      : t.challengeAppetite <= 0.35
        ? 'easier wins first — you can raise it any time'
        : 'balanced forgetting/effort trade-off',
  )

  const reviewDefaultLimit = CLAMP.reviewDefaultLimit(
    t.attentionStyle === 'sustained' ? 30 : t.attentionStyle === 'sprints' ? 12 : 20,
  )
  push(
    'reviewDefaultLimit',
    20,
    reviewDefaultLimit,
    t.attentionStyle === 'sustained'
      ? 'sustained attention: fewer, longer sessions'
      : t.attentionStyle === 'sprints'
        ? 'sprints: small sessions you actually finish'
        : 'variable attention: the flexible default',
  )

  const questMaxReviews = CLAMP.questMaxReviews(
    t.attentionStyle === 'sustained' ? 25 : t.attentionStyle === 'sprints' ? 12 : 18,
  )
  push('questMaxReviews', 20, questMaxReviews, 'daily quest sized to your block length')

  const easyDays = t.goalHorizon === 'exam' ? 0 : 1
  push(
    'easyDays',
    0,
    easyDays,
    t.goalHorizon === 'exam'
      ? 'no easy days before an exam'
      : 'one lighter day a week keeps the streak honest',
  )

  const maxPerDay = CLAMP.maxPerDay(
    t.attentionStyle === 'sustained' ? 30 : t.attentionStyle === 'sprints' ? 15 : 20,
  )
  push('maxPerDay', 30, maxPerDay, 'daily review cap matched to your block style')

  const sched = CHRONO_SCHEDULE[t.chronotype]
  push('chronotype', 'intermediate', t.chronotype, 'circadian studio + reminder timing')
  push('wakeHour', 7, sched.wakeHour, 'circadian alertness model start')
  push('bedtimeHour', 23, sched.bedtimeHour, 'circadian alertness model end')

  return changes
}

/** Human lines for the applied-changes banner: "sessionMinutes 25 → 15 (rationale)". */
export function describeChanges(changes: ProfileKnobChange[]): string[] {
  return changes.map((c) => `${c.key} ${c.from} → ${c.to} (${c.rationale})`)
}

/** Convenience: knobs as a plain record for persistence in `appliedKnobs`. */
export function knobsToRecord(knobs: ProfileKnobChange[]): AppliedKnobs {
  const out: AppliedKnobs = {}
  for (const c of knobs) out[c.key] = c.to
  return out
}
