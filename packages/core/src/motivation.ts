/**
 * Motivation — daily quests, achievements, levels, fresh-start framing, WOOP goals.
 *
 * Design is "white-hat" on purpose (Nir Eyal's distinction):
 *  - Quests are a small deterministic menu, not a variable-reward slot machine.
 *  - Achievements encode real learning milestones (reviews, mastery, teaching), never
 *    raw time-on-app.
 *  - Streaks live in streaks.ts; achievements reference them read-only.
 * Deterministic per date: the same date + inputs always produce the same quests
 * (server and client agree without sharing state).
 */
import type { QuestItem } from './types'
import { dateKeyOf } from './streaks'
import { levelFromXp, levelProgress, xpForLevel } from './xp'

// ─── Deterministic hashing (FNV-1a 32-bit) ──────────────────────────────────

/** Stable 32-bit FNV-1a hash of a string — used to rotate labels per date. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// ─── Daily quests ───────────────────────────────────────────────────────────

const REVIEW_LABELS = [
  'Clear the review queue — retrieval beats rereading',
  'Do your reviews before opening anything else',
  'Retrieval practice: small dose, full effort',
] as const

const FOCUS_LABELS = [
  'One deep-work block on your hardest subject — no tabs',
  'Single-task block: finish one thing that matters',
  'One focus session; phone in another room',
] as const

const LESSON_LABELS = [
  'Complete one lesson end-to-end',
  'Learn one new thing properly — then make cards',
  'One lesson, one objective, no skimming',
] as const

const HABIT_LABELS = [
  'Check in on your habits — the chain survives today',
  'Run the stack: your habits, in order, tiny versions count',
  'Daily habit check-in — votes for the person you become',
] as const

/** Inputs for daily quest generation (date + live counters). */
export interface GenerateDailyQuestsInput {
  date: Date | string
  /** cards currently due (server computes live) */
  dueCount?: number
  /** number of active habits (server computes live) */
  habitsCount?: number
  /** target minutes for the focus block (user_settings.sessionMinutes) */
  focusMinutesTarget?: number
}

/** Cap on the review quest target so a huge backlog stays achievable. */
export const MAX_QUEST_REVIEWS = 20

/**
 * 3 quests: reviews (min(dueCount, 20) — or a starter dose of 10 when nothing is
 * due), one lesson/focus block, one habit check-in. Deterministic per date:
 * same date + same inputs → identical items (verified in motivation.test.ts).
 * `progress`/`done` start at 0/false — the server layer fills live progress.
 */
export function generateDailyQuests(input: GenerateDailyQuestsInput): QuestItem[] {
  const key = dateKeyOf(input.date)
  const h = hashString(key)
  const dueCount = Math.max(0, input.dueCount ?? 0)
  const habitsCount = Math.max(0, input.habitsCount ?? 0)
  const focusTarget = Math.max(5, input.focusMinutesTarget ?? 25)

  const reviewTarget = dueCount > 0 ? Math.min(dueCount, MAX_QUEST_REVIEWS) : 10
  const reviewLabel = REVIEW_LABELS[h % REVIEW_LABELS.length]

  // Alternate lesson vs focus block by date — variety without randomness.
  const lessonDay = h % 2 === 0
  const midLabel = (lessonDay ? LESSON_LABELS : FOCUS_LABELS)[h % 3]

  const habitTarget = Math.max(1, Math.min(habitsCount, 3))
  const habitLabel = HABIT_LABELS[(h >>> 3) % HABIT_LABELS.length]

  return [
    { type: 'reviews', label: reviewLabel, target: reviewTarget, progress: 0, done: false },
    lessonDay
      ? { type: 'lesson', label: midLabel, target: 1, progress: 0, done: false }
      : { type: 'focus', label: midLabel, target: focusTarget, progress: 0, done: false },
    { type: 'habit', label: habitLabel, target: habitTarget, progress: 0, done: false },
  ]
}

// ─── Achievements (white-hat milestones only) ───────────────────────────────

/** The stats object the live unlock-check builds from DB aggregates. All counts are ≥ 0. */
export interface AchievementStats {
  totalReviews: number
  streakBest: number
  streakCurrent: number
  teachbackCount: number
  focusSessions: number
  focusMinutes: number
  coursesCompleted: number
  masteredSkills: number
  ideasCaptured: number
  ideasEvolved: number
  journalEntries: number
  examsPrepped: number
  palacesBuilt: number
  /** certificates issued (course finals passed) */
  certificates: number
  /** course exam attempts with score ≥ 0.8 */
  examsAced: number
}

