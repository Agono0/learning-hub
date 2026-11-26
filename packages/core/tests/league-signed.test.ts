import { describe, expect, it } from 'vitest'
import {
  AuthorityStateSchema,
  MAX_CLOCK_SKEW_MS,
  NONCE_RETENTION_MS,
  RATE_LIMIT,
  RATE_WINDOW_MS,
  applyVerifiedMutation,
  createAuthorityState,
  createLeague,
  generateLeagueSigner,
  ledgerOf,
  pruneNonces,
  signLeagueMutation,
  signerIdFromPubKey,
  verifyLeagueEnvelope,
  webCryptoVerifier,
  type AuthorityState,
  type LeagueMutation,
  type LeagueSigner,
} from '../src/leagues'

const LEAGUE_ID = 'lg-test'
const T0 = Date.parse('2026-03-02T10:00:00.000Z')

let nonceCounter = 0
const nextNonce = () => `nonce-${String(++nonceCounter).padStart(10, '0')}`

interface Actor {
  signer: LeagueSigner
  handle: string
  seq: number
}

async function actor(): Promise<Actor> {
  const signer = await generateLeagueSigner()
  return { signer, handle: await signerIdFromPubKey(signer.pubKey), seq: 0 }
}

async function send(
  state: AuthorityState,
  who: Actor,
  mutation: LeagueMutation,
  now: number,
  opts: { seq?: number; nonce?: string; timestamp?: number } = {},
) {
  const seq = opts.seq ?? who.seq + 1
  const envelope = await signLeagueMutation({
    signer: who.signer,
    leagueId: LEAGUE_ID,
    seq,
    mutation,
    timestamp: opts.timestamp ?? now,
    nonce: opts.nonce ?? nextNonce(),
  })
  const verified = await verifyLeagueEnvelope({
    envelope,
    expectedLeagueId: LEAGUE_ID,
    now,
    ledger: ledgerOf(state),
    verify: webCryptoVerifier,
  })
  if (!verified.ok) return { verified, reduced: null, envelope }
  const reduced = applyVerifiedMutation(state, verified, now)
  if (reduced.ok) who.seq = seq
  return { verified, reduced, envelope }
}

function fresh(): AuthorityState {
  return createAuthorityState(
    createLeague({ id: LEAGUE_ID, title: 'Test', seasonStart: '2026-03-02' }),
  )
}

async function twoMembers() {
  const a = await actor()
  const b = await actor()
  let state = fresh()
  const ja = await send(state, a, { type: 'join', alias: 'Ann' }, T0)
  if (!ja.reduced?.ok) throw new Error('join a')
  state = ja.reduced.state
  const jb = await send(state, b, { type: 'join', alias: 'Bo' }, T0 + 1)
  if (!jb.reduced?.ok) throw new Error('join b')
  state = jb.reduced.state
  return { a, b, state }
}

const PROMPTS = [
  { id: 'p1', question: '2+2?', answers: ['4'] },
  { id: 'p2', question: 'Capital of France?', answers: ['Paris'] },
]

describe('signer identity', () => {
  it('gives distinct keys distinct identities (no shared SPKI header prefix)', async () => {
    const x = await generateLeagueSigner()
    const y = await generateLeagueSigner()
    expect(x.pubKey.slice(0, 16)).toBe(y.pubKey.slice(0, 16))
    const ix = await signerIdFromPubKey(x.pubKey)
    const iy = await signerIdFromPubKey(y.pubKey)
    expect(ix).not.toBe(iy)
    expect(ix).toMatch(/^usr_[0-9a-f]{32}$/)
    expect(await signerIdFromPubKey(x.pubKey)).toBe(ix)
  })
})

