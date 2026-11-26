import { describe, expect, it } from 'vitest'
import {
  adoptAuthoritySeq,
  applyVerifiedMutation,
  createAuthorityState,
  createLeague,
  createSeqTracker,
  createSyncQueue,
  enqueue,
  flushQueue,
  generateLeagueSigner,
  ledgerOf,
  outcomeFromReply,
  peekSeq,
  reserveSeq,
  summarizeQueue,
  verifyLeagueEnvelope,
  webCryptoVerifier,
  type AuthorityState,
  type FlushDeps,
  type LeagueMutation,
  type TransportReply,
} from '../src/leagues'

const LEAGUE_ID = 'lg-client-test'
const T0 = Date.parse('2026-03-02T10:00:00.000Z')

describe('seq tracker', () => {
  it('starts at 1 and reserves in order without mutating the input', () => {
    const t0 = createSeqTracker()
    expect(peekSeq(t0, 'a')).toBe(1)
    const r1 = reserveSeq(t0, 'a')
    const r2 = reserveSeq(r1.tracker, 'a')
    expect([r1.seq, r2.seq]).toEqual([1, 2])
    expect(peekSeq(t0, 'a')).toBe(1)
    expect(peekSeq(r2.tracker, 'b')).toBe(1)
  })

  it('adopts the authority seq, never moves backwards, ignores junk', () => {
    let t = createSeqTracker()
    t = adoptAuthoritySeq(t, 'a', 9)
    expect(peekSeq(t, 'a')).toBe(10)
    expect(adoptAuthoritySeq(t, 'a', 3)).toBe(t)
    expect(adoptAuthoritySeq(t, 'a', -1)).toBe(t)
    expect(adoptAuthoritySeq(t, 'a', 2.5)).toBe(t)
    expect(adoptAuthoritySeq(t, 'a', Number.NaN)).toBe(t)
  })
})

describe('outcomeFromReply', () => {
  it('maps http statuses into queue outcomes', () => {
    expect(outcomeFromReply({ kind: 'http', status: 200, body: {} }).outcome).toEqual({
      kind: 'accepted',
    })
    expect(outcomeFromReply({ kind: 'network-error' }).outcome).toEqual({
      kind: 'transport-error',
    })
    expect(outcomeFromReply({ kind: 'http', status: 503, body: {} }).outcome).toEqual({
      kind: 'transport-error',
      code: 'http_503',
    })
    expect(
      outcomeFromReply({ kind: 'http', status: 429, body: { code: 'rate_limited' } }).outcome,
    ).toEqual({ kind: 'transport-error', code: 'rate_limited' })
    expect(
      outcomeFromReply({ kind: 'http', status: 409, body: { code: 'not_member' } }).outcome,
    ).toEqual({ kind: 'rejected', code: 'not_member' })
    expect(outcomeFromReply({ kind: 'http', status: 400, body: 'junk' }).outcome).toEqual({
      kind: 'rejected',
      code: 'http_400',
    })
  })

  it('ignores oversized or non-string codes and carries lastSeq only when valid', () => {
    const long = 'x'.repeat(65)
    expect(outcomeFromReply({ kind: 'http', status: 409, body: { code: long } }).outcome).toEqual({
      kind: 'rejected',
      code: 'http_409',
    })
    expect(outcomeFromReply({ kind: 'http', status: 409, body: { code: 7 } }).outcome).toEqual({
      kind: 'rejected',
      code: 'http_409',
    })
    const ok = outcomeFromReply({
      kind: 'http',
      status: 409,
      body: { code: 'bad_seq', lastSeq: 12 },
    })
    expect(ok.authorityLastSeq).toBe(12)
    const bad = outcomeFromReply({
      kind: 'http',
      status: 409,
      body: { code: 'bad_seq', lastSeq: '12' },
    })
    expect(bad.authorityLastSeq).toBeUndefined()
  })
})

/** A tiny in-process authority speaking the real verify + reduce path. */
function fakeAuthority() {
  let state: AuthorityState = createAuthorityState(
    createLeague({ id: LEAGUE_ID, title: 'Client test', seasonStart: '2026-03-02' }),
  )
  const seen: Array<{ seq: number; nonce: string; timestamp: number }> = []
  let down = false
  let clock = T0
  const authority = {
    get state() {
      return state
    },
    setDown(v: boolean) {
      down = v
    },
    setClock(v: number) {
      clock = v
    },
    async send(_id: string, envelope: unknown): Promise<TransportReply> {
      if (down) return { kind: 'network-error' }
      const verified = await verifyLeagueEnvelope({
        envelope,
        expectedLeagueId: LEAGUE_ID,
        now: clock,
        ledger: ledgerOf(state),
        verify: webCryptoVerifier,
      })
      if (!verified.ok) {
        return {
          kind: 'http',
          status: 409,
          body: { code: verified.code, lastSeq: undefined },
        }
      }
      seen.push({ seq: verified.seq, nonce: verified.nonce, timestamp: verified.timestamp })
      const reduced = applyVerifiedMutation(state, verified, clock)
      if (!reduced.ok) return { kind: 'http', status: 409, body: { code: reduced.code } }
      state = reduced.state
      return { kind: 'http', status: 200, body: { ok: true } }
    },
    seen,
  }
  return authority
}

let n = 0
const deps = async (
  auth: ReturnType<typeof fakeAuthority>,
  clock: { t: number },
): Promise<FlushDeps> => ({
  signer: await generateLeagueSigner(),
  leagueId: LEAGUE_ID,
  now: () => clock.t,
  newNonce: () => `client-nonce-${String(++n).padStart(8, '0')}`,
  send: (id, env) => auth.send(id, env),
})

