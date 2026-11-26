/**
 * Exam prep repository: one read-only pipeline for the API, CLI and MCP.
 * It loads cards, runs core's pure planner and labels the result. It never
 * writes a review, a schedule or a card.
 */
import { inArray } from 'drizzle-orm'
import { parseExamDate, planExamPrep, type PrepPlan } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { cards } from '../schema'
import { getReadinessExam, loadReadinessInputs } from './readiness'

export interface ExamPrepQuery {
  examId?: number
  date?: string
  title?: string
  target: number
  perDay: number
  minGain: number
  maxReviewsPerCard: number
  restWeekdays?: readonly number[]
  deckIds?: readonly number[]
}

export interface LabeledReview {
  cardId: number
  deckId: number
  deck: string
  label: string
  recallBefore: number
  examRecallAfter: number
  gain: number
  nth: number
}

export interface LabeledDay {
  date: string
  rest: boolean
  reviews: LabeledReview[]
  meanExamRecallAfter: number
}

export interface ExamPrepRun {
  title: string
  plan: Omit<PrepPlan, 'days'> & { days: LabeledDay[] }
  /** Real reviews are made by the learner in the review queue. */
  note: string
}

export type ExamPrepResult =
  { ok: true; value: ExamPrepRun } | { ok: false; status: 400 | 404 | 422; error: string }

export const EXAM_PREP_NOTE =
  'This is a read-only model scenario. Nothing is scheduled or reviewed for you. Open a day in the review queue and answer the cards yourself.'

/** A short human label for a card from its JSON content (flat or nested one level). Never throws. */
export function cardLabel(content: unknown): string {
  const keys = ['front', 'question', 'prompt', 'text', 'term', 'title']
  const find = (o: unknown, depth: number): string | null => {
    if (!o || typeof o !== 'object') return null
    const c = o as Record<string, unknown>
    for (const k of keys) {
      const v = c[k]
      if (typeof v === 'string' && v.trim()) return clip(v)
    }
    if (depth > 0)
      for (const v of Object.values(c)) {
        const r = find(v, depth - 1)
        if (r) return r
      }
    return null
  }
  return find(content, 2) ?? 'Card'
}

function clip(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > 90 ? `${t.slice(0, 89)}…` : t
}

export async function runExamPrep(
  q: ExamPrepQuery,
  opts: { db?: LearningHubDB; now?: Date } = {},
): Promise<ExamPrepResult> {
  const db = opts.db ?? getDb()
  let target: { title: string; date: string }
  if (q.examId !== undefined) {
    const exam = getReadinessExam(q.examId, db)
    if (!exam) return { ok: false, status: 404, error: 'exam not found' }
    target = { title: exam.title, date: exam.date }
  } else if (q.date !== undefined) {
    target = { title: q.title ?? 'Exam', date: q.date }
  } else {
    return { ok: false, status: 400, error: 'examId or date is required' }
  }
  const exam = parseExamDate(target.date)
  if (!exam) {
    return q.examId !== undefined
      ? { ok: false, status: 422, error: 'exam date is not a valid date' }
      : { ok: false, status: 400, error: 'date must be YYYY-MM-DD or an ISO timestamp' }
  }
  const now = opts.now ?? new Date()
  const inputs = loadReadinessInputs({ deckIds: q.deckIds }, db)
  const plan = await planExamPrep(inputs.cards, now, exam, q.target, {
    perDay: q.perDay,
    minGain: q.minGain,
    maxReviewsPerCard: q.maxReviewsPerCard,
    restWeekdays: q.restWeekdays,
  })
  if (!plan)
    return { ok: false, status: 422, error: 'exam date is invalid or more than 366 days away' }

  const ids = [...new Set(plan.days.flatMap((d) => d.reviews.map((r) => r.cardId)))]
  const labels = new Map<number, string>()
  for (let i = 0; i < ids.length; i += 500) {
    const rows = db
      .select({ id: cards.id, content: cards.content })
      .from(cards)
      .where(inArray(cards.id, ids.slice(i, i + 500)))
      .all()
    for (const r of rows) labels.set(r.id, cardLabel(r.content))
  }
  const days: LabeledDay[] = plan.days.map((d) => ({
    ...d,
    reviews: d.reviews.map((r) => ({
      ...r,
      deck: inputs.deckNames.get(r.deckId) ?? `Deck ${r.deckId}`,
      label: labels.get(r.cardId) ?? 'Card',
    })),
  }))
  return { ok: true, value: { title: target.title, plan: { ...plan, days }, note: EXAM_PREP_NOTE } }
}
