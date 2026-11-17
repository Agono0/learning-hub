/**
 * Journal — weekly aggregation (pure transforms of view/table rows passed in)
 * plus entry validation. The server queries v_daily_reviews / v_xp_daily /
 * focus_sessions / habit_logs / journal_entries and hands the rows here.
 */
import { dayKey } from './streaks'

// ─── Input row shapes (as they come from drizzle / the views) ───────────────

export interface DailyReviewsRow {
  day: string // YYYY-MM-DD
  reviews: number
  correct?: number | null
  avg_time_ms?: number | null
}

/** One v_xp_daily row: XP earned on a day. */
export interface XpDailyRow {
  day: string
  xp: number
}

/** Minimal focus-session row feeding the weekly aggregate. */
export interface FocusSessionLite {
  startedAt: string // ISO
  actualMinutes?: number | null
  completed?: boolean | null
}

/** Minimal habit-check-in row feeding the weekly aggregate. */
export interface HabitLogLite {
  date: string // YYYY-MM-DD
}

/** Minimal journal-entry row feeding the weekly aggregate. */
export interface JournalLite {
  date: string
  mood?: number | null
}

/** All raw rows needed for one week's aggregation. */
export interface WeekData {
  dailyReviews: DailyReviewsRow[]
  xpDaily: XpDailyRow[]
  focusSessions: FocusSessionLite[]
  habitLogs: HabitLogLite[]
  journalEntries: JournalLite[]
}

// ─── Weekly summary ─────────────────────────────────────────────────────────

export interface WeekDaySummary {
  date: string
  reviews: number
  xp: number
  focusMinutes: number
  habitsDone: number
  mood: number | null
}

/** Aggregate weekly summary: 7 day rows, totals, mood average, prompts. */
export interface WeeklySummary {
  weekStart: string
  days: WeekDaySummary[] // exactly 7, weekStartDate..+6
  totals: {
    reviews: number
    xp: number
    focusMinutes: number
    habitsDone: number
  }
  moodAvg: number | null
  prompts: string[] // 3 rotating reflection prompts
}

const DAY_MS = 86_400_000

/** Weekly journal reflection prompts (3 chosen per week, deterministic). */
export const REFLECTION_PROMPTS: string[] = [
  'What did you understand this week that you did not understand last week?',
  'Which card or concept keeps slipping — and what would make it stick?',
  'Where did you lose focus most often? What single friction point caused it?',
  'What did you teach someone (or explain out loud) this week?',
  'Which small win are you most proud of? Name it precisely.',
  'What would you do differently if you restarted this week?',
  'Which habit is solidifying, and which one needs a smaller version?',
  'What are you avoiding, and what is the two-minute version of facing it?',
  'Where did effort beat talent for you this week?',
]

/** Rotate 3 prompts per week — deterministic from the week start date. */
export function weeklyPrompts(weekStartDate: string): string[] {
  const parsed = Date.parse(weekStartDate + 'T00:00:00Z')
  // An unparseable date falls back to week 0 rather than yielding undefined prompts.
  const weekIndex = Number.isFinite(parsed) ? Math.floor(parsed / (7 * DAY_MS)) : 0
  const n = REFLECTION_PROMPTS.length
  return [0, 1, 2].map((i) => REFLECTION_PROMPTS[(((weekIndex * 3 + i) % n) + n) % n])
}

function addDays(isoDate: string, n: number): string {
  return dayKey(new Date(Date.parse(isoDate + 'T00:00:00Z') + n * DAY_MS))
}

/**
 * Aggregate one week (Mon..Sun given the Monday as weekStartDate) from real data:
 * reviews from v_daily_reviews rows, XP from v_xp_daily rows, focus minutes from
 * completed focus_sessions, habit check-ins from habit_logs, mood from journal
 * entries. Missing days become zero rows — the shape is always 7 entries.
 */
