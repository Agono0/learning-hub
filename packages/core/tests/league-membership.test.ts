import { describe, expect, it } from 'vitest'
import {
  INVITE_MAX_TTL_MS,
  MAX_ACTIVE_INVITES_PER_MEMBER,
  INVITE_TOMBSTONE_MS,
  AuthorityStateSchema,
  applyVerifiedMutation,
  createAuthorityState,
  createLeague,
  digestInviteCode,
  generateInviteCode,
  generateLeagueSigner,
  isInviteDigest,
  ledgerOf,
  signLeagueMutation,
  signerIdFromPubKey,
  verifyLeagueEnvelope,
  webCryptoVerifier,
  LeagueMutationSchema,
  type AuthorityState,
  type LeagueMutation,
  type LeagueSigner,
  type ReduceFailureCode,
} from '../src/leagues'

const LEAGUE_ID = 'lg-membership'
const T0 = Date.parse('2026-03-02T10:00:00.000Z')
const HOUR = 60 * 60_000

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

type Outcome =
  | { ok: true; state: AuthorityState; effects: { kind: string }[] }
  | { ok: false; code: ReduceFailureCode | string; state: AuthorityState }

/** Sign, verify and reduce, digesting a join's invite the way the room does. */
async function send(
  state: AuthorityState,
  who: Actor,
  mutation: LeagueMutation,
  now: number,
): Promise<Outcome> {
  const seq = who.seq + 1
  const envelope = await signLeagueMutation({
    signer: who.signer,
    leagueId: LEAGUE_ID,
    seq,
    mutation,
    timestamp: now,
    nonce: `member-nonce-${String(++nonceN).padStart(9, '0')}`,
  })
  const verified = await verifyLeagueEnvelope({
    envelope,
    expectedLeagueId: LEAGUE_ID,
    now,
    ledger: ledgerOf(state),
    verify: webCryptoVerifier,
  })
  if (!verified.ok) return { ok: false, code: verified.code, state }
  const inviteDigest =
    mutation.type === 'join' && mutation.invite
      ? await digestInviteCode(mutation.invite)
      : undefined
  const reduced = applyVerifiedMutation(state, verified, now, { inviteDigest })
  if (reduced.ok) who.seq = seq
  return reduced
}

async function must(
  state: AuthorityState,
  who: Actor,
  m: LeagueMutation,
  now: number,
): Promise<AuthorityState> {
  const r = await send(state, who, m, now)
  if (!r.ok) throw new Error(`expected ok, got ${r.code} for ${m.type}`)
  return r.state
}

const fresh = () =>
  createAuthorityState(createLeague({ id: LEAGUE_ID, title: 'M', seasonStart: '2026-03-02' }))

async function founderLeague() {
  const founder = await actor()
  let state = await must(fresh(), founder, { type: 'join', alias: 'Fay' }, T0)
  return { founder, state }
}

/** Mint a code, publish its digest from `by`, return the secret. */
async function mintInvite(
  state: AuthorityState,
  by: Actor,
  now: number,
  opts: { maxUses?: number; ttlMs?: number } = {},
) {
  const code = generateInviteCode()
  const digest = await digestInviteCode(code)
  const next = await must(
    state,
    by,
    { type: 'invite-create', digest, maxUses: opts.maxUses ?? 1, ttlMs: opts.ttlMs ?? HOUR },
    now,
  )
  return { code, digest, state: next }
}

