import { describe, expect, it } from 'vitest'
import {
  applyVerifiedMutation,
  createAuthorityState,
  createLeague,
  createSeqTracker,
  createSyncQueue,
  enqueue,
  flushQueue,
  generateLeagueSigner,
  ledgerOf,
  summarizeQueue,
  verifyLeagueEnvelope,
  webCryptoVerifier,
  type AuthorityState,
  type FlushDeps,
  type LeagueMutation,
  type SyncQueue,
  type TransportReply,
} from '../src/leagues'

const LEAGUE_ID = 'lg-flush-fuzz'
const T0 = Date.parse('2026-03-02T10:00:00.000Z')

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface FlakyStats {
  droppedBefore: number
  lostReplies: number
  unavailable: number
  delivered: number
}

/**
 * An authority behind a flaky network. Faults: the request never arrives, the
 * request is applied but the reply is lost, or the server answers 503 without
 * touching state. Every delivered envelope goes through the real verify path.
 */
function flakyAuthority(rand: () => number, clock: { t: number }, faultRate: number) {
  let state: AuthorityState = createAuthorityState(
    createLeague({ id: LEAGUE_ID, title: 'Flush fuzz', seasonStart: '2026-03-02' }),
  )
  const appliedSeqs: number[] = []
  const stats: FlakyStats = { droppedBefore: 0, lostReplies: 0, unavailable: 0, delivered: 0 }
  return {
    get state() {
      return state
    },
    appliedSeqs,
    stats,
    async send(_id: string, envelope: unknown): Promise<TransportReply> {
      const roll = rand()
      if (roll < faultRate * 0.4) {
        stats.droppedBefore++
        return { kind: 'network-error' }
      }
      if (roll < faultRate * 0.6) {
        stats.unavailable++
        return { kind: 'http', status: 503, body: {} }
      }
      stats.delivered++
      const verified = await verifyLeagueEnvelope({
        envelope,
        expectedLeagueId: LEAGUE_ID,
        now: clock.t,
        ledger: ledgerOf(state),
        verify: webCryptoVerifier,
      })
      let reply: TransportReply
      if (!verified.ok) {
        reply = { kind: 'http', status: 409, body: { code: verified.code } }
      } else {
        const reduced = applyVerifiedMutation(state, verified, clock.t)
        if (!reduced.ok) {
          reply = { kind: 'http', status: 409, body: { code: reduced.code } }
        } else {
          state = reduced.state
          appliedSeqs.push(verified.seq)
          reply = { kind: 'http', status: 200, body: { ok: true } }
        }
      }
      if (roll < faultRate) {
        stats.lostReplies++
        return { kind: 'network-error' }
      }
      return reply
    },
  }
}

let nonceN = 0

async function run(seed: number, faultRate: number) {
  const rand = rng(seed)
  const clock = { t: T0 }
  const auth = flakyAuthority(rand, clock, faultRate)
  const deps: FlushDeps = {
    signer: await generateLeagueSigner(),
    leagueId: LEAGUE_ID,
    now: () => clock.t,
    newNonce: () => `flush-fuzz-${String(++nonceN).padStart(9, '0')}`,
    send: (id, env) => auth.send(id, env),
  }
  let queue: SyncQueue = createSyncQueue()
  let tracker = createSeqTracker()
  const mutations: LeagueMutation[] = [
    { type: 'join', alias: 'Ada' },
    { type: 'duel-start', duelId: 'ghost' },
    { type: 'close-round' },
    { type: 'duel-answer', duelId: 'ghost', promptId: 'p1', answer: 'x' },
  ]
  for (const m of mutations) queue = enqueue(queue, m, clock.t).queue

  let flushes = 0
  while (summarizeQueue(queue).pending > 0 && flushes < 400) {
    flushes++
    const res = await flushQueue(queue, tracker, deps)
    queue = res.queue
    tracker = res.tracker
    // Jump to the next wake the queue asks for, else a small step.
    clock.t = Math.max(clock.t + 1, res.nextWakeAt ?? clock.t + 1_000)
  }
  return { auth, queue, flushes }
}

describe('flushQueue under a flaky network', () => {
  for (const seed of [3, 11, 29, 101]) {
    it(`settles every item without double-applying (seed ${seed})`, async () => {
      const { auth, queue, flushes } = await run(seed, 0.5)
      expect(flushes).toBeLessThan(400)
      const summary = summarizeQueue(queue)
      expect(summary.pending).toBe(0)
      // Applied sequence numbers are strictly increasing: nothing replayed.
      const seqs = auth.appliedSeqs
      for (let i = 1; i < seqs.length; i++) expect(seqs[i]!).toBeGreaterThan(seqs[i - 1]!)
      // The join took effect at most once, even when its reply was lost.
      expect(auth.state.league.players.length).toBeLessThanOrEqual(1)
    }, 60_000)
  }

  it('a lost reply on a join ends as already_member, not a second member', async () => {
    let found = false
    for (const seed of [5, 6, 7, 8, 9, 10, 12, 13]) {
      const { auth, queue } = await run(seed, 0.9)
      expect(auth.state.league.players.length).toBeLessThanOrEqual(1)
      const join = queue.items.find((i) => i.mutation.type === 'join')!
      if (auth.stats.lostReplies > 0 && join.status === 'rejected') {
        expect(join.lastCode).toBe('already_member')
        expect(auth.state.league.players).toHaveLength(1)
        found = true
      }
    }
    expect(found).toBe(true)
  }, 120_000)

  it('with no faults every item reaches a terminal state in one pass per lane', async () => {
    const { auth, queue } = await run(77, 0)
    expect(auth.stats.droppedBefore + auth.stats.lostReplies + auth.stats.unavailable).toBe(0)
    expect(summarizeQueue(queue).pending).toBe(0)
    expect(auth.state.league.players).toHaveLength(1)
  }, 60_000)
})
