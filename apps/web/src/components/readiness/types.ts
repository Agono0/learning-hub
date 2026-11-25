/** Shapes returned by GET /api/readiness (mirrors core's ReadinessReport, JSON-safe). */
export interface GroupRow {
  key: string
  label: string
  cards: number
  unseen: number
  baselineRecall: number
  plannedRecall: number
  atTarget: number
}

export type PlanKind = 'none' | 'on-schedule' | 'capacity'

export interface ReportDto {
  target: { title: string; date: string }
  daysLeft: number
  expired: boolean
  targetRecall: number
  plan: { kind: PlanKind; perDay?: number }
  overall: GroupRow
  decks: GroupRow[]
  skills: GroupRow[]
  confidence: {
    level: 'insufficient' | 'low' | 'moderate' | 'good'
    reason: string
    seenCards: number
  }
  assumptions: string[]
}

export interface GainRow {
  cardId: number
  deckId: number
  baseline: number
  afterReview: number
  gain: number
}

export interface ReadinessResponse {
  ok: boolean
  report?: ReportDto
  review?: {
    budget: number
    meanRecallBefore: number
    meanRecallAfter: number
    reviewsNeededForTarget: number | null
    top: GainRow[]
    assumptions: string[]
  }
  exams?: { id: number; title: string; date: string; courseId: number | null }[]
}

export const pct = (n: number): string => `${Math.round(n * 100)}%`
