/**
 * Day-by-day plan from today to a deadline.
 *
 * Inputs are the not-completed lessons, a daily minutes budget and optional
 * rest weekdays. Lessons are placed in course order, except that a lesson waits
 * until every unmastered prerequisite skill it needs has had its lessons placed
 * earlier. A lesson may span days. Each finished lesson gets one spaced review
 * at the Cepeda gap (`optimalGapDays`) for the days left to the deadline.
 *
 * The plan says plainly when it does not fit: minutes short, which lessons are
 * left, and which lessons use the default estimate.
 */
import { optimalGapDays } from '../curriculum/pedagogy'
import { PREREQ_MASTERY_THRESHOLD } from '../curriculum/progress'
import { isMastered } from './graph'
import { masteryById, statusOf, type CourseModel, type LearnerState } from './model'

const DAY_MS = 86_400_000

export class CoursePathInputError extends RangeError {
  constructor(message: string) {
    super(message)
    this.name = 'CoursePathInputError'
  }
}

export interface PlanOptions {
  /** First study day, `YYYY-MM-DD` (calendar date, no time zone math). */
  startDate: string
  /** Due date, `YYYY-MM-DD`. Study days are startDate up to the day before it. */
  deadline: string
  minutesPerDay: number
  /** Weekdays with no study, 0 = Sunday ... 6 = Saturday. */
  restWeekdays?: readonly number[]
  threshold?: number
  /** Share of a day reviews may take, 0..1 (default 0.3). */
  reviewShare?: number
}

export interface PlanEntry {
  kind: 'lesson' | 'review'
  lesson: string
  title: string
  minutes: number
  /** True when the lesson continues on a later day. */
  continues?: boolean
}

export interface PlanDay {
  date: string
  minutes: number
  entries: PlanEntry[]
}

