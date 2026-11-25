import { describe, expect, it } from 'vitest'
import {
  AuthorityStateSchema,
  applyVerifiedMutation,
  createAuthorityState,
  createLeague,
  digestInviteCode,
  generateInviteCode,
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
import { MAX_BLOCKED, MAX_MOD_LOG, MAX_STORED_INVITES } from '../src/leagues/invites'

/**
 * Membership lifecycle fuzz: join (with and without codes), leave, rename,
 * invites, policy, founder remove and unblock, in random order from several
 * signers. Checks the invariants that must hold after every accepted step.
 */

const LEAGUE_ID = 'lg-member-fuzz'
const T0 = Date.parse('2026-03-02T10:00:00.000Z')
const MINUTE = 60_000

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

function checkInvariants(state: AuthorityState) {
  const handles = state.league.players.map((p) => p.handle)
  expect(new Set(handles).size).toBe(handles.length)
  // A blocked handle is never a member and never keeps an alias.
  for (const b of state.blocked) {
    expect(handles).not.toContain(b)
    expect(state.aliases[b]).toBeUndefined()
  }
  expect(new Set(state.blocked).size).toBe(state.blocked.length)
  expect(state.blocked.length).toBeLessThanOrEqual(MAX_BLOCKED)
  expect(state.modLog.length).toBeLessThanOrEqual(MAX_MOD_LOG)
  expect(Object.keys(state.invites).length).toBeLessThanOrEqual(MAX_STORED_INVITES)
  // Every alias belongs to a current member.
  for (const h of Object.keys(state.aliases)) expect(handles).toContain(h)
  // An empty league forgets moderation and invites.
  if (handles.length === 0) {
    expect(state.blocked).toEqual([])
    expect(state.modLog).toEqual([])
    expect(state.inviteOnly).toBe(false)
  }
  // Nobody redeems the same code twice.
  for (const inv of Object.values(state.invites)) {
    expect(new Set(inv.uses).size).toBe(inv.uses.length)
    expect(inv.uses.length).toBeLessThanOrEqual(inv.maxUses)
  }
  expect(AuthorityStateSchema.safeParse(state).success).toBe(true)
}

async function drive(seed: number, steps: number) {
  const rand = rng(seed)
  const actors = await makeActors(4)
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)] as T
  let state = createAuthorityState(
    createLeague({ id: LEAGUE_ID, title: 'Members', seasonStart: '2026-03-02' }),
  )
  const codes: Array<{ code: string; digest: string }> = []
  let now = T0
  let nonce = 0
  const kinds = new Map<string, { ok: number; refused: number }>()
  for (let step = 0; step < steps; step++) {
    // Minutes apart keeps the per-signer rate limit out of the way.
    now += MINUTE + Math.floor(rand() * MINUTE)
    const me = pick(actors)
    const roll = rand()
    let mutation: LeagueMutation
    if (roll < 0.2) {
      const c = codes.length > 0 && rand() < 0.7 ? pick(codes) : undefined
      mutation = c
        ? { type: 'join', alias: `p${step % 9}`, invite: c.code }
        : { type: 'join', alias: `p${step % 9}` }
    } else if (roll < 0.3) mutation = { type: 'leave' }
    else if (roll < 0.4) mutation = { type: 'rename', alias: `n${step % 11}` }
    else if (roll < 0.55) {
      const code = generateInviteCode()
      const digest = await digestInviteCode(code)
      codes.push({ code, digest })
      mutation = {
        type: 'invite-create',
        digest,
        maxUses: 1 + Math.floor(rand() * 3),
        ttlMs: (1 + Math.floor(rand() * 30)) * MINUTE,
      }
    } else if (roll < 0.62 && codes.length > 0) {
      mutation = { type: 'invite-revoke', digest: pick(codes).digest }
    } else if (roll < 0.7) mutation = { type: 'invite-policy', required: rand() < 0.5 }
    else if (roll < 0.87) mutation = { type: 'remove-member', target: pick(actors).handle }
    else if (roll < 0.94) mutation = { type: 'unblock-member', target: pick(actors).handle }
    else mutation = { type: 'transfer-founder', target: pick(actors).handle }

    const envelope = await signLeagueMutation({
      signer: me.signer,
      leagueId: LEAGUE_ID,
      seq: me.seq + 1,
      mutation,
      timestamp: now,
      nonce: `mfuzz-${seed}-${String(++nonce).padStart(8, '0')}`,
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
    const tally = kinds.get(mutation.type) ?? { ok: 0, refused: 0 }
    if (reduced?.ok && verified.ok) {
      state = reduced.state
      me.seq = verified.seq
      tally.ok++
    } else {
      tally.refused++
      expect(state).toEqual(before)
    }
    kinds.set(mutation.type, tally)
    checkInvariants(state)
  }
  return { state, kinds }
}

describe('membership lifecycle fuzz', () => {
  const totals = new Map<string, number>()
  for (const seed of [3, 11, 29, 101, 202, 303]) {
    it(`keeps membership invariants over a random run (seed ${seed})`, async () => {
      const { kinds } = await drive(seed, 150)
      for (const [k, v] of kinds) totals.set(k, (totals.get(k) ?? 0) + v.ok)
      expect(kinds.get('join')?.ok ?? 0).toBeGreaterThan(0)
    }, 120_000)
  }

  it('across the seeds, moderation and invites were actually accepted at least once', () => {
    for (const k of [
      'join',
      'leave',
      'invite-create',
      'remove-member',
      'unblock-member',
      'transfer-founder',
    ]) {
      expect(totals.get(k) ?? 0, k).toBeGreaterThan(0)
    }
  })

  it('is deterministic for a seed', async () => {
    const a = await drive(8, 60)
    const b = await drive(8, 60)
    expect([...a.kinds.entries()].sort()).toEqual([...b.kinds.entries()].sort())
    expect(a.state.blocked.length).toBe(b.state.blocked.length)
  }, 120_000)
})
