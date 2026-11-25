/**
 * Offline sync queue for signed league mutations (lh-league-sync/v1).
 *
 * INACTIVE GROUNDWORK. A device that is offline, or talking to a flaky
 * authority, keeps unsent mutations here and replays them in order. The queue
 * is pure state: the caller persists it, supplies the clock and performs the
 * network call. Signing happens at send time (a stale timestamp would fail the
 * authority's clock window), so the queue stores unsigned mutations only.
 *
 * Rules the queue enforces:
 *  - Mutations that touch the same duel (or the same league-wide action) are
 *    ordered: only the head of each ordering lane is due.
 *  - Transient failures back off exponentially up to a cap, then die after
 *    MAX_ATTEMPTS so a poison item cannot block its lane forever.
 *  - Permanent rejections (the authority understood and said no) drop the item
 *    and everything queued behind it in the same lane that can no longer make
 *    sense, instead of retrying a certain failure.
 *  - A bad_seq verdict is not the item's fault: it retries without counting
 *    an attempt, after the caller bumps its sequence counter.
 */
import { z } from 'zod'
import { LeagueMutationSchema, type LeagueMutation } from './signed-schemas'

export const SYNC_QUEUE_SCHEMA = 'lh-league-sync/v1'

export const MAX_ATTEMPTS = 8
export const BASE_BACKOFF_MS = 2_000
export const MAX_BACKOFF_MS = 10 * 60_000
export const MAX_QUEUE_ITEMS = 200

export type SyncItemStatus = 'pending' | 'sent' | 'rejected' | 'dead'

export interface SyncItem {
  id: string
  /** Lane key: items sharing a lane are sent strictly in order. */
  lane: string
  mutation: LeagueMutation
  createdAt: number
  attempts: number
  nextAttemptAt: number
  status: SyncItemStatus
  /** Last verdict code from the authority, or a local transport code. */
  lastCode: string | null
}

export interface SyncQueue {
  schema: typeof SYNC_QUEUE_SCHEMA
  items: SyncItem[]
  /** Monotonic counter for generated item ids. */
  counter: number
}

export function createSyncQueue(): SyncQueue {
  return { schema: SYNC_QUEUE_SCHEMA, items: [], counter: 0 }
}

/** Ordering lane for a mutation. Duel actions are ordered per duel. */
export function laneFor(mutation: LeagueMutation): string {
  switch (mutation.type) {
    case 'duel-open':
    case 'duel-start':
    case 'duel-answer':
      return `duel:${mutation.duelId}`
    case 'join':
    case 'leave':
    case 'rename':
    case 'invite-create':
    case 'invite-revoke':
    case 'invite-policy':
    case 'remove-member':
    case 'unblock-member':
      return 'membership'
    case 'close-round':
      return 'round'
  }
}

/** Codes the authority returns that no amount of retrying can fix. */
const PERMANENT_CODES = new Set([
  'bad_envelope',
  'bad_payload',
  'wrong_domain',
  'league_mismatch',
  'already_member',
  'league_full',
  'not_member',
  'self_duel',
  'opponent_not_member',
  'duel_exists',
  'too_many_open_duels',
  'duel_unknown',
  'not_in_duel',
  'duel_expired',
  'duel_complete',
  'side_already_started',
  'side_finished',
  'out_of_order',
  'season_complete',
  'invite_required',
  'invite_invalid',
  'invite_exists',
  'too_many_invites',
  'invite_unknown',
  'not_invite_owner',
  'not_founder',
  'blocked',
  'target_not_member',
  'cannot_remove_self',
  'not_blocked',
  'block_list_full',
])

/** Codes that mean "try again later": the item itself may still be fine. */
const TRANSIENT_CODES = new Set([
  'unreachable',
  'storage_failed',
  'rate_limited',
  'round_not_due',
  'side_not_started',
  'stale_timestamp',
  'future_timestamp',
])

