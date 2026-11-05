/**
 * Study planner (M4): turn course workload + exam dates + available minutes
 * into a weekly template the learner can actually follow. The split honors
 * spacing (distributed practice beats cramming — Dunlosky 2013): minutes are
 * spread over as many days as possible, rest day excluded. Pure module.
 */

/** One course as the planner sees it. */
export interface PlanCourse {
  courseId: number
  title: string
  /** estimated total hours for the whole course */
  estHours: number
  /** 0..1 completed so far */
  progressFraction: number
  /** exam date (ISO) if this course has one */
  examDate?: string | null
}

/** One recurring weekly block. `courseId` null = review/rest catch-all. */
export interface PlanBlock {
  /** 0=Sun … 6=Sat */
  day: number
  minutes: number
  courseId: number | null
  label: string
}

/** The weekly template (identical every week until progress changes it). */
export interface WeeklyPlan {
  /** estimated weeks until all courses are done */
  weeks: number
  weeklyMinutes: number
  restDay: number | null
  blocks: PlanBlock[]
}

/**
 * Build the weekly template.
 *
 * - remaining hours per course drive the split, so nearly-done courses fade out
 * - a course with an exam within 30 days gets a ×2 weight (deadline pressure)
 * - study days are filled round-robin across courses so every week touches
 *   several topics (interleaving), never one marathon
 */
export function buildStudyPlan(
  courses: PlanCourse[],
  opts: { weeklyMinutes: number; restDay?: number | null },
): WeeklyPlan {
  const weeklyMinutes = Math.max(30, Math.round(opts.weeklyMinutes))
  const restDay = opts.restDay ?? null
  const studyDays = Array.from({ length: 7 }, (_, d) => d).filter((d) => d !== restDay)

  // weight = remaining hours (≥ 0.5 so finished courses drop out) × exam boost
  const DAY_MS = 86_400_000
  const now = Date.now()
  const weights = courses.map((c) => {
    const remaining = Math.max(0, c.estHours * (1 - c.progressFraction))
    if (remaining <= 0.05) return { course: c, weight: 0, remainingHours: 0 }
    let boost = 1
    if (c.examDate) {
      const daysLeft = (new Date(c.examDate).getTime() - now) / DAY_MS
      if (daysLeft >= 0 && daysLeft <= 30) boost = 2
    }
    return { course: c, weight: Math.max(0.5, remaining) * boost, remainingHours: remaining }
  })

  const totalWeight = weights.reduce((a, w) => a + w.weight, 0)
  if (totalWeight === 0) {
    // nothing left — a light review-only template
    const blocks: PlanBlock[] = studyDays.slice(0, 3).map((day) => ({
      day,
      minutes: Math.round(weeklyMinutes / 3),
      courseId: null,
      label: 'Spaced review',
    }))
    return { weeks: 0, weeklyMinutes, restDay, blocks }
  }

  // per-course minutes this week
  const shares = weights.map((w) => ({
    ...w,
    minutes: Math.round((w.weight / totalWeight) * weeklyMinutes),
  }))
  // rounding drift lands on the largest share
  const drift = weeklyMinutes - shares.reduce((a, s) => a + s.minutes, 0)
  if (drift !== 0 && shares.length > 0) {
    shares.slice().sort((a, b) => b.minutes - a.minutes)[0]!.minutes += drift
  }
  const active = shares.filter((s) => s.minutes >= 5)

  // spread course minutes round-robin across study days (≥ 10 min blocks)
  const blocks: PlanBlock[] = []
  const queues = active.map((s) => ({
    courseId: s.course.courseId,
    label: s.course.title,
    chunks: splitMinutes(s.minutes),
  }))
  let day = 0
  let guard = 0
  while (queues.some((q) => q.chunks.length > 0) && guard < 200) {
    const q = queues[guard % queues.length]!
    const chunk = q.chunks.shift()
    if (chunk) {
      blocks.push({
        day: studyDays[day % studyDays.length]!,
        minutes: chunk,
        courseId: q.courseId,
        label: q.label,
      })
      day += 1
    }
    guard += 1
  }
  blocks.sort((a, b) => a.day - b.day)

  // weeks until done: remaining hours ÷ (weekly minutes ÷ 60), at least 1
  const remainingHours = weights.reduce((a, w) => a + w.remainingHours, 0)
  const weeks = Math.max(1, Math.ceil(remainingHours / (weeklyMinutes / 60)))

  return { weeks, weeklyMinutes, restDay, blocks }
}

/** Split weekly minutes into ≤ 45 min sittings; the last one absorbs the remainder. */
function splitMinutes(minutes: number): number[] {
  const out: number[] = []
  let left = Math.max(0, minutes)
  while (left > 0) {
    const chunk = left >= 50 ? 45 : left
    out.push(chunk)
    left -= chunk
  }
  return out
}
