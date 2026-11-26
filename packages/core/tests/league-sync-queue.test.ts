import { describe, expect, it } from 'vitest'
import {
  BASE_BACKOFF_MS,
  MAX_ATTEMPTS,
  MAX_BACKOFF_MS,
  MAX_QUEUE_ITEMS,
  SyncQueueFullError,
  backoffMs,
  classifyOutcome,
  createSyncQueue,
  dueItems,
  enqueue,
  laneFor,
  nextWakeAt,
  pruneQueue,
  recordOutcome,
  summarizeQueue,
  type LeagueMutation,
  type SyncQueue,
} from '../src/leagues'

const T = 1_000_000

const answer = (duelId: string, promptId: string): LeagueMutation => ({
  type: 'duel-answer',
  duelId,
  promptId,
  answer: 'x',
})
const start = (duelId: string): LeagueMutation => ({ type: 'duel-start', duelId })
const open = (duelId: string): LeagueMutation => ({
  type: 'duel-open',
  duelId,
  opponent: 'usr_b',
  prompts: [{ id: 'p1', question: 'q', answers: ['x'] }],
})

function add(queue: SyncQueue, m: LeagueMutation, at = T): { queue: SyncQueue; id: string } {
  return enqueue(queue, m, at)
}

describe('laneFor', () => {
  it('orders per duel and keeps other actions in their own lanes', () => {
    expect(laneFor(open('d1'))).toBe('duel:d1')
    expect(laneFor(start('d1'))).toBe('duel:d1')
    expect(laneFor(answer('d1', 'p1'))).toBe('duel:d1')
    expect(laneFor(answer('d2', 'p1'))).toBe('duel:d2')
    expect(laneFor({ type: 'join', alias: 'A' })).toBe('membership')
    expect(laneFor({ type: 'close-round' })).toBe('round')
  })
})

describe('classifyOutcome', () => {
  it('maps verdicts to retry behaviour', () => {
    expect(classifyOutcome({ kind: 'accepted' })).toBe('accepted')
    expect(classifyOutcome({ kind: 'transport-error' })).toBe('transient')
    expect(classifyOutcome({ kind: 'rejected', code: 'bad_seq' })).toBe('resync')
    expect(classifyOutcome({ kind: 'rejected', code: 'duel_complete' })).toBe('permanent')
    expect(classifyOutcome({ kind: 'rejected', code: 'rate_limited' })).toBe('transient')
    expect(classifyOutcome({ kind: 'rejected', code: 'round_not_due' })).toBe('transient')
    expect(classifyOutcome({ kind: 'rejected', code: 'replayed_nonce' })).toBe('transient')
  })

  it('treats a verdict it has never heard of as transient, not as a reason to drop work', () => {
    expect(classifyOutcome({ kind: 'rejected', code: 'some_future_code' })).toBe('transient')
  })

  it('treats a bad signature as transient (clock or key change may heal), not permanent', () => {
    expect(classifyOutcome({ kind: 'rejected', code: 'bad_signature' })).toBe('transient')
  })
})

describe('backoffMs', () => {
  it('doubles each attempt and caps', () => {
    expect(backoffMs(1)).toBe(BASE_BACKOFF_MS)
    expect(backoffMs(2)).toBe(BASE_BACKOFF_MS * 2)
    expect(backoffMs(3)).toBe(BASE_BACKOFF_MS * 4)
    expect(backoffMs(30)).toBe(MAX_BACKOFF_MS)
    expect(backoffMs(0)).toBe(BASE_BACKOFF_MS)
  })
})

describe('enqueue and dueItems', () => {
  it('assigns increasing ids and makes the first item due at once', () => {
    let q = createSyncQueue()
    const a = add(q, open('d1'))
    q = a.queue
    const b = add(q, start('d1'))
    q = b.queue
    expect(a.id).toBe('sq-1')
    expect(b.id).toBe('sq-2')
    expect(dueItems(q, T).map((i) => i.id)).toEqual(['sq-1'])
  })

  it('releases the head of each lane independently', () => {
    let q = createSyncQueue()
    q = add(q, open('d1')).queue
    q = add(q, open('d2')).queue
    q = add(q, start('d1')).queue
    q = add(q, { type: 'close-round' }).queue
    expect(dueItems(q, T).map((i) => i.lane)).toEqual(['duel:d1', 'duel:d2', 'round'])
  })

  it('blocks a lane while its head waits for a retry, without blocking other lanes', () => {
    let q = createSyncQueue()
    const a = add(q, open('d1'))
    q = a.queue
    q = add(q, open('d2')).queue
    q = recordOutcome(q, a.id, { kind: 'transport-error' }, T)
    const due = dueItems(q, T + 10).map((i) => i.lane)
    expect(due).toEqual(['duel:d2'])
    expect(dueItems(q, T + BASE_BACKOFF_MS).map((i) => i.lane)).toEqual(['duel:d1', 'duel:d2'])
  })

  it('refuses new items past the cap but frees room as items finish', () => {
    let q = createSyncQueue()
    for (let i = 0; i < MAX_QUEUE_ITEMS; i++) q = add(q, answer(`d${i}`, 'p1')).queue
    expect(() => add(q, answer('dx', 'p1'))).toThrow(SyncQueueFullError)
    q = recordOutcome(q, 'sq-1', { kind: 'accepted' }, T)
    expect(() => add(q, answer('dx', 'p1'))).not.toThrow()
  })
})