describe('invite code helpers', () => {
  it('generates 32-char url-safe codes that digest to 64 hex chars', async () => {
    const code = generateInviteCode()
    expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(generateInviteCode()).not.toBe(code)
    const digest = await digestInviteCode(code)
    expect(isInviteDigest(digest)).toBe(true)
    expect(await digestInviteCode(code)).toBe(digest)
    expect(isInviteDigest(digest.toUpperCase())).toBe(false)
  })

  it('matches the known SHA-256 of "abc"', async () => {
    expect(await digestInviteCode('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe('mutation schema for membership', () => {
  it('accepts well-formed new mutations and rejects bad ones', () => {
    const digest = 'a'.repeat(64)
    expect(LeagueMutationSchema.safeParse({ type: 'leave' }).success).toBe(true)
    expect(LeagueMutationSchema.safeParse({ type: 'rename', alias: 'Zed' }).success).toBe(true)
    expect(LeagueMutationSchema.safeParse({ type: 'rename', alias: '' }).success).toBe(false)
    expect(
      LeagueMutationSchema.safeParse({ type: 'invite-create', digest, maxUses: 3, ttlMs: HOUR })
        .success,
    ).toBe(true)
    for (const bad of [
      { digest: 'xyz', maxUses: 3, ttlMs: HOUR },
      { digest, maxUses: 0, ttlMs: HOUR },
      { digest, maxUses: 21, ttlMs: HOUR },
      { digest, maxUses: 1, ttlMs: 1000 },
      { digest, maxUses: 1, ttlMs: INVITE_MAX_TTL_MS + 1 },
    ]) {
      expect(LeagueMutationSchema.safeParse({ type: 'invite-create', ...bad }).success).toBe(false)
    }
    expect(
      LeagueMutationSchema.safeParse({ type: 'join', alias: 'A', invite: 'short' }).success,
    ).toBe(false)
  })
})

describe('rename and leave', () => {
  it('rename changes only the alias, and only for members', async () => {
    const { founder, state } = await founderLeague()
    const renamed = await must(state, founder, { type: 'rename', alias: 'Fay 2' }, T0 + 10)
    expect(renamed.aliases[founder.handle]).toBe('Fay 2')
    expect(renamed.league.players).toEqual(state.league.players)
    const outsider = await actor()
    const r = await send(renamed, outsider, { type: 'rename', alias: 'Eve' }, T0 + 20)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('not_member')
  })

  it('leave removes the member and alias, keeps replay bookkeeping', async () => {
    const { founder, state } = await founderLeague()
    const bo = await actor()
    let s = await must(state, bo, { type: 'join', alias: 'Bo' }, T0 + 1)
    s = await must(s, bo, { type: 'leave' }, T0 + 2)
    expect(s.league.players.map((p) => p.handle)).toEqual([founder.handle])
    expect(s.aliases[bo.handle]).toBeUndefined()
    // The signer's sequence survives, so an old envelope cannot be replayed.
    expect(s.lastSeq[bo.handle]).toBe(2)
    const again = await send(s, bo, { type: 'leave' }, T0 + 3)
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.code).toBe('not_member')
  })

  it('a leaver can rejoin but starts from zero', async () => {
    const { founder, state } = await founderLeague()
    const bo = await actor()
    let s = await must(state, bo, { type: 'join', alias: 'Bo' }, T0 + 1)
    s = await must(s, bo, { type: 'leave' }, T0 + 2)
    s = await must(s, bo, { type: 'join', alias: 'Bo again' }, T0 + 3)
    const me = s.league.players.find((p) => p.handle === bo.handle)!
    expect(me.points).toBe(0)
    expect(s.league.players[0]?.handle).toBe(founder.handle)
  })

  it('leaving cancels my open duels but keeps completed history', async () => {
    const { founder, state } = await founderLeague()
    const bo = await actor()
    let s = await must(state, bo, { type: 'join', alias: 'Bo' }, T0 + 1)
    const prompts = [{ id: 'p1', question: 'q', answers: ['a'] }]
    s = await must(
      s,
      founder,
      { type: 'duel-open', duelId: 'open1', opponent: bo.handle, prompts },
      T0 + 2,
    )
    s = await must(
      s,
      founder,
      { type: 'duel-open', duelId: 'done1', opponent: bo.handle, prompts },
      T0 + 3,
    )
    for (const who of [founder, bo]) {
      s = await must(s, who, { type: 'duel-start', duelId: 'done1' }, T0 + 4)
      s = await must(
        s,
        who,
        { type: 'duel-answer', duelId: 'done1', promptId: 'p1', answer: 'a' },
        T0 + 5,
      )
    }
    expect(s.duels['done1']?.status).toBe('complete')
    const left = await send(s, bo, { type: 'leave' }, T0 + 6)
    expect(left.ok).toBe(true)
    if (left.ok) {
      expect(left.state.duels['open1']).toBeUndefined()
      expect(left.state.duels['done1']).toBeDefined()
      expect(left.effects).toContainEqual({ kind: 'left', handle: bo.handle, cancelledDuels: 1 })
    }
  })

  it('the last member leaving resets the league to open and drops invites', async () => {
    const { founder, state } = await founderLeague()
    let s = await must(state, founder, { type: 'invite-policy', required: true }, T0 + 1)
    s = (await mintInvite(s, founder, T0 + 2)).state
    s = await must(s, founder, { type: 'leave' }, T0 + 3)
    expect(s.league.players).toHaveLength(0)
    expect(s.inviteOnly).toBe(false)
    expect(Object.keys(s.invites)).toHaveLength(0)
    const next = await actor()
    expect((await send(s, next, { type: 'join', alias: 'New' }, T0 + 4)).ok).toBe(true)
  })

  it('state with new membership fields still round-trips the schema', async () => {
    const { founder, state } = await founderLeague()
    const minted = await mintInvite(state, founder, T0 + 1)
    expect(AuthorityStateSchema.safeParse(JSON.parse(JSON.stringify(minted.state))).success).toBe(
      true,
    )
  })

  it('old stored state without invite fields parses with safe defaults', () => {
    const legacy = JSON.parse(JSON.stringify(fresh())) as Record<string, unknown>
    delete legacy.invites
    delete legacy.inviteOnly
    const parsed = AuthorityStateSchema.parse(legacy)
    expect(parsed.invites).toEqual({})
    expect(parsed.inviteOnly).toBe(false)
  })
})

describe('invite lifecycle', () => {
  async function inviteOnlyLeague() {
    const { founder, state } = await founderLeague()
    const s = await must(state, founder, { type: 'invite-policy', required: true }, T0 + 1)
    return { founder, state: s }
  }

  it('open leagues ignore a supplied code and do not consume it', async () => {
    const { founder, state } = await founderLeague()
    const inv = await mintInvite(state, founder, T0 + 1)
    const bo = await actor()
    const s = await must(inv.state, bo, { type: 'join', alias: 'Bo', invite: inv.code }, T0 + 2)
    expect(s.invites[inv.digest]?.uses).toEqual([])
  })

  it('an invite-only league refuses a join without or with a wrong code', async () => {
    const { founder, state } = await inviteOnlyLeague()
    const bo = await actor()
    const none = await send(state, bo, { type: 'join', alias: 'Bo' }, T0 + 2)
    expect(none.ok).toBe(false)
    if (!none.ok) expect(none.code).toBe('invite_required')
    const wrong = await send(
      state,
      bo,
      { type: 'join', alias: 'Bo', invite: generateInviteCode() },
      T0 + 3,
    )
    expect(wrong.ok).toBe(false)
    if (!wrong.ok) expect(wrong.code).toBe('invite_invalid')
    expect(state.league.players).toHaveLength(1)
    void founder
  })

  it('a valid code admits one member and is then spent', async () => {
    const { founder, state } = await inviteOnlyLeague()
    const inv = await mintInvite(state, founder, T0 + 2)
    const bo = await actor()
    const cy = await actor()
    const joined = await must(
      inv.state,
      bo,
      { type: 'join', alias: 'Bo', invite: inv.code },
      T0 + 3,
    )
    expect(joined.league.players).toHaveLength(2)
    expect(joined.invites[inv.digest]?.uses).toEqual([bo.handle])
    const second = await send(joined, cy, { type: 'join', alias: 'Cy', invite: inv.code }, T0 + 4)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.code).toBe('invite_invalid')
  })

  it('a multi-use code admits up to maxUses members', async () => {
    const { founder, state } = await inviteOnlyLeague()
    const inv = await mintInvite(state, founder, T0 + 2, { maxUses: 2 })
    let s = inv.state
    for (const alias of ['A', 'B']) {
      s = await must(s, await actor(), { type: 'join', alias, invite: inv.code }, T0 + 3)
    }
    const third = await send(
      s,
      await actor(),
      { type: 'join', alias: 'C', invite: inv.code },
      T0 + 4,
    )
    expect(third.ok).toBe(false)
  })

  it('an expired code is refused', async () => {
    const { founder, state } = await inviteOnlyLeague()
    const inv = await mintInvite(state, founder, T0 + 2, { ttlMs: HOUR })
    const late = await send(
      inv.state,
      await actor(),
      { type: 'join', alias: 'Late', invite: inv.code },
      T0 + 2 + HOUR,
    )
    expect(late.ok).toBe(false)
    if (!late.ok) expect(late.code).toBe('invite_invalid')
  })

  it('a revoked code is refused, by its creator or by the founder', async () => {
    const { founder, state } = await inviteOnlyLeague()
    const bo = await actor()
    let s = (await mintInvite(state, founder, T0 + 2, { maxUses: 5 })).state
    const boInv = await mintInvite(s, founder, T0 + 3, { maxUses: 5 })
    s = await must(boInv.state, bo, { type: 'join', alias: 'Bo', invite: boInv.code }, T0 + 4)
    const own = await mintInvite(s, bo, T0 + 5, { maxUses: 5 })
    const byCreator = await must(
      own.state,
      bo,
      { type: 'invite-revoke', digest: own.digest },
      T0 + 6,
    )
    expect(byCreator.invites[own.digest]?.revoked).toBe(true)
    const own2 = await mintInvite(byCreator, bo, T0 + 7, { maxUses: 5 })
    const byFounder = await must(
      own2.state,
      founder,
      { type: 'invite-revoke', digest: own2.digest },
      T0 + 8,
    )
    const refused = await send(
      byFounder,
      await actor(),
      { type: 'join', alias: 'X', invite: own2.code },
      T0 + 9,
    )
    expect(refused.ok).toBe(false)
  })

  it('only the creator or the founder may revoke, and unknown digests are unknown', async () => {
    const { founder, state } = await inviteOnlyLeague()
    const bo = await actor()
    const cy = await actor()
    const inv = await mintInvite(state, founder, T0 + 2, { maxUses: 5 })
    let s = await must(inv.state, bo, { type: 'join', alias: 'Bo', invite: inv.code }, T0 + 3)
    s = await must(s, cy, { type: 'join', alias: 'Cy', invite: inv.code }, T0 + 4)
    const bad = await send(s, cy, { type: 'invite-revoke', digest: inv.digest }, T0 + 5)
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.code).toBe('not_invite_owner')
    const unknown = await send(
      s,
      founder,
      { type: 'invite-revoke', digest: 'b'.repeat(64) },
      T0 + 6,
    )
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) expect(unknown.code).toBe('invite_unknown')
  })

  it('a creator leaving revokes their outstanding invites', async () => {
    const { founder, state } = await inviteOnlyLeague()
    const bo = await actor()
    const first = await mintInvite(state, founder, T0 + 2)
    let s = await must(first.state, bo, { type: 'join', alias: 'Bo', invite: first.code }, T0 + 3)
    const boInv = await mintInvite(s, bo, T0 + 4, { maxUses: 5 })
    s = await must(boInv.state, bo, { type: 'leave' }, T0 + 5)
    expect(s.invites[boInv.digest]?.revoked).toBe(true)
    const refused = await send(
      s,
      await actor(),
      { type: 'join', alias: 'Z', invite: boInv.code },
      T0 + 6,
    )
    expect(refused.ok).toBe(false)
  })

  it('caps active invites per member and reuses the slot once one ends', async () => {
    const { founder, state } = await inviteOnlyLeague()
    let s = state
    const minted: string[] = []
    for (let i = 0; i < MAX_ACTIVE_INVITES_PER_MEMBER; i++) {
      const m = await mintInvite(s, founder, T0 + 2 + i)
      s = m.state
      minted.push(m.digest)
    }
    const over = await send(
      s,
      founder,
      {
        type: 'invite-create',
        digest: await digestInviteCode('x'.repeat(20)),
        maxUses: 1,
        ttlMs: HOUR,
      },
      T0 + 20,
    )
    expect(over.ok).toBe(false)
    if (!over.ok) expect(over.code).toBe('too_many_invites')
    s = await must(s, founder, { type: 'invite-revoke', digest: minted[0]! }, T0 + 21)
    expect((await mintInvite(s, founder, T0 + 22)).state.accepted).toBeGreaterThan(s.accepted)
  })

  it('refuses a duplicate digest even after it was revoked', async () => {
    const { founder, state } = await inviteOnlyLeague()
    const inv = await mintInvite(state, founder, T0 + 2)
    const s = await must(inv.state, founder, { type: 'invite-revoke', digest: inv.digest }, T0 + 3)
    const again = await send(
      s,
      founder,
      { type: 'invite-create', digest: inv.digest, maxUses: 1, ttlMs: HOUR },
      T0 + 4,
    )
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.code).toBe('invite_exists')
  })

  it('only the founder can change the policy, and outsiders cannot create invites', async () => {
    const { founder, state } = await inviteOnlyLeague()
    const inv = await mintInvite(state, founder, T0 + 2)
    const bo = await actor()
    const s = await must(inv.state, bo, { type: 'join', alias: 'Bo', invite: inv.code }, T0 + 3)
    const notFounder = await send(s, bo, { type: 'invite-policy', required: false }, T0 + 4)
    expect(notFounder.ok).toBe(false)
    if (!notFounder.ok) expect(notFounder.code).toBe('not_founder')
    const outsider = await actor()
    const out = await send(
      s,
      outsider,
      { type: 'invite-create', digest: 'c'.repeat(64), maxUses: 1, ttlMs: HOUR },
      T0 + 5,
    )
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.code).toBe('not_member')
    const open = await must(s, founder, { type: 'invite-policy', required: false }, T0 + 6)
    expect(open.inviteOnly).toBe(false)
  })

  it('a replayed join envelope cannot reuse a spent code', async () => {
    const { founder, state } = await inviteOnlyLeague()
    const inv = await mintInvite(state, founder, T0 + 2)
    const bo = await actor()
    const envelope = await signLeagueMutation({
      signer: bo.signer,
      leagueId: LEAGUE_ID,
      seq: 1,
      mutation: { type: 'join', alias: 'Bo', invite: inv.code },
      timestamp: T0 + 3,
      nonce: 'replay-join-nonce-0001',
    })
    const check = (s: AuthorityState) =>
      verifyLeagueEnvelope({
        envelope,
        expectedLeagueId: LEAGUE_ID,
        now: T0 + 3,
        ledger: ledgerOf(s),
        verify: webCryptoVerifier,
      })
    const first = await check(inv.state)
    if (!first.ok) throw new Error('first verify failed')
    const applied = applyVerifiedMutation(inv.state, first, T0 + 3, {
      inviteDigest: inv.digest,
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    const replay = await check(applied.state)
    expect(replay.ok).toBe(false)
  })

  it('prunes long-dead invites but keeps recent tombstones', async () => {
    const { founder, state } = await inviteOnlyLeague()
    const inv = await mintInvite(state, founder, T0 + 2, { ttlMs: HOUR })
    const soon = await must(inv.state, founder, { type: 'rename', alias: 'F' }, T0 + 3 * HOUR)
    expect(soon.invites[inv.digest]).toBeDefined()
    const much = T0 + 2 + HOUR + INVITE_TOMBSTONE_MS + 1000
    const later = await must(soon, founder, { type: 'rename', alias: 'F2' }, much)
    expect(later.invites[inv.digest]).toBeUndefined()
  })

  it('never exposes plaintext codes in stored state', async () => {
    const { founder, state } = await inviteOnlyLeague()
    const inv = await mintInvite(state, founder, T0 + 2)
    const bo = await actor()
    const s = await must(inv.state, bo, { type: 'join', alias: 'Bo', invite: inv.code }, T0 + 3)
    expect(JSON.stringify(s)).not.toContain(inv.code)
  })
})
