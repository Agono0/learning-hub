/**
 * Day-by-day plan from today to a deadline.
 *
 * Inputs are the not-completed lessons, a daily minutes budget and optional
 * rest weekdays. Lessons are placed in course order, except that a lesson waits
 * until every unmastered prerequisite skill it needs has had its lessons placed
 * earlier. A lesson may span days. Each finished lesson gets one spaced review
 * at the Cepeda gap (`optimalGapDays`) for the days left to the deadline.
 *
 * Meaning of the result, so it is not over-read:
 * - `status` is about CONTENT time only. `fits-without-reviews` means every lesson
 *   fits only if no reviews are scheduled; it says nothing about whether recall
 *   will be adequate, and reviews are then not scheduled.
 * - `prerequisiteSafe` is false when a lesson needs a prerequisite skill that is
 *   unmastered and that no remaining lesson trains (`unmetPrerequisites`), or when
 *   lessons wait on each other (`outOfOrder`). The order is then a best effort.
 * - The deadline is EXCLUSIVE: the last study day is the day before it. A caller
 *   that thinks in "through the end of date D" passes the next calendar date.
 *   `studyWindow` echoes the window actually used; no silent one-day shift.
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
  /**
   * Due date, `YYYY-MM-DD`, EXCLUSIVE: no study happens on this date. Study days
   * are startDate through the day before. For "through the end of D", pass D + 1.
   */
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

/**
 * - `fits`: all lesson minutes are placed, with reviews scheduled where they fit.
 * - `fits-without-reviews`: all lesson minutes are placed only when reviews are
 *   left out. No reviews are scheduled. This is not a statement about retention.
 * - `does-not-fit`: lesson minutes are left over even without reviews.
 */
export type PlanStatus = 'fits' | 'fits-without-reviews' | 'does-not-fit'

export interface UnmetPrerequisite {
  lesson: string
  /** The skill the lesson trains that needs the prerequisite. */
  skill: string
  /** The unmastered prerequisite skill. */
  prerequisite: string
  reason: 'no-remaining-lesson-trains-it'
}

export interface PlanResult {
  days: PlanDay[]
  status: PlanStatus
  /** The study window used: `start` is the first possible day, `endExclusive` has no study. */
  studyWindow: { start: string; endExclusive: string }
  totalRemainingMinutes: number
  capacityMinutes: number
  shortfallMinutes: number
  /** Lessons not finished by the deadline, with minutes left. */
  unfinished: { lesson: string; minutesLeft: number }[]
  /** Lessons that use the default estimate. */
  defaultEstimate: string[]
  /** Lessons placed before a prerequisite lesson could be (nothing else was eligible). */
  outOfOrder: { lesson: string; reason: string }[]
  /** Unmastered prerequisites that no remaining lesson trains. The plan cannot make these safe. */
  unmetPrerequisites: UnmetPrerequisite[]
  /** True only when `unmetPrerequisites` and `outOfOrder` are both empty. */
  prerequisiteSafe: boolean
  /** Review entries in `days`. */
  reviewsScheduled: number
  /** Reviews due on or before the last study day that got no room (or were not scheduled). */
  reviewsOverdueUnscheduled: number
  /** Reviews that fall due after the last study day. */
  reviewsAfterLastStudyDay: number
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
  if (withReviews.status === 'fits') return withReviews
  // Reviews must not take time from content that already does not fit.
  const contentOnly = place(model, state, { ...options, reviewShare: 0 })
  return contentOnly.status === 'fits'
    ? { ...contentOnly, status: 'fits-without-reviews' }
    : contentOnly
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

  const unmetPrerequisites: UnmetPrerequisite[] = []
  for (const l of remaining) {
    for (const sId of l.skillIds) {
      for (const p of model.prereqs.get(sId) ?? []) {
        if (isMastered(pKnown.get(p), threshold)) continue
        if ((trainers.get(p) ?? []).some((id) => id !== l.id)) continue
        unmetPrerequisites.push({
          lesson: l.slug,
          skill: model.skills[sId - 1]!.slug,
          prerequisite: model.skills[p - 1]!.slug,
          reason: 'no-remaining-lesson-trains-it',
        })
      }
    }
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
  const lastStudyDay = studyDays.length ? studyDays[studyDays.length - 1]! : -Infinity
  return {
    days,
    status: unfinished.length === 0 ? 'fits' : 'does-not-fit',
    studyWindow: { start: options.startDate, endExclusive: options.deadline },
    totalRemainingMinutes: total,
    capacityMinutes: capacity,
    shortfallMinutes: unfinished.reduce((s, u) => s + u.minutesLeft, 0),
    unfinished,
    defaultEstimate: remaining.filter((l) => l.estimated).map((l) => l.slug),
    outOfOrder,
    unmetPrerequisites,
    prerequisiteSafe: unmetPrerequisites.length === 0 && outOfOrder.length === 0,
    reviewsScheduled: days.reduce(
      (n, d) => n + d.entries.filter((e) => e.kind === 'review').length,
      0,
    ),
    reviewsOverdueUnscheduled: reviews.filter((r) => r.due <= lastStudyDay).length,
    reviewsAfterLastStudyDay: reviews.filter((r) => r.due > lastStudyDay).length,
  }
}