const join = (alias: string): LeagueMutation => ({ type: 'join', alias })

describe('flushQueue against the real authority path', () => {
  it('signs, sends and settles a queued join', async () => {
    const auth = fakeAuthority()
    const clock = { t: T0 }
    const d = await deps(auth, clock)
    const { queue } = enqueue(createSyncQueue(), join('Ada'), T0)
    const res = await flushQueue(queue, createSeqTracker(), d)
    expect(res.attempted).toHaveLength(1)
    expect(res.attempted[0]!.outcome.kind).toBe('accepted')
    expect(summarizeQueue(res.queue).pending).toBe(0)
    expect(auth.state.league.players).toHaveLength(1)
    expect(auth.seen[0]!.seq).toBe(1)
    expect(peekSeq(res.tracker, LEAGUE_ID)).toBe(2)
    expect(res.nextWakeAt).toBeNull()
  })

  it('keeps the item and backs off while the authority is unreachable', async () => {
    const auth = fakeAuthority()
    auth.setDown(true)
    const clock = { t: T0 }
    const d = await deps(auth, clock)
    const { queue } = enqueue(createSyncQueue(), join('Ada'), T0)
    const first = await flushQueue(queue, createSeqTracker(), d)
    expect(first.attempted[0]!.outcome.kind).toBe('transport-error')
    expect(summarizeQueue(first.queue).pending).toBe(1)
    expect(first.nextWakeAt).toBeGreaterThan(T0)
    // Not due yet: a second flush at the same instant sends nothing.
    const idle = await flushQueue(first.queue, first.tracker, d)
    expect(idle.attempted).toHaveLength(0)
  })

  it('re-signs with a fresh timestamp and nonce after a long outage', async () => {
    const auth = fakeAuthority()
    auth.setDown(true)
    const clock = { t: T0 }
    const d = await deps(auth, clock)
    const { queue } = enqueue(createSyncQueue(), join('Ada'), T0)
    const first = await flushQueue(queue, createSeqTracker(), d)
    // Come back far outside the authority's clock window.
    clock.t = T0 + 60 * 60_000
    auth.setClock(clock.t)
    auth.setDown(false)
    const second = await flushQueue(first.queue, first.tracker, d)
    expect(second.attempted[0]!.outcome.kind).toBe('accepted')
    expect(auth.seen).toHaveLength(1)
    expect(auth.seen[0]!.timestamp).toBe(clock.t)
    // The failed first try consumed seq 1; the sequence only ever increases.
    expect(auth.seen[0]!.seq).toBe(2)
  })

  it('recovers from bad_seq when the client tracker was reset', async () => {
    const auth = fakeAuthority()
    const clock = { t: T0 }
    const d = await deps(auth, clock)
    let q = createSyncQueue()
    q = enqueue(q, join('Ada'), T0).queue
    const r1 = await flushQueue(q, createSeqTracker(), d)
    expect(r1.attempted[0]!.outcome.kind).toBe('accepted')
    // A second mutation from the same signer with a lost tracker (seq starts at 1 again).
    q = enqueue(r1.queue, { type: 'duel-start', duelId: 'nope' }, T0).queue
    const r2 = await flushQueue(q, createSeqTracker(), d)
    const out = r2.attempted[0]!.outcome
    expect(out.kind).toBe('rejected')
    if (out.kind === 'rejected') expect(out.code).toBe('bad_seq')
    // bad_seq retries at once, without burning an attempt.
    clock.t += 1
    const r3 = await flushQueue(r2.queue, r2.tracker, d)
    expect(r3.attempted).toHaveLength(1)
    const item = r3.queue.items.find((i) => i.mutation.type === 'duel-start')!
    expect(item.attempts).toBeLessThanOrEqual(1)
    // The tracker advanced past the stale sequence on each try.
    expect(peekSeq(r3.tracker, LEAGUE_ID)).toBeGreaterThan(2)
  })

  it('a permanent rejection settles the item and does not loop', async () => {
    const auth = fakeAuthority()
    const clock = { t: T0 }
    const d = await deps(auth, clock)
    let q = createSyncQueue()
    q = enqueue(q, join('Ada'), T0).queue
    q = enqueue(q, join('Ada again'), T0).queue
    const r1 = await flushQueue(q, createSeqTracker(), d)
    // Both are the same lane (league-wide): only the head went out.
    expect(r1.attempted).toHaveLength(1)
    clock.t += 5
    const r2 = await flushQueue(r1.queue, r1.tracker, d)
    expect(r2.attempted).toHaveLength(1)
    const second = r2.queue.items[1]!
    expect(second.status).toBe('rejected')
    expect(second.lastCode).toBe('already_member')
    const r3 = await flushQueue(r2.queue, r2.tracker, d)
    expect(r3.attempted).toHaveLength(0)
  })

  it('a throwing transport is treated as a network error, never escapes', async () => {
    const auth = fakeAuthority()
    const clock = { t: T0 }
    const d = await deps(auth, clock)
    d.send = async () => {
      throw new Error('boom')
    }
    const { queue } = enqueue(createSyncQueue(), join('Ada'), T0)
    const res = await flushQueue(queue, createSeqTracker(), d)
    expect(res.attempted[0]!.outcome.kind).toBe('transport-error')
    expect(summarizeQueue(res.queue).pending).toBe(1)
  })
})