export interface PlanResult {
  days: PlanDay[]
  fits: boolean
  totalRemainingMinutes: number
  capacityMinutes: number
  shortfallMinutes: number
  /** Lessons not finished by the deadline, with minutes left. */
  unfinished: { lesson: string; minutesLeft: number }[]
  /** Lessons that use the default estimate. */
  defaultEstimate: string[]
  /** Lessons placed before a prerequisite lesson could be (nothing else was eligible). */
  outOfOrder: { lesson: string; reason: string }[]
  /** Reviews that came due after the last study day. */
  reviewsDropped: number
  /** True when the plan does not fit, so no reviews were scheduled. */
  reviewsSkipped: boolean
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDate(s: string, name: string): number {
  const m = DATE_RE.exec(s)
  if (!m) throw new CoursePathInputError(`${name} must be YYYY-MM-DD`)
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const back = new Date(t).toISOString().slice(0, 10)
  if (back !== s) throw new CoursePathInputError(`${name} is not a real calendar date`)
  return t
}

const key = (t: number) => new Date(t).toISOString().slice(0, 10)

interface Pending {
  lessonId: number
  left: number
}

export function planCourse(
  model: CourseModel,
  state: LearnerState,
  options: PlanOptions,
): PlanResult {
  const withReviews = place(model, state, options)
  if (withReviews.fits) return withReviews
  // Reviews must not take time from content that already does not fit.
  const contentOnly = place(model, state, { ...options, reviewShare: 0 })
  return { ...contentOnly, reviewsSkipped: true }
}

function place(model: CourseModel, state: LearnerState, options: PlanOptions): PlanResult {
  const start = parseDate(options.startDate, 'startDate')
  const end = parseDate(options.deadline, 'deadline')
  if (!Number.isFinite(options.minutesPerDay) || options.minutesPerDay < 1) {
    throw new CoursePathInputError('minutesPerDay must be at least 1')
  }
  const cap = Math.floor(options.minutesPerDay)
  const share = Math.min(1, Math.max(0, options.reviewShare ?? 0.3))
  const rest = new Set(options.restWeekdays ?? [])
  const threshold = options.threshold ?? PREREQ_MASTERY_THRESHOLD
  const pKnown = masteryById(model, state)

  const remaining = model.lessons.filter((l) => statusOf(model, state, l.id) !== 'completed')
  const queue: Pending[] = remaining.map((l) => ({ lessonId: l.id, left: l.minutes }))
  const finished = new Set<number>()
  const outOfOrder: PlanResult['outOfOrder'] = []
  const flagged = new Set<number>()

  // lessons (still to do) that train each skill
  const trainers = new Map<number, number[]>()
  for (const l of remaining) {
    for (const s of l.skillIds) trainers.set(s, [...(trainers.get(s) ?? []), l.id])
  }

  const eligible = (lessonId: number): boolean => {
    const lesson = model.lessons[lessonId - 1]!
    for (const s of lesson.skillIds) {
      for (const p of model.prereqs.get(s) ?? []) {
        if (isMastered(pKnown.get(p), threshold)) continue
        const need = (trainers.get(p) ?? []).filter((id) => id !== lessonId)
        if (need.some((id) => !finished.has(id))) return false
      }
    }
    return true
  }

  const studyDays: number[] = []
  for (let t = start; t < end; t += DAY_MS) {
    if (!rest.has(new Date(t).getUTCDay())) studyDays.push(t)
  }

  const days: PlanDay[] = []
  const reviews: { due: number; lessonId: number }[] = []
  const started = new Set<number>()

  for (const t of studyDays) {
    const entries: PlanEntry[] = []
    let used = 0

    // reviews first, within their share of the day
    const budget = Math.floor(cap * share)
    let spent = 0
    for (let i = 0; i < reviews.length;) {
      const r = reviews[i]!
      const lesson = model.lessons[r.lessonId - 1]!
      const mins = Math.min(15, Math.max(5, Math.round(lesson.minutes * 0.1)))
      if (r.due <= t && spent + mins <= budget) {
        entries.push({ kind: 'review', lesson: lesson.slug, title: lesson.title, minutes: mins })
        spent += mins
        reviews.splice(i, 1)
      } else i++
    }
    used += spent

    while (used < cap && queue.length) {
      let idx = queue.findIndex((p) => started.has(p.lessonId))
      if (idx === -1) idx = queue.findIndex((p) => eligible(p.lessonId))
      if (idx === -1) {
        idx = 0
        const id = queue[0]!.lessonId
        if (!flagged.has(id)) {
          flagged.add(id)
          outOfOrder.push({
            lesson: model.lessons[id - 1]!.slug,
            reason:
              'a prerequisite skill is trained by a lesson that is itself waiting on this one',
          })
        }
      }
      const p = queue[idx]!
      const lesson = model.lessons[p.lessonId - 1]!
      const take = Math.min(p.left, cap - used)
      started.add(p.lessonId)
      p.left -= take
      used += take
      const done = p.left === 0
      entries.push({
        kind: 'lesson',
        lesson: lesson.slug,
        title: lesson.title,
        minutes: take,
        ...(done ? {} : { continues: true }),
      })
      if (done) {
        queue.splice(idx, 1)
        finished.add(p.lessonId)
        const daysLeft = Math.max(1, Math.round((end - t) / DAY_MS))
        const gap = optimalGapDays(daysLeft)?.recommendedDays ?? 1
        reviews.push({ due: t + gap * DAY_MS, lessonId: p.lessonId })
      } else break // day is full
    }
    days.push({ date: key(t), minutes: used, entries })
  }

  const total = remaining.reduce((s, l) => s + l.minutes, 0)
  const capacity = studyDays.length * cap
  const unfinished = queue.map((p) => ({
    lesson: model.lessons[p.lessonId - 1]!.slug,
    minutesLeft: p.left,
  }))
  return {
    days,
    fits: unfinished.length === 0,
    totalRemainingMinutes: total,
    capacityMinutes: capacity,
    shortfallMinutes: unfinished.reduce((s, u) => s + u.minutesLeft, 0),
    unfinished,
    defaultEstimate: remaining.filter((l) => l.estimated).map((l) => l.slug),
    outOfOrder,
    reviewsDropped: reviews.length,
    reviewsSkipped: false,
  }
}
