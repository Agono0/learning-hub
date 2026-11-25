/**
 * Exam readiness repository: read-only projections the readiness forecast
 * needs. No writes. The forecast itself is pure and lives in core.
 */
import { asc, eq, inArray } from 'drizzle-orm'
import {
  buildReadinessReport,
  parseExamDate,
  planBudget,
  rankReviewGains,
  reviewsNeededFor,
  type ReadinessReport,
  type ReviewGain,
  type ReviewPlan,
} from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { cards, decks, examDates, skills } from '../schema'

/** The columns of `cards` the forecast reads, shaped like core's ReadinessCard. */
export interface ReadinessCardRow {
  id: number
  deckId: number
  skillId: number | null
  state: number
  stability: number
  difficulty: number
  scheduledDays: number
  learningStep: number
  reps: number
  lapses: number
  due: string
  lastReview: string | null
  suspended: boolean
}

export interface ReadinessExamRow {
  id: number
  courseId: number | null
  title: string
  date: string
}

export interface ReadinessInputs {
  cards: ReadinessCardRow[]
  deckNames: Map<number, string>
  skillNames: Map<number, string>
}

export interface ReadinessScope {
  /** Only these decks. Omit for every deck. */
  deckIds?: readonly number[]
}

/** Upcoming and past exam anchors, soonest first. */
export function listReadinessExams(db: LearningHubDB = getDb()): ReadinessExamRow[] {
  return db
    .select({
      id: examDates.id,
      courseId: examDates.courseId,
      title: examDates.title,
      date: examDates.date,
    })
    .from(examDates)
    .orderBy(asc(examDates.date), asc(examDates.id))
    .all()
}

/** One exam anchor by id, or null. */
export function getReadinessExam(id: number, db: LearningHubDB = getDb()): ReadinessExamRow | null {
  return (
    db
      .select({
        id: examDates.id,
        courseId: examDates.courseId,
        title: examDates.title,
        date: examDates.date,
      })
      .from(examDates)
      .where(eq(examDates.id, id))
      .get() ?? null
  )
}

/**
 * Cards plus the deck and skill names needed to label a report. Suspended
 * cards are included so the caller decides; the forecast skips them.
 */
export function loadReadinessInputs(
  scope: ReadinessScope = {},
  db: LearningHubDB = getDb(),
): ReadinessInputs {
  const base = db
    .select({
      id: cards.id,
      deckId: cards.deckId,
      skillId: cards.skillId,
      state: cards.state,
      stability: cards.stability,
      difficulty: cards.difficulty,
      scheduledDays: cards.scheduledDays,
      learningStep: cards.learningStep,
      reps: cards.reps,
      lapses: cards.lapses,
      due: cards.due,
      lastReview: cards.lastReview,
      suspended: cards.suspended,
    })
    .from(cards)
  const ids = scope.deckIds ? [...new Set(scope.deckIds)] : null
  const rows = ids
    ? ids.length === 0
      ? []
      : base.where(inArray(cards.deckId, ids)).all()
    : base.all()
  const deckNames = new Map<number, string>()
  for (const d of db.select({ id: decks.id, name: decks.name }).from(decks).all()) {
    deckNames.set(d.id, d.name)
  }
  const skillNames = new Map<number, string>()
  for (const s of db.select({ id: skills.id, name: skills.name }).from(skills).all()) {
    skillNames.set(s.id, s.name)
  }
  return { cards: rows, deckNames, skillNames }
}

export interface ReadinessQuery {
  examId?: number
  date?: string
  title?: string
  plan: 'none' | 'on-schedule' | 'capacity'
  perDay: number
  target: number
  deckIds?: readonly number[]
  budget: number
}

export interface ReadinessRun {
  report: ReadinessReport
  review: {
    budget: number
    meanRecallBefore: number
    meanRecallAfter: number
    reviewsNeededForTarget: number | null
    top: ReviewGain[]
    assumptions: string[]
  }
}

export type ReadinessRunResult =
  { ok: true; value: ReadinessRun } | { ok: false; status: 400 | 404 | 422; error: string }

/**
 * One read-only pipeline shared by the API, CLI and MCP so every surface
 * returns the same figures and the same `assumptions`. Never writes.
 */
export async function runReadiness(
  q: ReadinessQuery,
  opts: { db?: LearningHubDB; now?: Date; maxGainRows?: number } = {},
): Promise<ReadinessRunResult> {
  const db = opts.db ?? getDb()
  let target: { title: string; date: string; courseId: number | null }
  if (q.examId !== undefined) {
    const exam = getReadinessExam(q.examId, db)
    if (!exam) return { ok: false, status: 404, error: 'exam not found' }
    target = { title: exam.title, date: exam.date, courseId: exam.courseId }
  } else if (q.date !== undefined) {
    if (!parseExamDate(q.date))
      return { ok: false, status: 400, error: 'date must be YYYY-MM-DD or an ISO timestamp' }
    target = { title: q.title ?? 'Exam', date: q.date, courseId: null }
  } else {
    return { ok: false, status: 400, error: 'examId or date is required' }
  }
  const exam = parseExamDate(target.date)
  if (!exam) return { ok: false, status: 422, error: 'exam date is not a valid date' }

  const plan: ReviewPlan =
    q.plan === 'none'
      ? { kind: 'none' }
      : q.plan === 'capacity'
        ? { kind: 'capacity', perDay: q.perDay }
        : { kind: 'on-schedule' }
  const now = opts.now ?? new Date()
  const inputs = loadReadinessInputs({ deckIds: q.deckIds }, db)
  const report = await buildReadinessReport({
    target,
    cards: inputs.cards,
    now,
    plan,
    targetRecall: q.target,
    deckLabel: (id) => inputs.deckNames.get(id) ?? `Deck ${id}`,
    skillLabel: (id) => inputs.skillNames.get(id) ?? `Skill ${id}`,
  })
  if (!report) return { ok: false, status: 422, error: 'exam date is not a valid date' }
  const gains = await rankReviewGains(inputs.cards, now, exam)
  const budgetPlan = planBudget(gains, q.budget)
  return {
    ok: true,
    value: {
      report,
      review: {
        budget: budgetPlan.budget,
        meanRecallBefore: budgetPlan.before,
        meanRecallAfter: budgetPlan.after,
        reviewsNeededForTarget: reviewsNeededFor(gains, report.targetRecall),
        top: budgetPlan.chosen.slice(0, opts.maxGainRows ?? 50),
        assumptions: report.assumptions,
      },
    },
  }
}