export type SendOutcome =
  | { kind: 'accepted' }
  | { kind: 'rejected'; code: string }
  | { kind: 'transport-error'; code?: string }

export type Classification = 'accepted' | 'permanent' | 'transient' | 'resync'

export function classifyOutcome(outcome: SendOutcome): Classification {
  if (outcome.kind === 'accepted') return 'accepted'
  if (outcome.kind === 'transport-error') return 'transient'
  if (outcome.code === 'bad_seq') return 'resync'
  if (outcome.code === 'replayed_nonce') return 'transient'
  if (PERMANENT_CODES.has(outcome.code)) return 'permanent'
  if (TRANSIENT_CODES.has(outcome.code)) return 'transient'
  // An unknown verdict is treated as transient: dropping player work on a
  // code this version has never heard of would be the worse mistake.
  return 'transient'
}

/** Deterministic exponential backoff for attempt number `attempts` (1-based). */
export function backoffMs(attempts: number): number {
  const exp = BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1)
  return Math.min(MAX_BACKOFF_MS, exp)
}

export class SyncQueueFullError extends Error {
  constructor() {
    super('sync queue is full')
    this.name = 'SyncQueueFullError'
  }
}

function openItems(queue: SyncQueue): SyncItem[] {
  return queue.items.filter((i) => i.status === 'pending')
}

/** Add a mutation. Returns the new queue and the item id. */
export function enqueue(
  queue: SyncQueue,
  mutation: LeagueMutation,
  now: number,
): { queue: SyncQueue; id: string } {
  if (openItems(queue).length >= MAX_QUEUE_ITEMS) throw new SyncQueueFullError()
  const counter = queue.counter + 1
  const id = `sq-${counter}`
  const item: SyncItem = {
    id,
    lane: laneFor(mutation),
    mutation,
    createdAt: now,
    attempts: 0,
    nextAttemptAt: now,
    status: 'pending',
    lastCode: null,
  }
  return { queue: { ...queue, counter, items: [...queue.items, item] }, id }
}

/**
 * Items that may be sent right now: the first pending item of each lane, if
 * its retry time has come. Oldest lane head first, so ordering across lanes is
 * stable.
 */
export function dueItems(queue: SyncQueue, now: number): SyncItem[] {
  const seen = new Set<string>()
  const due: SyncItem[] = []
  for (const item of queue.items) {
    if (item.status !== 'pending') continue
    if (seen.has(item.lane)) continue
    seen.add(item.lane)
    if (item.nextAttemptAt <= now) due.push(item)
  }
  return due
}

/** Earliest time any lane head becomes due, or null when nothing is pending. */
export function nextWakeAt(queue: SyncQueue): number | null {
  const seen = new Set<string>()
  let earliest: number | null = null
  for (const item of queue.items) {
    if (item.status !== 'pending' || seen.has(item.lane)) continue
    seen.add(item.lane)
    if (earliest === null || item.nextAttemptAt < earliest) earliest = item.nextAttemptAt
  }
  return earliest
}

/**
 * A join's invite code is a bearer secret. Once the item is settled it has no
 * further use, so drop it rather than keep it in the local queue.
 */
function scrubSettled(queue: SyncQueue): SyncQueue {
  let changed = false
  const items = queue.items.map((i) => {
    if (i.status === 'pending' || i.mutation.type !== 'join' || i.mutation.invite === undefined) {
      return i
    }
    changed = true
    const { invite: _dropped, ...rest } = i.mutation
    void _dropped
    return { ...i, mutation: rest }
  })
  return changed ? { ...queue, items } : queue
}

/** Record the result of sending one item. Unknown ids leave the queue unchanged. */
export function recordOutcome(
  queue: SyncQueue,
  id: string,
  outcome: SendOutcome,
  now: number,
): SyncQueue {
  return scrubSettled(recordOutcomeRaw(queue, id, outcome, now))
}