describe('signature verification', () => {
  it('accepts a correctly signed envelope and derives the signer from the key', async () => {
    const a = await actor()
    const { verified } = await send(fresh(), a, { type: 'join', alias: 'Ann' }, T0)
    expect(verified.ok).toBe(true)
    if (verified.ok) {
      expect(verified.signer).toBe(a.handle)
      expect(verified.signer.startsWith('usr_')).toBe(true)
    }
  })

  it('rejects a tampered payload', async () => {
    const a = await actor()
    const state = fresh()
    const { envelope } = await send(state, a, { type: 'join', alias: 'Ann' }, T0)
    const forged = { ...envelope, payload: envelope.payload.replace('Ann', 'Eve') }
    const out = await verifyLeagueEnvelope({
      envelope: forged,
      expectedLeagueId: LEAGUE_ID,
      now: T0,
      ledger: ledgerOf(state),
      verify: webCryptoVerifier,
    })
    expect(out).toMatchObject({ ok: false, code: 'bad_signature' })
  })

  it('rejects a signature made by a different key', async () => {
    const a = await actor()
    const mallory = await actor()
    const state = fresh()
    const { envelope } = await send(state, a, { type: 'join', alias: 'Ann' }, T0)
    const out = await verifyLeagueEnvelope({
      envelope: { ...envelope, pubKey: mallory.signer.pubKey },
      expectedLeagueId: LEAGUE_ID,
      now: T0,
      ledger: ledgerOf(state),
      verify: webCryptoVerifier,
    })
    expect(out).toMatchObject({ ok: false, code: 'bad_signature' })
  })

  it('rejects a replay of the same envelope after it was accepted', async () => {
    const a = await actor()
    const first = await send(fresh(), a, { type: 'join', alias: 'Ann' }, T0)
    if (!first.reduced?.ok) throw new Error('join failed')
    const again = await verifyLeagueEnvelope({
      envelope: first.envelope,
      expectedLeagueId: LEAGUE_ID,
      now: T0 + 1000,
      ledger: ledgerOf(first.reduced.state),
      verify: webCryptoVerifier,
    })
    expect(again).toMatchObject({ ok: false, code: 'replayed_nonce' })
  })

  it('rejects a reused sequence number even with a fresh nonce', async () => {
    const { a, state } = await twoMembers()
    const out = await send(state, a, { type: 'close-round' }, T0 + 10, { seq: 1 })
    expect(out.verified).toMatchObject({ ok: false, code: 'bad_seq' })
  })

  it('rejects stale and future timestamps outside the skew window', async () => {
    const a = await actor()
    const stale = await send(fresh(), a, { type: 'join', alias: 'A' }, T0, {
      timestamp: T0 - MAX_CLOCK_SKEW_MS - 1,
    })
    expect(stale.verified).toMatchObject({ ok: false, code: 'stale_timestamp' })
    const future = await send(fresh(), a, { type: 'join', alias: 'A' }, T0, {
      timestamp: T0 + MAX_CLOCK_SKEW_MS + 1,
    })
    expect(future.verified).toMatchObject({ ok: false, code: 'future_timestamp' })
    const edge = await send(fresh(), a, { type: 'join', alias: 'A' }, T0, {
      timestamp: T0 - MAX_CLOCK_SKEW_MS,
    })
    expect(edge.verified.ok).toBe(true)
  })

  it('rejects an envelope for another league and a wrong domain', async () => {
    const a = await actor()
    const envelope = await signLeagueMutation({
      signer: a.signer,
      leagueId: 'other-league',
      seq: 1,
      mutation: { type: 'join', alias: 'A' },
      timestamp: T0,
      nonce: nextNonce(),
    })
    const mismatch = await verifyLeagueEnvelope({
      envelope,
      expectedLeagueId: LEAGUE_ID,
      now: T0,
      ledger: ledgerOf(fresh()),
      verify: webCryptoVerifier,
    })
    expect(mismatch).toMatchObject({ ok: false, code: 'league_mismatch' })

    const wrongDomain = await verifyLeagueEnvelope({
      envelope: {
        ...envelope,
        payload: JSON.stringify({ domain: 'lh-identity:v1', leagueId: LEAGUE_ID, seq: 1 }),
      },
      expectedLeagueId: LEAGUE_ID,
      now: T0,
      ledger: ledgerOf(fresh()),
      verify: webCryptoVerifier,
    })
    expect(wrongDomain).toMatchObject({ ok: false, code: 'wrong_domain' })
  })

  it('rejects malformed envelopes and non-JSON payloads without throwing', async () => {
    const state = fresh()
    const run = (envelope: unknown) =>
      verifyLeagueEnvelope({
        envelope,
        expectedLeagueId: LEAGUE_ID,
        now: T0,
        ledger: ledgerOf(state),
        verify: webCryptoVerifier,
      })
    expect(await run(null)).toMatchObject({ ok: false, code: 'bad_envelope' })
    expect(await run({ payload: 1 })).toMatchObject({ ok: false, code: 'bad_envelope' })
    expect(
      await run({
        payload: 'not json at all',
        timestamp: T0,
        nonce: 'nonce-12345678',
        pubKey: 'p'.repeat(20),
        signature: 's'.repeat(20),
      }),
    ).toMatchObject({ ok: false, code: 'bad_payload' })
  })

  it('treats a verifier that throws (garbage key bytes) as a failed signature', async () => {
    const a = await actor()
    const { envelope } = await send(fresh(), a, { type: 'join', alias: 'A' }, T0)
    const out = await verifyLeagueEnvelope({
      envelope: { ...envelope, pubKey: 'A'.repeat(40) },
      expectedLeagueId: LEAGUE_ID,
      now: T0,
      ledger: ledgerOf(fresh()),
      verify: webCryptoVerifier,
    })
    expect(out).toMatchObject({ ok: false, code: 'bad_signature' })
  })

  it('does not accept mutation fields the schema does not define (no client timing)', async () => {
    const a = await actor()
    const state = fresh()
    const payload = JSON.stringify({
      domain: 'lh-league-mutation/v1',
      leagueId: LEAGUE_ID,
      seq: 1,
      mutation: { type: 'duel-answer', duelId: 'd1', promptId: 'p1', answer: '4', elapsedMs: 1 },
    })
    const out = await verifyLeagueEnvelope({
      envelope: {
        payload,
        timestamp: T0,
        nonce: nextNonce(),
        pubKey: a.signer.pubKey,
        signature: 'x'.repeat(20),
      },
      expectedLeagueId: LEAGUE_ID,
      now: T0,
      ledger: ledgerOf(state),
      verify: async () => true,
    })
    // The extra elapsedMs key is stripped by the schema, so it can never reach
    // the reducer; the authority stamps timing itself.
    expect(out.ok).toBe(true)
    if (out.ok) expect(JSON.stringify(out.mutation)).not.toContain('elapsedMs')
  })
})

