/**
 * XP economy — the ONE append-only write path for experience points
 * (AGENTS.md rule 7: "never update XP by hand"; rule 8: `xp_events` is
 * insert-only, which this repo preserves by exporting no update/delete API).
 *
 * Card grades keep flowing through review-service (their composite amount is
 * computed there); every other producer routes through {@link awardXp}.
 * Amounts come from core's XP_REWARDS map — this module never re-derives a
 * number, it only names sources.
 */
import { XP_REWARDS, type XPSource } from '@learning-hub/core'
import { xpEvents } from '../schema'
import type { Transaction } from '../transaction'

/**
 * Canonical default amount per XP source, all derived from core's XP_REWARDS
 * (single source of truth — rebalancing happens there + in the golden tests,
 * never here). Sources whose amount is computed at runtime (`boss` bounties,
 * per-row quest rewards) are not listed: they MUST pass `amount` explicitly.
 */
export const XP_SOURCES = {
  review: XP_REWARDS.review,
  lesson: XP_REWARDS.lesson,
  teachback: XP_REWARDS.teachback,
  focus: XP_REWARDS.focusSession,
  quest: XP_REWARDS.quest,
  habit: XP_REWARDS.habit,
  journal: XP_REWARDS.journal,
  idea: XP_REWARDS.ideaEvolve,
  achievement: XP_REWARDS.achievement,
  debate: XP_REWARDS.debate,
  league: XP_REWARDS.leagueRoundWin,
} as const

/** Sources with a canonical default amount ('boss' and any future dynamic source live only in XPSource). */
export type CanonicalXpSource = keyof typeof XP_SOURCES

/** Anything that can insert rows: a `withTransaction` handle or the db itself. */
export type XpWriter = Pick<Transaction, 'insert'>

export interface AwardXpInput {
  source: XPSource
  /**
   * Explicit amount — REQUIRED for dynamic sources (e.g. `boss.rewardXp`,
   * a quest row's `xpReward`) and for composite amounts (review recall bonus).
   * Justify the override with a comment at the call site.
   */
  amount?: number
  /** Free-form event metadata (shape documented at the call site). */
  meta?: Record<string, unknown>
  /** Wall-clock ms for the row; defaults to the schema's now() default. */
  atMs?: number
}

/**
 * Append one `xp_events` row (rule 8). The canonical XP path for every
 * non-grade producer; must be called with a transaction handle when it is
 * part of a multi-row write (rule 6).
 * @throws when `source` has no canonical amount and none was passed.
 */
export function awardXp(writer: XpWriter, input: AwardXpInput): void {
  const amount =
    input.amount ??
    (input.source in XP_SOURCES ? XP_SOURCES[input.source as CanonicalXpSource] : undefined)
  if (!Number.isFinite(amount) || amount === undefined || amount <= 0) {
    throw new Error(
      `awardXp: source "${input.source}" has no canonical amount — pass an explicit amount for dynamic sources`,
    )
  }
  writer
    .insert(xpEvents)
    .values({
      source: input.source,
      amount,
      meta: input.meta ?? {},
      ...(input.atMs !== undefined ? { createdAt: new Date(input.atMs).toISOString() } : {}),
    })
    .run()
}