/** One achievement badge and its unlock predicate over AchievementStats. */
export interface Achievement {
  key: string
  title: string
  description: string
  check: (stats: AchievementStats) => boolean
}

/** The full achievement catalog (white-hat milestones only). */
export const ACHIEVEMENTS: Achievement[] = [
  {
    key: 'first_review',
    title: 'First Step',
    description: 'Complete your first review card.',
    check: (s) => s.totalReviews >= 1,
  },
  {
    key: 'reviews_100',
    title: 'Century',
    description: 'Complete 100 reviews. Effortful retrieval compounds.',
    check: (s) => s.totalReviews >= 100,
  },
  {
    key: 'reviews_1000',
    title: 'Thousand-Armed',
    description: 'Complete 1,000 reviews. That is real memory work.',
    check: (s) => s.totalReviews >= 1000,
  },
  {
    key: 'streak_7',
    title: 'Week Unbroken',
    description: 'Hold a 7-day streak (freezes and amulets count — kindness helps).',
    check: (s) => s.streakBest >= 7,
  },
  {
    key: 'streak_30',
    title: 'Month of Showing Up',
    description: 'Hold a 30-day streak.',
    check: (s) => s.streakBest >= 30,
  },
  {
    key: 'first_teachback',
    title: 'The Feynman Door',
    description: 'Teach a concept back — teaching is the deepest test of knowing.',
    check: (s) => s.teachbackCount >= 1,
  },
  {
    key: 'first_focus',
    title: 'Single-Tasker',
    description: 'Finish one protected focus session.',
    check: (s) => s.focusSessions >= 1,
  },
  {
    key: 'focus_600_minutes',
    title: 'Ten Hours Deep',
    description: 'Accumulate 600 focused minutes. Depth over time-on-app.',
    check: (s) => s.focusMinutes >= 600,
  },
  {
    key: 'first_course',
    title: 'Course Complete',
    description: 'Finish your first course.',
    check: (s) => s.coursesCompleted >= 1,
  },
  {
    key: 'courses_3',
    title: 'Scholar',
    description: 'Finish three courses. Compounding, curriculum by curriculum.',
    check: (s) => s.coursesCompleted >= 3,
  },
  {
    key: 'first_certificate',
    title: 'Earned Proof',
    description: 'Pass a course final and claim your first certificate.',
    check: (s) => s.certificates >= 1,
  },
  {
    key: 'exam_aced',
    title: 'Sharpshooter',
    description: 'Score 80%+ on a course exam.',
    check: (s) => s.examsAced >= 1,
  },
  {
    key: 'skill_mastered',
    title: 'Mastery Gate',
    description: 'Bring one skill past the mastery threshold.',
    check: (s) => s.masteredSkills >= 1,
  },
  {
    key: 'first_idea',
    title: 'Seed Captured',
    description: 'Capture your first idea before it evaporates.',
    check: (s) => s.ideasCaptured >= 1,
  },
  {
    key: 'idea_evolved',
    title: 'Gardener',
    description: 'Grow one idea past the seed stage.',
    check: (s) => s.ideasEvolved >= 1,
  },
  {
    key: 'journal_7',
    title: 'One Honest Week',
    description: 'Write 7 journal entries. Reflection consolidates more than memory.',
    check: (s) => s.journalEntries >= 7,
  },
  {
    key: 'exam_prepped',
    title: 'Exam Ready',
    description: 'Set and prepare for an exam date.',
    check: (s) => s.examsPrepped >= 1,
  },
  {
    key: 'palace_built',
    title: 'Memory Architect',
    description: 'Build your first memory palace.',
    check: (s) => s.palacesBuilt >= 1,
  },
]

/** Catalog keys whose predicate is satisfied by the given stats. */
export function unlockedAchievementKeys(stats: AchievementStats): string[] {
  return ACHIEVEMENTS.filter((a) => a.check(stats)).map((a) => a.key)
}

// ─── Level helpers ──────────────────────────────────────────────────────────

export interface LevelInfo {
  level: number
  /** progress toward next level, 0..1 (goal-gradient bars) */
  progress: number
  /** total XP needed for the NEXT level */
  xpForNextLevel: number
}

/** Thin wrapper over the xp module so callers get level + gradient in one call. */
export function computeLevel(xp: number): LevelInfo {
  const level = levelFromXp(Math.max(0, xp))
  return {
    level,
    progress: levelProgress(Math.max(0, xp)),
    xpForNextLevel: xpForLevel(level + 1),
  }
}

// ─── Fresh-start moments (fresh-start effect) ───────────────────────────────

export type FreshStartReason = 'new-week' | 'new-month' | 'new-year'

