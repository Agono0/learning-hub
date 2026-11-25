import type { PlannerResult } from '@learning-hub/core'

export type { PlannerResult }

export interface PlannerResponse {
  ok: boolean
  result: PlannerResult
  cardsTruncated: boolean
}

export const APPLIED_KEY = 'lh-retention-planner-applied'

export interface AppliedRecord {
  applied: number
  previous: number
  at: string
}

export function pct(v: number): string {
  return `${Math.round(v * 1000) / 10}%`
}

export function formatMinutes(v: number): string {
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} min`
}
