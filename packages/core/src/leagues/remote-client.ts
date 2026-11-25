/**
 * Client-side flush engine for signed league mutations.
 *
 * INACTIVE GROUNDWORK. Ties the offline sync queue to a signer and a
 * transport. Everything environmental is injected (clock, nonce source,
 * transport, signer), so the same code runs in the web handler, the CLI and
 * tests. It never touches storage: it takes a queue plus a sequence tracker
 * and returns the next ones; the caller persists both.
 *
 * What a flush does, per due lane head:
 *  1. reserve the next sequence number for that league,
 *  2. sign a fresh envelope (fresh timestamp and nonce, so a retry after a
 *     long backoff is never rejected as stale and never replays a nonce),
 *  3. send it and translate the reply into a SendOutcome,
 *  4. on bad_seq, adopt the authority's last accepted sequence for this
 *     signer (when the reply carries it) so the next try lands.
 *
 * Signatures prove the holder of a device key authored the message. They do
 * not prove the person answered without help; see docs/leagues-remote-threat-model.md.
 */
import { signLeagueMutation, type LeagueSigner } from './signed'
import type { SignedEnvelope } from '../online'
import {
  dueItems,
  nextWakeAt,
  recordOutcome,
  type SendOutcome,
  type SyncItem,
  type SyncQueue,
} from './sync-queue'

/** Per-league next sequence numbers (what the client will sign next). */
export interface SeqTracker {
  next: Record<string, number>
}

export function createSeqTracker(): SeqTracker {
  return { next: {} }
}

export function peekSeq(tracker: SeqTracker, leagueId: string): number {
  return tracker.next[leagueId] ?? 1
}

export function reserveSeq(
  tracker: SeqTracker,
  leagueId: string,
): { seq: number; tracker: SeqTracker } {
  const seq = peekSeq(tracker, leagueId)
  return { seq, tracker: { next: { ...tracker.next, [leagueId]: seq + 1 } } }
}

/**
 * Adopt the authority's view after a bad_seq: the next sequence must be
 * greater than the last one it accepted. Never moves backwards.
 */
export function adoptAuthoritySeq(
  tracker: SeqTracker,
  leagueId: string,
  authorityLastSeq: number,
): SeqTracker {
  if (!Number.isInteger(authorityLastSeq) || authorityLastSeq < 0) return tracker
  const wanted = authorityLastSeq + 1
  if (wanted <= peekSeq(tracker, leagueId)) return tracker
  return { next: { ...tracker.next, [leagueId]: wanted } }
}

export type TransportReply =
  { kind: 'http'; status: number; body: unknown } | { kind: 'network-error' }

export interface FlushDeps {
  signer: LeagueSigner
  leagueId: string
  now: () => number
  newNonce: () => string
  send: (leagueId: string, envelope: SignedEnvelope) => Promise<TransportReply>
}

export interface FlushResult {
  queue: SyncQueue
  tracker: SeqTracker
  /** Items this flush attempted, with the outcome recorded for each. */
  attempted: Array<{ id: string; outcome: SendOutcome }>
  /** When the caller should flush again, or null when nothing is pending. */
  nextWakeAt: number | null
}

/** Read the machine code out of an authority reply body, if any. */
function codeOf(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'code' in body) {
    const c = (body as { code?: unknown }).code
    if (typeof c === 'string' && c.length > 0 && c.length <= 64) return c
  }
  return undefined
}

function lastSeqOf(body: unknown): number | undefined {
  if (body && typeof body === 'object' && 'lastSeq' in body) {
    const s = (body as { lastSeq?: unknown }).lastSeq
    if (typeof s === 'number' && Number.isInteger(s) && s >= 0) return s
  }
  return undefined
}

/** Translate one transport reply into the queue's outcome vocabulary. */
export function outcomeFromReply(reply: TransportReply): {
  outcome: SendOutcome
  authorityLastSeq?: number
} {
  if (reply.kind === 'network-error') return { outcome: { kind: 'transport-error' } }
  const { status, body } = reply
  if (status >= 200 && status < 300) return { outcome: { kind: 'accepted' } }
  if (status >= 500 || status === 429 || status === 408) {
    return { outcome: { kind: 'transport-error', code: codeOf(body) ?? `http_${status}` } }
  }
  // 503 "not enabled" is covered above: the authority is simply unavailable.
  const code = codeOf(body) ?? `http_${status}`
  return { outcome: { kind: 'rejected', code }, authorityLastSeq: lastSeqOf(body) }
}

/**
 * Send every due lane head once. Lanes run one item per flush so a long queue
 * cannot hammer the authority; call again at `nextWakeAt`.
 */
export async function flushQueue(
  queue: SyncQueue,
  tracker: SeqTracker,
  deps: FlushDeps,
): Promise<FlushResult> {
  let q = queue
  let t = tracker
  const attempted: FlushResult['attempted'] = []

  const due: SyncItem[] = dueItems(q, deps.now())
  for (const item of due) {
    const reserved = reserveSeq(t, deps.leagueId)
    t = reserved.tracker
    let reply: TransportReply
    try {
      const envelope = await signLeagueMutation({
        signer: deps.signer,
        leagueId: deps.leagueId,
        seq: reserved.seq,
        mutation: item.mutation,
        timestamp: deps.now(),
        nonce: deps.newNonce(),
      })
      reply = await deps.send(deps.leagueId, envelope)
    } catch {
      reply = { kind: 'network-error' }
    }
    const { outcome, authorityLastSeq } = outcomeFromReply(reply)
    if (
      outcome.kind === 'rejected' &&
      outcome.code === 'bad_seq' &&
      authorityLastSeq !== undefined
    ) {
      t = adoptAuthoritySeq(t, deps.leagueId, authorityLastSeq)
    }
    // A transport failure may hide an accepted request (lost reply), so the
    // reserved sequence number is never handed back: the authority only needs
    // sequences to increase, and gaps are fine.
    q = recordOutcome(q, item.id, outcome, deps.now())
    attempted.push({ id: item.id, outcome })
  }

  return { queue: q, tracker: t, attempted, nextWakeAt: nextWakeAt(q) }
}
