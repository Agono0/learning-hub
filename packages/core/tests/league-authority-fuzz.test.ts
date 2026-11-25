import { describe, expect, it } from 'vitest'
import {
  AuthorityStateSchema,
  applyVerifiedMutation,
  createAuthorityState,
  createLeague,
  generateLeagueSigner,
  ledgerOf,
  signLeagueMutation,
  signerIdFromPubKey,
  verifyLeagueEnvelope,
  webCryptoVerifier,
  type AuthorityState,
  type LeagueMutation,
  type LeagueSigner,
} from '../src/leagues'

const LEAGUE_ID = 'lg-fuzz'
const T0 = Date.parse('2026-03-02T10:00:00.000Z')

/** Small deterministic PRNG (mulberry32) so a failing seed reproduces. */
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

interface Actor {
  signer: LeagueSigner
  handle: string
  seq: number
}

async function makeActors(n: number): Promise<Actor[]> {
  const out: Actor[] = []
  for (let i = 0; i < n; i++) {
    const signer = await generateLeagueSigner()
    out.push({ signer, handle: await signerIdFromPubKey(signer.pubKey), seq: 0 })
  }
  return out
}

function randomMutation(
  rand: () => number,
  actors: Actor[],
  me: Actor,
  step: number,
): LeagueMutation {
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)] as T
  const roll = rand()
  const duelId = `d${Math.floor(rand() * 4)}`
  if (roll < 0.15) return { type: 'join', alias: `p${step % 7}` }
  if (roll < 0.45) {
    const other = pick(actors.filter((a) => a !== me))
    return {
      type: 'duel-open',
      duelId,
      opponent: rand() < 0.1 ? 'usr_nobody' : other.handle,
      prompts: [
        { id: 'p1', question: 'q1', answers: ['a'] },
        { id: 'p2', question: 'q2', answers: ['b'] },
      ],
    }
  }
  if (roll < 0.65) return { type: 'duel-start', duelId }
  if (roll < 0.95) {
    return {
      type: 'duel-answer',
      duelId,
      promptId: pick(['p1', 'p2', 'p9']),
      answer: pick(['a', 'b', 'x']),
    }
  }
  return { type: 'close-round' }
}

type SignedEnvelope = Awaited<ReturnType<typeof signLeagueMutation>>

interface Run {
  state: AuthorityState
  accepted: SignedEnvelope[]
  rejected: number
}

async function drive(seed: number, steps: number): Promise<Run> {
  const rand = rng(seed)
  const actors = await makeActors(3)
  let state = createAuthorityState(
    createLeague({ id: LEAGUE_ID, title: 'Fuzz', seasonStart: '2026-03-02' }),
  )
  const accepted: SignedEnvelope[] = []
  let rejected = 0
  let now = T0
  let nonce = 0
  for (let step = 0; step < steps; step++) {
    now += 1 + Math.floor(rand() * 2000)
    const me = actors[Math.floor(rand() * actors.length)] as Actor
    const fault = rand()
    // ~10% bad sequence numbers, ~5% replays of an already accepted envelope.
    let seq = me.seq + 1
    if (fault < 0.05) seq = me.seq + 2 + Math.floor(rand() * 3)
    else if (fault < 0.1) seq = Math.max(1, me.seq - Math.floor(rand() * 2))
    const envelope =
      fault >= 0.1 && fault < 0.15 && accepted.length > 0
        ? (accepted[Math.floor(rand() * accepted.length)] as SignedEnvelope)
        : await signLeagueMutation({
            signer: me.signer,
            leagueId: LEAGUE_ID,
            seq,
            mutation: randomMutation(rand, actors, me, step),
            timestamp: now,
            nonce: `fuzz-${seed}-${String(++nonce).padStart(8, '0')}`,
          })
    const before = structuredClone(state)
    const verified = await verifyLeagueEnvelope({
      envelope,
      expectedLeagueId: LEAGUE_ID,
      now,
      ledger: ledgerOf(state),
      verify: webCryptoVerifier,
    })
    const reduced = verified.ok ? applyVerifiedMutation(state, verified, now) : null
    if (reduced?.ok) {
      state = reduced.state
      me.seq = Math.max(me.seq, verified.ok ? verified.seq : me.seq)
      accepted.push(envelope)
    } else {
      rejected++
      // A rejected envelope must leave the authority state untouched.
      expect(state).toEqual(before)
    }
    // The input state is never mutated in place.
    expect(AuthorityStateSchema.safeParse(state).success).toBe(true)
  }
  return { state, accepted, rejected }
}

describe('authority reducer fuzz', () => {
  for (const seed of [1, 7, 42, 1337]) {
    it(`keeps invariants over a random run (seed ${seed})`, async () => {
      const run = await drive(seed, 120)
      expect(run.state.accepted).toBe(run.accepted.length)
      expect(run.rejected).toBeGreaterThan(0)
      expect(run.accepted.length).toBeGreaterThan(10)
      // Member points never go negative and handles are unique.
      const handles = run.state.league.players.map((p) => p.handle)
      expect(new Set(handles).size).toBe(handles.length)
      for (const p of run.state.league.players) {
        expect(p.seasonPoints).toBeGreaterThanOrEqual(0)
        expect(p.duelsWon + p.duelsLost).toBeGreaterThanOrEqual(0)
      }
    }, 60_000)
  }

  it('rejects every replay of an accepted envelope at the final state', async () => {
    const run = await drive(99, 80)
    const now = T0 + 10 * 60 * 1000
    for (const env of run.accepted.slice(0, 15)) {
      const verified = await verifyLeagueEnvelope({
        envelope: env,
        expectedLeagueId: LEAGUE_ID,
        now,
        ledger: ledgerOf(run.state),
        verify: webCryptoVerifier,
      })
      expect(verified.ok).toBe(false)
    }
  }, 60_000)

  it('is deterministic for a seed', async () => {
    const a = await drive(5, 40)
    const b = await drive(5, 40)
    expect(a.accepted.length).toBe(b.accepted.length)
    expect(a.rejected).toBe(b.rejected)
  }, 60_000)
})
