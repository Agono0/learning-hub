import { assessConfidence, groupBy, summarizeGroup } from './aggregate'
import { forecastCards, type SimulationOptions } from './forecast'
import {
  DEFAULT_TARGET_RECALL,
  READINESS_ASSUMPTIONS,
  MS_PER_DAY,
  type ExamTarget,
  type ReadinessCard,
  type ReadinessReport,
  type ReviewPlan,
} from './model'

export interface ReportInput {
  target: ExamTarget
  cards: readonly ReadinessCard[]
  now: Date
  plan?: ReviewPlan
  targetRecall?: number
  deckLabel?: (deckId: number) => string
  skillLabel?: (skillId: number) => string
  sim?: SimulationOptions
}

/** Parse an exam date. A bare date means the end of that day (UTC), so the exam day itself still counts. */
export function parseExamDate(raw: string): Date | null {
  if (!raw) return null
  const bare = /^\d{4}-\d{2}-\d{2}$/.test(raw)
  const d = new Date(bare ? `${raw}T23:59:59.000Z` : raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Build the full readiness report for one exam. Baseline (no more reviews) and
 * planned (a hypothetical review plan) are always reported side by side; the
 * planned figure is a scenario, not a promise that the reviews will happen.
 */
export async function buildReadinessReport(input: ReportInput): Promise<ReadinessReport | null> {
  const exam = parseExamDate(input.target.date)
  if (!exam) return null
  const targetRecall = Math.min(0.99, Math.max(0.5, input.targetRecall ?? DEFAULT_TARGET_RECALL))
  const plan: ReviewPlan = input.plan ?? { kind: 'on-schedule' }
  const forecasts = await forecastCards(input.cards, input.now, exam, plan, input.sim)
  const deckLabel = input.deckLabel ?? ((id: number) => `Deck ${id}`)
  const skillLabel = input.skillLabel ?? ((id: number) => `Skill ${id}`)
  const msLeft = exam.getTime() - input.now.getTime()
  return {
    target: input.target,
    asOf: input.now.toISOString(),
    daysLeft: Math.max(0, Math.ceil(msLeft / MS_PER_DAY)),
    targetRecall,
    plan,
    overall: summarizeGroup('all', 'All cards', forecasts, targetRecall),
    decks: groupBy(forecasts, (f) => f.deckId, deckLabel, targetRecall),
    skills: groupBy(forecasts, (f) => f.skillId, skillLabel, targetRecall),
    confidence: assessConfidence(input.cards),
    assumptions: [...READINESS_ASSUMPTIONS],
    expired: msLeft <= 0,
  }
}