describe('recordOutcome', () => {
  it('marks an accepted item sent and releases the next item in its lane', () => {
    let q = createSyncQueue()
    const a = add(q, open('d1'))
    q = a.queue
    q = add(q, start('d1')).queue
    q = recordOutcome(q, a.id, { kind: 'accepted' }, T)
    expect(q.items[0]!.status).toBe('sent')
    expect(dueItems(q, T).map((i) => i.id)).toEqual(['sq-2'])
  })

  it('backs off a transient failure and counts the attempt', () => {
    let q = createSyncQueue()
    const a = add(q, open('d1'))
    q = recordOutcome(a.queue, a.id, { kind: 'rejected', code: 'rate_limited' }, T)
    const item = q.items[0]!
    expect(item.attempts).toBe(1)
    expect(item.nextAttemptAt).toBe(T + BASE_BACKOFF_MS)
    expect(item.lastCode).toBe('rate_limited')
    q = recordOutcome(q, a.id, { kind: 'rejected', code: 'rate_limited' }, T + 5_000)
    expect(q.items[0]!.nextAttemptAt).toBe(T + 5_000 + BASE_BACKOFF_MS * 2)
  })

  it('kills a poison item after MAX_ATTEMPTS so its lane unblocks', () => {
    let q = createSyncQueue()
    const a = add(q, open('d1'))
    q = add(a.queue, start('d1')).queue
    let now = T
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      q = recordOutcome(q, a.id, { kind: 'transport-error' }, now)
      now += MAX_BACKOFF_MS
    }
    expect(q.items[0]!.status).toBe('dead')
    expect(dueItems(q, now).map((i) => i.id)).toEqual(['sq-2'])
  })

  it('retries a bad_seq verdict immediately without spending an attempt', () => {
    let q = createSyncQueue()
    const a = add(q, open('d1'))
    q = recordOutcome(a.queue, a.id, { kind: 'rejected', code: 'bad_seq' }, T + 50)
    expect(q.items[0]!.attempts).toBe(0)
    expect(q.items[0]!.nextAttemptAt).toBe(T + 50)
    expect(q.items[0]!.status).toBe('pending')
  })

  it('drops a permanently rejected duel-open together with its dependent answers', () => {
    let q = createSyncQueue()
    const a = add(q, open('d1'))
    q = a.queue
    q = add(q, start('d1')).queue
    q = add(q, answer('d1', 'p1')).queue
    q = add(q, open('d2')).queue
    q = recordOutcome(q, a.id, { kind: 'rejected', code: 'opponent_not_member' }, T)
    const status = Object.fromEntries(q.items.map((i) => [i.id, i.status]))
    expect(status).toEqual({
      'sq-1': 'rejected',
      'sq-2': 'rejected',
      'sq-3': 'rejected',
      'sq-4': 'pending',
    })
    expect(q.items[1]!.lastCode).toBe('blocked_by:opponent_not_member')
  })

  it('drops later answers after a permanently rejected answer, but not the lane head before it', () => {
    let q = createSyncQueue()
    q = add(q, answer('d1', 'p1')).queue
    q = add(q, answer('d1', 'p2')).queue
    q = add(q, answer('d1', 'p3')).queue
    q = recordOutcome(q, 'sq-1', { kind: 'accepted' }, T)
    q = recordOutcome(q, 'sq-2', { kind: 'rejected', code: 'out_of_order' }, T)
    expect(q.items.map((i) => i.status)).toEqual(['sent', 'rejected', 'rejected'])
  })

  it('a permanent rejection of a join does not touch other lanes', () => {
    let q = createSyncQueue()
    const j = add(q, { type: 'join', alias: 'A' })
    q = add(j.queue, open('d1')).queue
    q = recordOutcome(q, j.id, { kind: 'rejected', code: 'already_member' }, T)
    expect(q.items.map((i) => i.status)).toEqual(['rejected', 'pending'])
  })

  it('ignores unknown ids and finished items', () => {
    let q = createSyncQueue()
    const a = add(q, open('d1'))
    q = recordOutcome(a.queue, a.id, { kind: 'accepted' }, T)
    expect(recordOutcome(q, 'sq-99', { kind: 'accepted' }, T)).toBe(q)
    expect(recordOutcome(q, a.id, { kind: 'transport-error' }, T)).toBe(q)
  })

  it('does not mutate the input queue', () => {
    let q = createSyncQueue()
    const a = add(q, open('d1'))
    q = a.queue
    const before = JSON.stringify(q)
    recordOutcome(q, a.id, { kind: 'transport-error' }, T)
    expect(JSON.stringify(q)).toBe(before)
  })
})

