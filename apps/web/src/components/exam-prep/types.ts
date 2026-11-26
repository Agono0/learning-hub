/** Shapes returned by GET /api/exam-prep (mirrors db's ExamPrepRun, JSON-safe). */
export interface PrepReviewDto {
  cardId: number
  deckId: number
  deck: string
  label: string
  recallBefore: number
  examRecallAfter: number
  gain: number
  nth: number
}

export interface PrepDayDto {
  date: string
  rest: boolean
  reviews: PrepReviewDto[]
  meanExamRecallAfter: number
}

export interface PrepPlanDto {
  exam: string
  from: string
  targetRecall: number
  days: PrepDayDto[]
  summary: {
    studyDays: number
    restDays: number
    plannedReviews: number
    distinctCards: number
    baseline: number
    planned: number
    belowTarget: number
    seenCards: number
    unseenCards: number
    capacityBound: boolean
    truncated: boolean
    consideredCards: number
  }
  confidence: { level: 'insufficient' | 'low' | 'moderate' | 'good'; reason: string }
  options: {
    perDay: number
    minGain: number
    maxReviewsPerCard: number
    maxCards: number
    restWeekdays: number[]
  }
  expired: boolean
  assumptions: string[]
}

export interface ExamPrepResponse {
  ok: boolean
  title?: string
  plan?: PrepPlanDto
  note?: string
  exams?: { id: number; title: string; date: string; courseId: number | null }[]
}

export const pct = (n: number): string => `${Math.round(n * 100)}%`

/** The most cards the review page accepts in one explicit list. */
export const MAX_LIST = 100

/** Link that opens the review queue on exactly these cards, in this order. */
export function reviewHref(cardIds: readonly number[]): string {
  return `/review?cardIds=${cardIds.slice(0, MAX_LIST).join(',')}`
}

/**
 * The headline sentence. The model name, the "if every review is made and
 * remembered" condition, both dates and the baseline sit inside the sentence so
 * a screenshot of it cannot be read as a forecast or a promise.
 */
export function headline(plan: PrepPlanDto, examDate: string): string {
  const s = plan.summary
  return `The model estimates, as of ${plan.from}, that average recall on ${examDate} would move from ${pct(s.baseline)} if you review nothing more to ${pct(s.planned)} if you make all ${s.plannedReviews} planned reviews and remember each card.`
}