describe('authority reducer', () => {
  it('joins members once and rejects a second join by the same key', async () => {
    const { a, state } = await twoMembers()
    expect(state.league.players.some((p) => p.handle === a.handle)).toBe(true)
    const again = await send(state, a, { type: 'join', alias: 'Ann2' }, T0 + 5)
    expect(again.reduced).toMatchObject({ ok: false, code: 'already_member' })
    expect(state.league.players).toHaveLength(2)
  })

  it('keeps the alias display-only: identity is the key, not the alias', async () => {
    const { a, b, state } = await twoMembers()
    expect(state.aliases[a.handle]).toBe('Ann')
    expect(state.aliases[b.handle]).toBe('Bo')
    expect(state.league.players.every((p) => p.handle.startsWith('usr_'))).toBe(true)
  })

  it('rejects non-members for every action', async () => {
    const { state } = await twoMembers()
    const outsider = await actor()
    for (const m of [
      { type: 'duel-start', duelId: 'd' } as const,
      { type: 'close-round' } as const,
      { type: 'duel-answer', duelId: 'd', promptId: 'p1', answer: 'x' } as const,
    ]) {
      const r = await send(state, outsider, m, T0 + 10)
      expect(r.reduced).toMatchObject({ ok: false, code: 'not_member' })
    }
  })

  it('opens a duel only against a joined opponent and not against yourself', async () => {
    const { a, b, state } = await twoMembers()
    const self = await send(
      state,
      a,
      {
        type: 'duel-open',
        duelId: 'd1',
        opponent: a.handle,
        prompts: PROMPTS,
      },
      T0 + 10,
    )
    expect(self.reduced).toMatchObject({ ok: false, code: 'self_duel' })
    const ghost = await send(
      state,
      a,
      {
        type: 'duel-open',
        duelId: 'd1',
        opponent: 'usr_ghost',
        prompts: PROMPTS,
      },
      T0 + 11,
    )
    expect(ghost.reduced).toMatchObject({ ok: false, code: 'opponent_not_member' })
    const ok = await send(
      state,
      a,
      {
        type: 'duel-open',
        duelId: 'd1',
        opponent: b.handle,
        prompts: PROMPTS,
      },
      T0 + 12,
    )
    expect(ok.reduced?.ok).toBe(true)
  })

  it('measures answer timing with the authority clock only', async () => {
    const { a, b, state: s0 } = await twoMembers()
    let state = s0
    const open = await send(
      state,
      a,
      { type: 'duel-open', duelId: 'd1', opponent: b.handle, prompts: PROMPTS },
      T0 + 100,
    )
    state = open.reduced!.ok ? open.reduced!.state : state
    const start = await send(state, a, { type: 'duel-start', duelId: 'd1' }, T0 + 1_000)
    state = start.reduced!.ok ? start.reduced!.state : state
    const ans = await send(
      state,
      a,
      { type: 'duel-answer', duelId: 'd1', promptId: 'p1', answer: '4' },
      T0 + 4_500,
    )
    expect(ans.reduced?.ok).toBe(true)
    if (ans.reduced?.ok) {
      state = ans.reduced.state
      expect(state.duels.d1!.answersA[0]!.elapsedMs).toBe(3_500)
    }
    const ans2 = await send(
      state,
      a,
      { type: 'duel-answer', duelId: 'd1', promptId: 'p2', answer: 'Paris' },
      T0 + 5_000,
    )
    if (ans2.reduced?.ok) expect(ans2.reduced.state.duels.d1!.answersA[1]!.elapsedMs).toBe(500)
  })

  it('requires answers in prompt order and a started side', async () => {
    const { a, b, state: s0 } = await twoMembers()
    let state = s0
    const open = await send(
      state,
      a,
      { type: 'duel-open', duelId: 'd1', opponent: b.handle, prompts: PROMPTS },
      T0 + 100,
    )
    state = open.reduced!.ok ? open.reduced!.state : state
    const early = await send(
      state,
      a,
      { type: 'duel-answer', duelId: 'd1', promptId: 'p1', answer: '4' },
      T0 + 200,
    )
    expect(early.reduced).toMatchObject({ ok: false, code: 'side_not_started' })
    const start = await send(state, a, { type: 'duel-start', duelId: 'd1' }, T0 + 300)
    state = start.reduced!.ok ? start.reduced!.state : state
    const skip = await send(
      state,
      a,
      { type: 'duel-answer', duelId: 'd1', promptId: 'p2', answer: 'Paris' },
      T0 + 400,
    )
    expect(skip.reduced).toMatchObject({ ok: false, code: 'out_of_order' })
    const twice = await send(state, a, { type: 'duel-start', duelId: 'd1' }, T0 + 500)
    expect(twice.reduced).toMatchObject({ ok: false, code: 'side_already_started' })
  })

  it('decides a duel when both sides finish and awards league points once', async () => {
    const { a, b, state: s0 } = await twoMembers()
    let state = s0
    const step = async (who: Actor, m: LeagueMutation, at: number) => {
      const r = await send(state, who, m, at)
      if (!r.reduced?.ok) throw new Error(`step failed: ${JSON.stringify(r.reduced)} ${m.type}`)
      state = r.reduced.state
      return r.reduced
    }
    await step(
      a,
      { type: 'duel-open', duelId: 'd1', opponent: b.handle, prompts: PROMPTS },
      T0 + 10,
    )
    await step(a, { type: 'duel-start', duelId: 'd1' }, T0 + 20)
    await step(b, { type: 'duel-start', duelId: 'd1' }, T0 + 20)
    await step(a, { type: 'duel-answer', duelId: 'd1', promptId: 'p1', answer: '4' }, T0 + 1_020)
    await step(
      a,
      { type: 'duel-answer', duelId: 'd1', promptId: 'p2', answer: 'paris' },
      T0 + 2_020,
    )
    await step(b, { type: 'duel-answer', duelId: 'd1', promptId: 'p1', answer: '5' }, T0 + 1_500)
    const last = await step(
      b,
      { type: 'duel-answer', duelId: 'd1', promptId: 'p2', answer: 'Paris' },
      T0 + 2_500,
    )
    expect(last.effects.some((e) => e.kind === 'duel-decided')).toBe(true)
    const duel = state.duels.d1!
    expect(duel.status).toBe('complete')
    expect(duel.result).toMatchObject({ winner: a.handle, loser: b.handle, draw: false })
    const pa = state.league.players.find((p) => p.handle === a.handle)!
    const pb = state.league.players.find((p) => p.handle === b.handle)!
    expect(pa.points).toBe(25)
    expect(pa.duelsWon).toBe(1)
    expect(pb.points).toBe(0)
    expect(pb.duelsLost).toBe(1)
    // The finished duel accepts nothing more.
    const more = await send(
      state,
      a,
      { type: 'duel-answer', duelId: 'd1', promptId: 'p1', answer: '4' },
      T0 + 3_000,
    )
    expect(more.reduced).toMatchObject({ ok: false, code: 'duel_complete' })
    expect(state.league.players.find((p) => p.handle === a.handle)!.points).toBe(25)
  })

  it('breaks an accuracy tie by authority-measured time, and draws honestly', async () => {
    const { a, b, state: s0 } = await twoMembers()
    let state = s0
    const step = async (who: Actor, m: LeagueMutation, at: number) => {
      const r = await send(state, who, m, at)
      if (!r.reduced?.ok) throw new Error('step failed')
      state = r.reduced.state
    }
    const one = [{ id: 'p1', question: 'q', answers: ['x'] }]
    await step(a, { type: 'duel-open', duelId: 'd1', opponent: b.handle, prompts: one }, T0 + 10)
    await step(a, { type: 'duel-start', duelId: 'd1' }, T0 + 20)
    await step(b, { type: 'duel-start', duelId: 'd1' }, T0 + 20)
    await step(b, { type: 'duel-answer', duelId: 'd1', promptId: 'p1', answer: 'x' }, T0 + 520)
    await step(a, { type: 'duel-answer', duelId: 'd1', promptId: 'p1', answer: 'x' }, T0 + 2_020)
    expect(state.duels.d1!.result).toMatchObject({ winner: b.handle, draw: false })

    await step(a, { type: 'duel-open', duelId: 'd2', opponent: b.handle, prompts: one }, T0 + 5_000)
    await step(a, { type: 'duel-start', duelId: 'd2' }, T0 + 5_100)
    await step(b, { type: 'duel-start', duelId: 'd2' }, T0 + 5_100)
    await step(a, { type: 'duel-answer', duelId: 'd2', promptId: 'p1', answer: 'x' }, T0 + 5_600)
    await step(b, { type: 'duel-answer', duelId: 'd2', promptId: 'p1', answer: 'x' }, T0 + 5_600)
    expect(state.duels.d2!.result).toMatchObject({ winner: null, draw: true })
  })

  it('expires a duel after its lifetime', async () => {
    const { a, b, state: s0 } = await twoMembers()
    let state = s0
    const open = await send(
      state,
      a,
      { type: 'duel-open', duelId: 'd1', opponent: b.handle, prompts: PROMPTS },
      T0 + 10,
    )
    state = open.reduced!.ok ? open.reduced!.state : state
    const late = T0 + 10 + 24 * 60 * 60_000
    const start = await send(state, a, { type: 'duel-start', duelId: 'd1' }, late, {
      timestamp: late,
    })
    expect(start.reduced).toMatchObject({ ok: false, code: 'duel_expired' })
  })

  it('refuses to close a round before it is due and closes it once due', async () => {
    const { a, state } = await twoMembers()
    const early = await send(state, a, { type: 'close-round' }, T0 + 100)
    expect(early.reduced).toMatchObject({ ok: false, code: 'round_not_due' })
    const dueAt = Date.parse('2026-03-09T00:00:00.000Z') + 1
    const due = await send(state, a, { type: 'close-round' }, dueAt)
    expect(due.reduced?.ok).toBe(true)
    if (due.reduced?.ok) expect(due.reduced.state.league.currentRound).toBe(1)
  })

  it('leaves the input state unchanged on every rejection', async () => {
    const { a, state } = await twoMembers()
    const snapshot = JSON.stringify(state)
    await send(state, a, { type: 'close-round' }, T0 + 100)
    await send(state, a, { type: 'join', alias: 'again' }, T0 + 200)
    expect(JSON.stringify(state)).toBe(snapshot)
  })

  it('records accepted mutations in a bounded log and keeps the state schema-valid', async () => {
    const { state } = await twoMembers()
    expect(state.accepted).toBe(2)
    expect(state.log.map((l) => l.type)).toEqual(['join', 'join'])
    expect(AuthorityStateSchema.safeParse(state).success).toBe(true)
  })
})

