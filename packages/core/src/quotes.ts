/**
 * Quotes — deterministic daily pick (stable within one day) and milestone
 * quotes for level-ups / streak records. Seeded hash of YYYY-MM-DD, so the
 * server and any cached client agree without sharing state.
 */
import { dateKeyOf } from './streaks'
import { hashString } from './motivation'

/** Minimal quote shape the pickers work on (DB rows satisfy it). */
export interface QuoteLike {
  id?: number
  text: string
  author: string
  tags?: string[] | null
  context?: string | null
}

/** A quote for the day — FNV-1a of the day key indexes the (sorted) list. */
export function dailyQuote<T extends QuoteLike>(quotes: T[], date: Date | string): T {
  if (quotes.length === 0) throw new Error('dailyQuote: no quotes available')
  const key = dateKeyOf(date)
  const idx = hashString(key) % quotes.length
  return quotes[idx]
}

/**
 * Milestone quotes (level-up, streak record, achievement unlock). Prefers
 * quotes tagged for the moment — discipline / persistence / mastery — and
 * falls back to the whole library. Deterministic per kind so re-renders agree.
 */
export const MILESTONE_TAGS: Record<string, string[]> = {
  'level-up': ['mastery', 'discipline'],
  'streak': ['persistence', 'discipline'],
  'achievement': ['mastery', 'persistence'],
  'comeback': ['persistence', 'learning'],
}

/** Deterministic quote for a milestone kind, preferring its MILESTONE_TAGS. */
export function milestoneQuote<T extends QuoteLike>(
  quotes: T[],
  kind: 'level-up' | 'streak' | 'achievement' | 'comeback' | string,
): T {
  if (quotes.length === 0) throw new Error('milestoneQuote: no quotes available')
  const preferred = MILESTONE_TAGS[kind] ?? ['discipline', 'persistence']
  const pool = quotes.filter((q) => (q.tags ?? []).some((t) => preferred.includes(t)))
  const from = pool.length > 0 ? pool : quotes
  return from[hashString('milestone:' + kind) % from.length]
}
