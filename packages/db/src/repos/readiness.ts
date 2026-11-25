/**
 * Exam readiness repository: read-only projections the readiness forecast
 * needs. No writes. The forecast itself is pure and lives in core.
 */
import { asc, eq, inArray } from 'drizzle-orm'
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