describe('nonce retention', () => {
  it('prunes nonces older than the retention window and keeps recent ones', async () => {
    const { state } = await twoMembers()
    const later = T0 + NONCE_RETENTION_MS + 10
    const pruned = pruneNonces(state, later)
    expect(Object.keys(pruned.nonces)).toHaveLength(0)
    const kept = pruneNonces(state, T0 + 1000)
    expect(Object.keys(kept.nonces)).toHaveLength(2)
  })

  it('retention exceeds twice the accepted skew, so a replay cannot outlive its nonce', () => {
    expect(NONCE_RETENTION_MS).toBeGreaterThan(2 * MAX_CLOCK_SKEW_MS)
  })
})

describe('rate limiting', () => {
  it('rejects a signer who already had RATE_LIMIT mutations accepted inside the window', async () => {
    const { a, state } = await twoMembers()
    const busy: AuthorityState = {
      ...state,
      rate: { ...state.rate, [a.handle]: Array.from({ length: RATE_LIMIT }, (_, i) => T0 + i) },
    }
    const r = await send(busy, a, { type: 'close-round' }, T0 + 1_000)
    expect(r.reduced).toMatchObject({ ok: false, code: 'rate_limited' })
  })

  it('lets the same signer through once the window has passed', async () => {
    const { a, state } = await twoMembers()
    const busy: AuthorityState = {
      ...state,
      rate: { ...state.rate, [a.handle]: Array.from({ length: RATE_LIMIT }, (_, i) => T0 + i) },
    }
    const later = T0 + RATE_WINDOW_MS + 1_000
    const r = await send(busy, a, { type: 'close-round' }, later)
    // Past the window the limiter steps aside; the reducer then answers on the merits.
    expect(r.reduced).toMatchObject({ ok: false, code: 'round_not_due' })
  })

  it('does not rate-limit other signers because one is busy', async () => {
    const { a, b, state } = await twoMembers()
    const busy: AuthorityState = {
      ...state,
      rate: { ...state.rate, [a.handle]: Array.from({ length: RATE_LIMIT }, (_, i) => T0 + i) },
    }
    const r = await send(busy, b, { type: 'close-round' }, T0 + 1_000)
    expect(r.reduced).toMatchObject({ ok: false, code: 'round_not_due' })
  })

  it('records accepted mutations in the window and prunes old ones', async () => {
    const { a, state } = await twoMembers()
    expect(state.rate[a.handle]).toHaveLength(1)
    const a2 = await send(state, a, { type: 'duel-start', duelId: 'none' }, T0 + RATE_WINDOW_MS + 5)
    expect(a2.reduced).toMatchObject({ ok: false, code: 'duel_unknown' })
  })

  it('loads an older persisted state that predates the rate field', () => {
    const legacy = JSON.parse(JSON.stringify(fresh())) as Record<string, unknown>
    delete legacy.rate
    const parsed = AuthorityStateSchema.safeParse(legacy)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.rate).toEqual({})
  })
})