function recordOutcomeRaw(
  queue: SyncQueue,
  id: string,
  outcome: SendOutcome,
  now: number,
): SyncQueue {
  const target = queue.items.find((i) => i.id === id)
  if (!target || target.status !== 'pending') return queue
  const code =
    outcome.kind === 'accepted'
      ? 'ok'
      : outcome.kind === 'rejected'
        ? outcome.code
        : (outcome.code ?? 'unreachable')

  switch (classifyOutcome(outcome)) {
    case 'accepted':
      return mapItem(queue, id, { status: 'sent', lastCode: code })

    case 'resync':
      // Not the item's fault: retry at once, attempts unchanged.
      return mapItem(queue, id, { nextAttemptAt: now, lastCode: code })

    case 'permanent': {
      // The rejected item and any later item in its lane that depended on it.
      const dependents = new Set<string>()
      let after = false
      for (const i of queue.items) {
        if (i.id === id) after = true
        else if (after && i.lane === target.lane && i.status === 'pending') dependents.add(i.id)
      }
      return {
        ...queue,
        items: queue.items.map((i) => {
          if (i.id === id) return { ...i, status: 'rejected', lastCode: code }
          if (dependents.has(i.id) && dependsOn(target, i)) {
            return { ...i, status: 'rejected', lastCode: `blocked_by:${code}` }
          }
          return i
        }),
      }
    }

    case 'transient': {
      const attempts = target.attempts + 1
      if (attempts >= MAX_ATTEMPTS)
        return mapItem(queue, id, { status: 'dead', attempts, lastCode: code })
      return mapItem(queue, id, {
        attempts,
        nextAttemptAt: now + backoffMs(attempts),
        lastCode: code,
      })
    }
  }
}

/**
 * A later item depends on a rejected one when the rejected item set up state
 * the later one needs. Opening or starting a duel gates its answers; a
 * rejected answer gates the answers after it (they are out of order without it).
 */
function dependsOn(rejected: SyncItem, later: SyncItem): boolean {
  const r = rejected.mutation.type
  const l = later.mutation.type
  if (r === 'duel-open') return true
  // A refused join leaves every later membership action without a member.
  if (r === 'join') return true
  if (r === 'duel-start') return l === 'duel-answer'
  if (r === 'duel-answer') return l === 'duel-answer'
  return false
}

function mapItem(queue: SyncQueue, id: string, patch: Partial<SyncItem>): SyncQueue {
  return { ...queue, items: queue.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }
}

/** Drop finished items (sent, rejected, dead) older than `keepMs`; keep pending ones. */
export function pruneQueue(queue: SyncQueue, now: number, keepMs = 24 * 60 * 60_000): SyncQueue {
  const items = queue.items.filter((i) => i.status === 'pending' || now - i.createdAt < keepMs)
  return items.length === queue.items.length ? queue : { ...queue, items }
}

export interface SyncQueueSummary {
  pending: number
  sent: number
  rejected: number
  dead: number
  nextWakeAt: number | null
}

export function summarizeQueue(queue: SyncQueue): SyncQueueSummary {
  const count = (s: SyncItemStatus) => queue.items.filter((i) => i.status === s).length
  return {
    pending: count('pending'),
    sent: count('sent'),
    rejected: count('rejected'),
    dead: count('dead'),
    nextWakeAt: nextWakeAt(queue),
  }
}

/** Schema for a queue read back from storage: corrupt rows must not poison a flush. */
export const SyncQueueSchema = z.object({
  schema: z.literal(SYNC_QUEUE_SCHEMA),
  counter: z.number().int().nonnegative(),
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        lane: z.string().min(1).max(120),
        mutation: LeagueMutationSchema,
        createdAt: z.number().int().nonnegative(),
        attempts: z.number().int().nonnegative().max(MAX_ATTEMPTS),
        nextAttemptAt: z.number().int().nonnegative(),
        status: z.enum(['pending', 'sent', 'rejected', 'dead']),
        lastCode: z.string().max(80).nullable(),
      }),
    )
    .max(MAX_QUEUE_ITEMS * 2),
})
