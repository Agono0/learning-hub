/**
 * Bounded storage for the league authority's duel table.
 *
 * INACTIVE GROUNDWORK. A Durable Object persists its whole state on every
 * accepted mutation, so the state must stay small. Duels are the only table
 * that grows without bound (the replay log, nonces and rate windows already
 * prune themselves). Points live in the league itself, so dropping an old
 * duel never changes anyone's standing: the record of the match goes, the
 * result it produced stays.
 *
 * Rules, applied after each accepted mutation:
 *  - completed duels are kept for COMPLETED_DUEL_RETENTION_MS after opening,
 *  - open duels that expired are kept for EXPIRED_DUEL_GRACE_MS past expiry
 *    (so a late client can still read "duel_expired" context), then dropped,
 *  - the table never holds more than MAX_DUELS entries: the oldest completed
 *    duels go first, then the oldest expired open ones. Live open duels are
 *    never dropped by the cap.
 */
import type { DuelRuntime } from './authority'

export const COMPLETED_DUEL_RETENTION_MS = 7 * 24 * 60 * 60_000
export const EXPIRED_DUEL_GRACE_MS = 24 * 60 * 60_000
export const MAX_DUELS = 400

export interface PruneReport {
  duels: Record<string, DuelRuntime>
  dropped: string[]
}

export function pruneDuels(
  duels: Record<string, DuelRuntime>,
  now: number,
  maxDuels: number = MAX_DUELS,
): PruneReport {
  const dropped: string[] = []
  const kept: Record<string, DuelRuntime> = {}

  for (const [id, duel] of Object.entries(duels)) {
    const stale =
      duel.status === 'complete'
        ? now - duel.openedAt >= COMPLETED_DUEL_RETENTION_MS
        : now >= duel.expiresAt + EXPIRED_DUEL_GRACE_MS
    if (stale) dropped.push(id)
    else kept[id] = duel
  }

  const over = Object.keys(kept).length - maxDuels
  if (over > 0) {
    // Oldest first; completed before expired-open; live open duels are immune.
    const rank = (d: DuelRuntime): number | null => {
      if (d.status === 'complete') return 0
      if (now >= d.expiresAt) return 1
      return null
    }
    const candidates = Object.values(kept)
      .map((d) => ({ d, r: rank(d) }))
      .filter((x): x is { d: DuelRuntime; r: number } => x.r !== null)
      .sort((a, b) => a.r - b.r || a.d.openedAt - b.d.openedAt || a.d.id.localeCompare(b.d.id))
    for (const { d } of candidates.slice(0, over)) {
      delete kept[d.id]
      dropped.push(d.id)
    }
  }

  return dropped.length === 0 ? { duels, dropped } : { duels: kept, dropped }
}
