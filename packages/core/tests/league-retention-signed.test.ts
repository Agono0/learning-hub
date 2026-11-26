import { describe, expect, it } from 'vitest'
import {
  COMPLETED_DUEL_RETENTION_MS,
  MAX_OPEN_DUELS_PER_MEMBER,
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

const LEAGUE_ID = 'lg-retention-signed'
const T0 = Date.parse('2026-03-02T10:00:00.000Z')
const DAY = 24 * 60 * 60_000

interface Actor {
  signer: LeagueSigner
  handle: string
  seq: number
}

let nonceN = 0

async function actor(): Promise<Actor> {
  const signer = await generateLeagueSigner()
  return { signer, handle: await signerIdFromPubKey(signer.pubKey), seq: 0 }
}

/** Sign, verify and reduce through the real path; throws if rejected. */
async function step(
  state: AuthorityState,
  who: Actor,
  mutation: LeagueMutation,
  now: number,
): Promise<AuthorityState> {
  const seq = who.seq + 1
  const envelope = await signLeagueMutation({
    signer: who.signer,
    leagueId: LEAGUE_ID,
    seq,
    mutation,
    timestamp: now,
    nonce: `ret-signed-${String(++nonceN).padStart(9, '0')}`,
  })
  const verified = await verifyLeagueEnvelope({
    envelope,
    expectedLeagueId: LEAGUE_ID,
    now,
    ledger: ledgerOf(state),
    verify: webCryptoVerifier,
  })
  if (!verified.ok) throw new Error(`verify failed: ${verified.code}`)
  const reduced = applyVerifiedMutation(state, verified, now)
  if (!reduced.ok) throw new Error(`reduce failed: ${reduced.code}`)
  who.seq = seq
  return reduced.state
}

const PROMPTS = [
  { id: 'p1', question: '2+2?', answers: ['4'] },
  { id: 'p2', question: 'Capital of France?', answers: ['Paris'] },
]

async function setup() {
  const a = await actor()
  const b = await actor()
  let state = createAuthorityState(
    createLeague({ id: LEAGUE_ID, title: 'Retention', seasonStart: '2026-03-02' }),
  )
  state = await step(state, a, { type: 'join', alias: 'Ann' }, T0)
  state = await step(state, b, { type: 'join', alias: 'Bo' }, T0 + 1)
  return { a, b, state }
}

async function playDuel(state: AuthorityState, a: Actor, b: Actor, id: string, at: number) {
  let s = await step(
    state,
    a,
    { type: 'duel-open', duelId: id, opponent: b.handle, prompts: PROMPTS },
    at,
  )
  s = await step(s, a, { type: 'duel-start', duelId: id }, at + 10)
  s = await step(s, b, { type: 'duel-start', duelId: id }, at + 20)
  s = await step(s, a, { type: 'duel-answer', duelId: id, promptId: 'p1', answer: '4' }, at + 30)
  s = await step(
    s,
    a,
    { type: 'duel-answer', duelId: id, promptId: 'p2', answer: 'Paris' },
    at + 40,
  )
  s = await step(s, b, { type: 'duel-answer', duelId: id, promptId: 'p1', answer: '5' }, at + 50)
  s = await step(s, b, { type: 'duel-answer', duelId: id, promptId: 'p2', answer: 'Lyon' }, at + 60)
  return s
}

describe('duel retention through the signed path', () => {
  it('a completed duel is kept, then pruned by a later mutation, but standings stay', async () => {
    const { a, b, state } = await setup()
    const played = await playDuel(state, a, b, 'd1', T0 + 1000)
    expect(played.duels['d1']?.status).toBe('complete')
    const pointsBefore = played.league.players.map((p) => [p.handle, p.seasonPoints, p.duelsWon])

    // Inside the retention window another mutation keeps the duel.
    const soon = await step(
      played,
      a,
      { type: 'duel-open', duelId: 'mid', opponent: b.handle, prompts: PROMPTS },
      T0 + DAY,
    )
    expect(soon.duels['d1']).toBeDefined()

    // Past the window, any accepted mutation prunes it.
    const later = T0 + COMPLETED_DUEL_RETENTION_MS + 2 * DAY
    const pruned = await step(
      soon,
      b,
      { type: 'duel-open', duelId: 'd2', opponent: a.handle, prompts: PROMPTS },
      later,
    )
    expect(pruned.duels['d1']).toBeUndefined()
    expect(pruned.duels['d2']).toBeDefined()
    const pointsAfter = pruned.league.players.map((p) => [p.handle, p.seasonPoints, p.duelsWon])
    expect(pointsAfter).toEqual(pointsBefore)
  })

  it('pruning never drops an open duel that is still live', async () => {
    const { a, b, state } = await setup()
    let s = await step(
      state,
      a,
      { type: 'duel-open', duelId: 'live', opponent: b.handle, prompts: PROMPTS },
      T0 + 1000,
    )
    s = await step(s, b, { type: 'duel-start', duelId: 'live' }, T0 + 2000)
    expect(s.duels['live']?.status).not.toBe('complete')
    // Another accepted mutation a few hours later must not evict it.
    s = await step(s, a, { type: 'duel-start', duelId: 'live' }, T0 + 3 * 60 * 60_000)
    expect(s.duels['live']).toBeDefined()
  })

  it('state size stays bounded across many finished duels', async () => {
    const { a, b, state } = await setup()
    let s = state
    let t = T0 + 1000
    for (let i = 0; i < 6; i++) {
      s = await playDuel(s, a, b, `r${i}`, t)
      t += 9 * DAY
    }
    // Each round is 9 days apart: only the newest completed duels remain.
    const kept = Object.keys(s.duels)
    expect(kept).toContain('r5')
    expect(kept).not.toContain('r0')
    expect(kept.length).toBeLessThan(6)
  })

  it('the per-member open duel cap still applies after pruning', async () => {
    const { a, b, state } = await setup()
    let s = state
    for (let i = 0; i < MAX_OPEN_DUELS_PER_MEMBER; i++) {
      s = await step(
        s,
        a,
        { type: 'duel-open', duelId: `cap${i}`, opponent: b.handle, prompts: PROMPTS },
        T0 + 1000 + i,
      )
    }
    await expect(
      step(
        s,
        a,
        { type: 'duel-open', duelId: 'overflow', opponent: b.handle, prompts: PROMPTS },
        T0 + 2000,
      ),
    ).rejects.toThrow(/reduce failed/)
  })
})