export function aggregateWeek(weekStartDate: string, data: WeekData): WeeklySummary {
  const start = weekStartDate.slice(0, 10)

  const reviewsByDay = new Map(data.dailyReviews.map((r) => [r.day, r.reviews]))
  const xpByDay = new Map(data.xpDaily.map((r) => [r.day, r.xp]))
  const focusByDay = new Map<string, number>()
  for (const s of data.focusSessions) {
    if (s.completed === false) continue
    const day = s.startedAt.slice(0, 10)
    focusByDay.set(day, (focusByDay.get(day) ?? 0) + Math.max(0, s.actualMinutes ?? 0))
  }
  const habitsByDay = new Map<string, number>()
  for (const l of data.habitLogs) {
    habitsByDay.set(l.date.slice(0, 10), (habitsByDay.get(l.date.slice(0, 10)) ?? 0) + 1)
  }
  const moodByDay = new Map<string, number>()
  for (const j of data.journalEntries) {
    if (j.mood != null) moodByDay.set(j.date.slice(0, 10), j.mood)
  }

  const days: WeekDaySummary[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i)
    days.push({
      date,
      reviews: reviewsByDay.get(date) ?? 0,
      xp: xpByDay.get(date) ?? 0,
      focusMinutes: Math.round(focusByDay.get(date) ?? 0),
      habitsDone: habitsByDay.get(date) ?? 0,
      mood: moodByDay.get(date) ?? null,
    })
  }

  const totals = days.reduce(
    (acc, d) => ({
      reviews: acc.reviews + d.reviews,
      xp: acc.xp + d.xp,
      focusMinutes: acc.focusMinutes + d.focusMinutes,
      habitsDone: acc.habitsDone + d.habitsDone,
    }),
    { reviews: 0, xp: 0, focusMinutes: 0, habitsDone: 0 },
  )

  const moods = days.map((d) => d.mood).filter((m): m is number => m != null)
  const moodAvg =
    moods.length === 0
      ? null
      : Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10

  return { weekStart: start, days, totals, moodAvg, prompts: weeklyPrompts(start) }
}

// ─── Entry validation ───────────────────────────────────────────────────────

export interface JournalEntryInput {
  mood?: number | null
  smallWins?: string | null
  gratitude?: string | null
  worryDump?: string | null
}

/** Result of journal-entry validation (ok + human-readable errors). */
export interface JournalValidation {
  ok: boolean
  errors: string[]
}

const MOOD_EMOJI = ['distressed', 'sad', 'okay', 'good', 'great'] as const

/** Emoji for a 1-5 mood value (Daylio scale), clamped. */
export function moodEmoji(mood: number): string {
  return ['😞', '🙁', '😐', '🙂', '😄'][moodIndex(mood)]!
}

/** 1-5 mood → 0-4 index; rounds fractional moods, clamps, and maps NaN to neutral. */
function moodIndex(mood: number): number {
  if (!Number.isFinite(mood)) return 2
  return Math.min(4, Math.max(0, Math.round(mood) - 1))
}

/** Label for a 1-5 mood value, clamped. */
export function moodLabel(mood: number): string {
  return MOOD_EMOJI[moodIndex(mood)]!
}

/**
 * Small-wins style validation: at least one field must carry content, mood is
 * an integer 1-5 when present (Daylio scale). Worry dump is the expressive-
 * writing outlet for exam anxiety (Ramirez & Beilock 2011).
 */
export function validateJournalEntry(entry: JournalEntryInput): JournalValidation {
  const errors: string[] = []
  if (entry.mood != null && (!Number.isInteger(entry.mood) || entry.mood < 1 || entry.mood > 5)) {
    errors.push('Mood must be an integer 1-5.')
  }
  const hasText =
    (entry.smallWins ?? '').trim().length > 0 ||
    (entry.gratitude ?? '').trim().length > 0 ||
    (entry.worryDump ?? '').trim().length > 0
  if (!hasText && entry.mood == null)
    errors.push('Write something — a small win, a gratitude, or a worry dump.')
  return { ok: errors.length === 0, errors }
}

export * from './journal/metacognition'