describe('nextWakeAt and summary', () => {
  it('reports the earliest lane-head retry time, or null when idle', () => {
    let q = createSyncQueue()
    expect(nextWakeAt(q)).toBeNull()
    const a = add(q, open('d1'))
    q = add(a.queue, open('d2'), T + 100).queue
    q = recordOutcome(q, a.id, { kind: 'transport-error' }, T)
    expect(nextWakeAt(q)).toBe(T + 100)
    q = recordOutcome(q, 'sq-2', { kind: 'accepted' }, T)
    expect(nextWakeAt(q)).toBe(T + BASE_BACKOFF_MS)
  })

  it('counts items by status', () => {
    let q = createSyncQueue()
    q = add(q, open('d1')).queue
    q = add(q, open('d2')).queue
    q = add(q, open('d3')).queue
    q = recordOutcome(q, 'sq-1', { kind: 'accepted' }, T)
    q = recordOutcome(q, 'sq-2', { kind: 'rejected', code: 'duel_exists' }, T)
    expect(summarizeQueue(q)).toMatchObject({ pending: 1, sent: 1, rejected: 1, dead: 0 })
  })
})

describe('pruneQueue', () => {
  it('drops old finished items and always keeps pending ones', () => {
    let q = createSyncQueue()
    q = add(q, open('d1'), T).queue
    q = add(q, open('d2'), T).queue
    q = recordOutcome(q, 'sq-1', { kind: 'accepted' }, T)
    const later = T + 25 * 60 * 60_000
    const pruned = pruneQueue(q, later)
    expect(pruned.items.map((i) => i.id)).toEqual(['sq-2'])
    expect(pruneQueue(q, T + 1000)).toBe(q)
  })
})

describe('membership items in the queue', () => {
  const CODE = 'k'.repeat(32)
  const digest = 'cd'.repeat(32)

  it('keeps every membership action in one ordered lane', () => {
    for (const m of [
      { type: 'leave' },
      { type: 'rename', alias: 'A' },
      { type: 'invite-create', digest, maxUses: 1, ttlMs: 120_000 },
      { type: 'invite-revoke', digest },
      { type: 'invite-policy', required: true },
      { type: 'remove-member', target: 'usr_bo' },
      { type: 'unblock-member', target: 'usr_bo' },
      { type: 'transfer-founder', target: 'usr_bo' },
    ] as LeagueMutation[]) {
      expect(laneFor(m)).toBe('membership')
    }
  })

  it('classifies the new refusal codes as permanent', () => {
    for (const code of [
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
    ]) {
      expect(classifyOutcome({ kind: 'rejected', code })).toBe('permanent')
    }
  })

  it('a refused remove-member is dropped and the next membership item still waits its turn', () => {
    let q = add(createSyncQueue(), { type: 'remove-member', target: 'usr_bo' }).queue
    const first = q.items[0]!.id
    q = recordOutcome(q, first, { kind: 'rejected', code: 'not_founder' }, T)
    expect(q.items[0]!.status).toBe('rejected')
    expect(q.items[0]!.lastCode).toBe('not_founder')
    const next = add(q, { type: 'unblock-member', target: 'usr_bo' })
    expect(dueItems(next.queue, T + 10_000).map((i) => i.id)).toContain(next.id)
  })

  it('keeps the invite code while pending and scrubs it once accepted', () => {
    const { queue, id } = add(createSyncQueue(), { type: 'join', alias: 'Bo', invite: CODE })
    expect(JSON.stringify(queue)).toContain(CODE)
    const settled = recordOutcome(queue, id, { kind: 'accepted' }, T)
    expect(settled.items[0]!.status).toBe('sent')
    expect(JSON.stringify(settled)).not.toContain(CODE)
    expect(settled.items[0]!.mutation).toEqual({ type: 'join', alias: 'Bo' })
  })

  it('scrubs the invite code when the join is rejected, and blocks later membership items', () => {
    let q = add(createSyncQueue(), { type: 'join', alias: 'Bo', invite: CODE }).queue
    const second = add(q, { type: 'rename', alias: 'Bobby' })
    q = second.queue
    const joinId = q.items[0]!.id
    const out = recordOutcome(q, joinId, { kind: 'rejected', code: 'invite_invalid' }, T)
    expect(out.items[0]!.status).toBe('rejected')
    expect(JSON.stringify(out)).not.toContain(CODE)
    expect(out.items[1]!.status).toBe('rejected')
    expect(out.items[1]!.lastCode).toBe('blocked_by:invite_invalid')
  })

  it('keeps the code across transient failures so a retry can still join', () => {
    const { queue, id } = add(createSyncQueue(), { type: 'join', alias: 'Bo', invite: CODE })
    const retry = recordOutcome(queue, id, { kind: 'transport-error' }, T)
    expect(retry.items[0]!.status).toBe('pending')
    expect(JSON.stringify(retry)).toContain(CODE)
  })

  it('a rejected invite-create does not block an unrelated later rename', () => {
    let q = add(createSyncQueue(), {
      type: 'invite-create',
      digest,
      maxUses: 1,
      ttlMs: 120_000,
    }).queue
    q = add(q, { type: 'rename', alias: 'R' }).queue
    const out = recordOutcome(q, q.items[0]!.id, { kind: 'rejected', code: 'too_many_invites' }, T)
    expect(out.items[1]!.status).toBe('pending')
  })
})