/** Whether today is a temporal landmark worth a "fresh start" banner. */
export interface FreshStartMoment {
  fresh: boolean
  reason: FreshStartReason | null
}

/**
 * Fresh-start framing: show the "clean slate" banner only on temporal landmarks —
 * Monday (new week), the 1st of the month, New Year. Research (Dai, Milkman &
 * Riis 2014) shows people naturally initiate goal pursuit at these boundaries.
 */
export function isFreshStartMoment(date: Date | string): FreshStartMoment {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00Z') : new Date(date.getTime())
  const month = d.getUTCMonth() + 1
  const dayOfMonth = d.getUTCDate()
  const weekday = d.getUTCDay() // 0 Sun .. 6 Sat
  if (month === 1 && dayOfMonth === 1) return { fresh: true, reason: 'new-year' }
  if (dayOfMonth === 1) return { fresh: true, reason: 'new-month' }
  if (weekday === 1) return { fresh: true, reason: 'new-week' }
  return { fresh: false, reason: null }
}

// ─── WOOP goal validation ───────────────────────────────────────────────────

/** Character cap for each half of the structured if-then plan (keeps cards scannable). */
export const MAX_IF_THEN_CHARS = 200

export interface WoopGoalInput {
  wish: string
  outcome?: string | null
  obstacle?: string | null
  ifThenPlan?: string | null
  /**
   * Implementation intention, trigger half — the situation/cue ("If it is 21:00
   * and I have not studied…"). Optional; ≤ {@link MAX_IF_THEN_CHARS} chars.
   * Structured counterpart of the free-text `ifThenPlan`
   * (Gollwitzer & Sheeran 2006 meta-analysis: d = 0.65).
   */
  ifCondition?: string | null
  /** Implementation intention, action half — "…then I will do 3 review cards". Optional; ≤ 200 chars. */
  thenAction?: string | null
  dueDate?: string | null
}

/** WOOP goal validation result with a 0..1 completeness score. */
export interface WoopValidation {
  ok: boolean
  errors: string[]
  /** 0..1 — how much of the WOOP frame is filled (feeds UI nudges, not gates) */
  completeness: number
}

const PARTS = 4 // wish, outcome, obstacle, if-then plan

/**
 * WOOP (Oettingen): Wish, Outcome, Obstacle, Plan. The wish is required;
 * the mental-contrast parts are validated when present. The if-then plan must
 * be phrased "If <obstacle>, then I will <action>" — implementation intentions
 * (Gollwitzer 1999) roughly double follow-through. The plan part counts as
 * filled by EITHER the free-text `ifThenPlan` OR the structured pair
 * `ifCondition` + `thenAction` (both halves, ≤ {@link MAX_IF_THEN_CHARS} chars
 * each — the editor coaches the cue→action frame; Gollwitzer & Sheeran 2006,
 * d = 0.65).
 */
export function validateWoopGoal(goal: WoopGoalInput): WoopValidation {
  const errors: string[] = []
  const wish = (goal.wish ?? '').trim()
  if (wish.length < 3) errors.push('Wish is required (describe it in at least 3 characters).')

  let filled = 0
  if (wish.length >= 3) filled += 1

  const outcome = (goal.outcome ?? '').trim()
  const obstacle = (goal.obstacle ?? '').trim()
  const plan = (goal.ifThenPlan ?? '').trim()
  const ifCondition = (goal.ifCondition ?? '').trim()
  const thenAction = (goal.thenAction ?? '').trim()

  // Empty-after-trim means "left blank" — the parts are optional, blank ≠ invalid.
  if (outcome.length > 0) filled += 1

  if (obstacle.length > 0) filled += 1

  if (ifCondition.length > MAX_IF_THEN_CHARS) {
    errors.push(`If-condition is limited to ${MAX_IF_THEN_CHARS} characters.`)
  }
  if (thenAction.length > MAX_IF_THEN_CHARS) {
    errors.push(`Then-action is limited to ${MAX_IF_THEN_CHARS} characters.`)
  }

  if (plan.length > 0) {
    filled += 1
    const lower = plan.toLowerCase()
    if (!lower.includes('if') || !lower.includes('then')) {
      errors.push('If-then plan should read "If <obstacle>, then I will <action>".')
    }
  } else if (ifCondition.length > 0 && thenAction.length > 0) {
    // the structured pair IS an if-then plan — same WOOP part
    filled += 1
  }

  if (
    goal.dueDate != null &&
    goal.dueDate.trim() !== '' &&
    Number.isNaN(Date.parse(goal.dueDate))
  ) {
    errors.push('Due date must be a valid date.')
  }

  return { ok: errors.length === 0, errors, completeness: filled / PARTS }
}
