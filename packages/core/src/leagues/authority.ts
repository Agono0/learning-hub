/**
 * League authority reducer (lh-league-authority/v1).
 *
 * INACTIVE GROUNDWORK, like signed.ts. Pure state transitions for a remote
 * league authority: it takes an already-verified mutation (see
 * verifyLeagueEnvelope) and the authority's own clock, and returns the next
 * state or a rejection with the state untouched.
 *
 * What the authority controls: who the actor is (the signing key), when each
 * duel side started and answered (its own clock), the order of answers, and
 * when a round may close. What it cannot control: whether the human answered
 * unaided. Scoring is activity scoring between members who chose to play; it
 * is not an anti-cheat guarantee.
 */
import { z } from 'zod'
import {
  awardPoints,
  closeRound,
  isRoundDue,
  isSeasonComplete,
  joinLeague,
  LeagueSchema,
  type League,
  type RoundResult,
} from './engine'
import { decideDuel, type Duel, type DuelResult } from './duels'
import { pruneDuels } from './retention'
import { INVITE_TOMBSTONE_MS, MAX_ACTIVE_INVITES_PER_MEMBER, MAX_STORED_INVITES } from './invites'
import type { LeagueMutation } from './signed-schemas'
import type { ReplayLedger, VerifiedMutation } from './signed'
import { NONCE_RETENTION_MS } from './signed'

export const AUTHORITY_SCHEMA = 'lh-league-authority/v1'

export const MAX_MEMBERS = 500
export const MAX_OPEN_DUELS_PER_MEMBER = 5
export const DUEL_LIFETIME_MS = 24 * 60 * 60_000
export const MAX_LOG_ENTRIES = 200
/** Accepted mutations per signer inside RATE_WINDOW_MS. */
export const RATE_LIMIT = 60
export const RATE_WINDOW_MS = 60_000

const SideRuntimeSchema = z.object({
  startedAt: z.number().int(),
  lastAt: z.number().int(),
  next: z.number().int().nonnegative(),
})
export type SideRuntime = z.infer<typeof SideRuntimeSchema>

const AcceptedAnswerSchema = z.object({
  promptId: z.string(),
  answer: z.string(),
  /** Authority-measured milliseconds since the side started or last answered. */
  elapsedMs: z.number().nonnegative(),
  receivedAt: z.number().int(),
})

const DuelRuntimeSchema = z.object({
  id: z.string(),
  playerA: z.string(),
  playerB: z.string(),
  prompts: z
    .array(z.object({ id: z.string(), question: z.string(), answers: z.array(z.string()) }))
    .min(1),
  openedAt: z.number().int(),
  expiresAt: z.number().int(),
  sideA: SideRuntimeSchema.nullable(),
  sideB: SideRuntimeSchema.nullable(),
  answersA: z.array(AcceptedAnswerSchema),
  answersB: z.array(AcceptedAnswerSchema),
  status: z.enum(['open', 'complete']),
  result: z
    .object({
      winner: z.string().nullable(),
      loser: z.string().nullable(),
      draw: z.boolean(),
      correctA: z.number().int(),
      correctB: z.number().int(),
    })
    .nullable(),
})
export type DuelRuntime = z.infer<typeof DuelRuntimeSchema>

const InviteSchema = z.object({
  creator: z.string(),
  createdAt: z.number().int(),
  expiresAt: z.number().int(),
  maxUses: z.number().int().min(1),
  /** Handles that joined with this invite. Never exposed in public views. */
  uses: z.array(z.string()),
  revoked: z.boolean(),
})
export type Invite = z.infer<typeof InviteSchema>

export const AcceptedEntrySchema = z.object({
  n: z.number().int().positive(),
  at: z.number().int(),
  signer: z.string(),
  seq: z.number().int().positive(),
  type: z.string(),
})
export type AcceptedEntry = z.infer<typeof AcceptedEntrySchema>

export const AuthorityStateSchema = z.object({
  schema: z.literal(AUTHORITY_SCHEMA),
  league: LeagueSchema,
  /** signer id -> display alias (display only, never an identity). */
  aliases: z.record(z.string(), z.string()),
  duels: z.record(z.string(), DuelRuntimeSchema),
  lastSeq: z.record(z.string(), z.number().int().nonnegative()),
  /** nonce -> acceptance time, pruned after NONCE_RETENTION_MS. */
  nonces: z.record(z.string(), z.number().int()),
  /** signer id -> acceptance times inside the rate window. */
  rate: z.record(z.string(), z.array(z.number().int())).default({}),
  /** Invite digest -> invite. Only digests are stored, never codes. */
  invites: z.record(z.string(), InviteSchema).default({}),
  /** When true, joining needs a live invite (unless the league is empty). */
  inviteOnly: z.boolean().default(false),
  accepted: z.number().int().nonnegative(),
  log: z.array(AcceptedEntrySchema),
})
export type AuthorityState = z.infer<typeof AuthorityStateSchema>

export function createAuthorityState(league: League): AuthorityState {
  return AuthorityStateSchema.parse({
    schema: AUTHORITY_SCHEMA,
    league,
    aliases: {},
    duels: {},
    lastSeq: {},
    nonces: {},
    rate: {},
    invites: {},
    inviteOnly: false,
    accepted: 0,
    log: [],
  })
}

export function ledgerOf(state: AuthorityState): ReplayLedger {
  return {
    hasNonce: (nonce) => Object.prototype.hasOwnProperty.call(state.nonces, nonce),
    lastSeq: (signer) => state.lastSeq[signer] ?? 0,
  }
}

export type ReduceFailureCode =
  | 'already_member'
  | 'league_full'
  | 'not_member'
  | 'self_duel'
  | 'opponent_not_member'
  | 'duel_exists'
  | 'too_many_open_duels'
  | 'duel_unknown'
  | 'not_in_duel'
  | 'duel_expired'
  | 'duel_complete'
  | 'side_already_started'
  | 'side_not_started'
  | 'side_finished'
  | 'out_of_order'
  | 'round_not_due'
  | 'season_complete'
  | 'rate_limited'
  | 'invite_required'
  | 'invite_invalid'
  | 'invite_exists'
  | 'too_many_invites'
  | 'invite_unknown'
  | 'not_invite_owner'
  | 'not_founder'

export type ReduceEffect =
  | { kind: 'joined'; handle: string }
  | { kind: 'duel-opened'; duelId: string }
  | { kind: 'duel-started'; duelId: string; handle: string }
  | { kind: 'duel-answered'; duelId: string; handle: string; elapsedMs: number }
  | { kind: 'duel-decided'; duelId: string; result: DuelResult }
  | { kind: 'round-closed'; round: RoundResult }
  | { kind: 'renamed'; handle: string }
  | { kind: 'left'; handle: string; cancelledDuels: number }
  | { kind: 'invite-created'; digest: string }
  | { kind: 'invite-revoked'; digest: string }
  | { kind: 'invite-policy'; required: boolean }

export type ReduceResult =
  | { ok: true; state: AuthorityState; effects: ReduceEffect[] }
  | { ok: false; code: ReduceFailureCode; state: AuthorityState }

function sideOf(duel: DuelRuntime, handle: string): 'A' | 'B' | null {
  if (duel.playerA === handle) return 'A'
  if (duel.playerB === handle) return 'B'
  return null
}

function asDuel(runtime: DuelRuntime): Duel {
  return {
    id: runtime.id,
    playerA: runtime.playerA,
    playerB: runtime.playerB,
    prompts: runtime.prompts,
    answersA: runtime.answersA.map((a) => ({
      promptId: a.promptId,
      answer: a.answer,
      elapsedMs: a.elapsedMs,
    })),
    answersB: runtime.answersB.map((a) => ({
      promptId: a.promptId,
      answer: a.answer,
      elapsedMs: a.elapsedMs,
    })),
    createdAt: new Date(runtime.openedAt).toISOString(),
  }
}

function openDuelsFor(state: AuthorityState, handle: string): number {
  return Object.values(state.duels).filter(
    (d) => d.status === 'open' && (d.playerA === handle || d.playerB === handle),
  ).length
}

/** Extra facts the async room computes before the sync reducer runs. */
export interface ApplyContext {
  /** SHA-256 hex digest of the join's `invite` code, when it carried one. */
  inviteDigest?: string
}

function inviteIsLive(inv: Invite, now: number): boolean {
  return !inv.revoked && now < inv.expiresAt && inv.uses.length < inv.maxUses
}

function activeInvitesFor(state: AuthorityState, handle: string, now: number): number {
  return Object.values(state.invites).filter((i) => i.creator === handle && inviteIsLive(i, now))
    .length
}

/** Drop invites that ended more than the tombstone window ago, then cap size. */
export function pruneInvites(invites: Record<string, Invite>, now: number): Record<string, Invite> {
  // Every invite is dead once expired, whatever its other state, so the
  // expiry time alone decides when its tombstone can go.
  const kept = Object.entries(invites).filter(
    ([, inv]) => now - inv.expiresAt <= INVITE_TOMBSTONE_MS,
  )
  kept.sort((a, b) => b[1].createdAt - a[1].createdAt)
  return Object.fromEntries(kept.slice(0, MAX_STORED_INVITES))
}

function reject(state: AuthorityState, code: ReduceFailureCode): ReduceResult {
  return { ok: false, code, state }
}

/** Drop nonces older than the retention window. Pure. */
export function pruneNonces(state: AuthorityState, now: number): AuthorityState {
  const kept: Record<string, number> = {}
  let dropped = false
  for (const [nonce, at] of Object.entries(state.nonces)) {
    if (now - at <= NONCE_RETENTION_MS) kept[nonce] = at
    else dropped = true
  }
  return dropped ? { ...state, nonces: kept } : state
}

function commit(
  state: AuthorityState,
  v: Extract<VerifiedMutation, { ok: true }>,
  now: number,
  patch: Partial<AuthorityState>,
  effects: ReduceEffect[],
): ReduceResult {
  const accepted = state.accepted + 1
  const windowStart = now - RATE_WINDOW_MS
  const recent = (state.rate[v.signer] ?? []).filter((t) => t > windowStart)
  recent.push(now)
  const log = [
    ...state.log,
    { n: accepted, at: now, signer: v.signer, seq: v.seq, type: v.mutation.type },
  ].slice(-MAX_LOG_ENTRIES)
  const merged: AuthorityState = { ...state, ...patch }
  const next: AuthorityState = {
    ...merged,
    duels: pruneDuels(merged.duels, now).duels,
    invites: pruneInvites(merged.invites, now),
    lastSeq: { ...state.lastSeq, [v.signer]: v.seq },
    nonces: { ...state.nonces, [v.nonce]: now },
    rate: { ...state.rate, [v.signer]: recent },
    accepted,
    log,
  }
  return { ok: true, state: next, effects }
}

/**
 * Apply one verified mutation at authority time `now` (epoch ms). Either the
 * whole mutation commits (including the replay bookkeeping) or the state is
 * returned unchanged with a rejection code. Never throws on user input.
 */
export function applyVerifiedMutation(
  stateIn: AuthorityState,
  v: Extract<VerifiedMutation, { ok: true }>,
  now: number,
  ctx: ApplyContext = {},
): ReduceResult {
  const state = pruneNonces(stateIn, now)
  const m: LeagueMutation = v.mutation
  const handle = v.signer
  const isMember = state.league.players.some((p) => p.handle === handle)
  const recentCount = (state.rate[handle] ?? []).filter((t) => t > now - RATE_WINDOW_MS).length
  if (recentCount >= RATE_LIMIT) return reject(stateIn, 'rate_limited')

  switch (m.type) {
    case 'join': {
      if (isMember) return reject(stateIn, 'already_member')
      if (state.league.players.length >= MAX_MEMBERS) return reject(stateIn, 'league_full')
      let invites = state.invites
      // An empty league is always open: its next member becomes the founder.
      if (state.inviteOnly && state.league.players.length > 0) {
        if (!m.invite) return reject(stateIn, 'invite_required')
        const inv = ctx.inviteDigest ? state.invites[ctx.inviteDigest] : undefined
        if (!ctx.inviteDigest || !inv || !inviteIsLive(inv, now)) {
          // One code for unknown, expired, revoked and spent: no probing oracle.
          return reject(stateIn, 'invite_invalid')
        }
        invites = {
          ...state.invites,
          [ctx.inviteDigest]: { ...inv, uses: [...inv.uses, handle] },
        }
      }
      const league = joinLeague(state.league, handle)
      return commit(
        state,
        v,
        now,
        { league, invites, aliases: { ...state.aliases, [handle]: m.alias } },
        [{ kind: 'joined', handle }],
      )
    }

    case 'rename': {
      if (!isMember) return reject(stateIn, 'not_member')
      return commit(state, v, now, { aliases: { ...state.aliases, [handle]: m.alias } }, [
        { kind: 'renamed', handle },
      ])
    }

    case 'leave': {
      if (!isMember) return reject(stateIn, 'not_member')
      const players = state.league.players.filter((p) => p.handle !== handle)
      const league = LeagueSchema.parse({ ...state.league, players })
      const aliases = { ...state.aliases }
      delete aliases[handle]
      const duels: Record<string, DuelRuntime> = {}
      let cancelled = 0
      for (const [id, d] of Object.entries(state.duels)) {
        if (d.status === 'open' && (d.playerA === handle || d.playerB === handle)) cancelled++
        else duels[id] = d
      }
      // The leaver's invites die with them; an empty league resets to open.
      const invites: Record<string, Invite> =
        players.length === 0
          ? {}
          : Object.fromEntries(
              Object.entries(state.invites).map(([d, inv]) => [
                d,
                inv.creator === handle ? { ...inv, revoked: true } : inv,
              ]),
            )
      return commit(
        state,
        v,
        now,
        {
          league,
          aliases,
          duels,
          invites,
          inviteOnly: players.length === 0 ? false : state.inviteOnly,
        },
        [{ kind: 'left', handle, cancelledDuels: cancelled }],
      )
    }

    case 'invite-create': {
      if (!isMember) return reject(stateIn, 'not_member')
      if (state.invites[m.digest]) return reject(stateIn, 'invite_exists')
      if (activeInvitesFor(state, handle, now) >= MAX_ACTIVE_INVITES_PER_MEMBER) {
        return reject(stateIn, 'too_many_invites')
      }
      const invite: Invite = {
        creator: handle,
        createdAt: now,
        expiresAt: now + m.ttlMs,
        maxUses: m.maxUses,
        uses: [],
        revoked: false,
      }
      return commit(state, v, now, { invites: { ...state.invites, [m.digest]: invite } }, [
        { kind: 'invite-created', digest: m.digest },
      ])
    }

    case 'invite-revoke': {
      if (!isMember) return reject(stateIn, 'not_member')
      const inv = state.invites[m.digest]
      if (!inv) return reject(stateIn, 'invite_unknown')
      const founder = state.league.players[0]?.handle
      if (inv.creator !== handle && founder !== handle) return reject(stateIn, 'not_invite_owner')
      return commit(
        state,
        v,
        now,
        { invites: { ...state.invites, [m.digest]: { ...inv, revoked: true } } },
        [{ kind: 'invite-revoked', digest: m.digest }],
      )
    }

    case 'invite-policy': {
      if (!isMember) return reject(stateIn, 'not_member')
      if (state.league.players[0]?.handle !== handle) return reject(stateIn, 'not_founder')
      return commit(state, v, now, { inviteOnly: m.required }, [
        { kind: 'invite-policy', required: m.required },
      ])
    }

    case 'duel-open': {
      if (!isMember) return reject(stateIn, 'not_member')
      if (m.opponent === handle) return reject(stateIn, 'self_duel')
      if (!state.league.players.some((p) => p.handle === m.opponent)) {
        return reject(stateIn, 'opponent_not_member')
      }
      if (state.duels[m.duelId]) return reject(stateIn, 'duel_exists')
      if (
        openDuelsFor(state, handle) >= MAX_OPEN_DUELS_PER_MEMBER ||
        openDuelsFor(state, m.opponent) >= MAX_OPEN_DUELS_PER_MEMBER
      ) {
        return reject(stateIn, 'too_many_open_duels')
      }
      const runtime: DuelRuntime = {
        id: m.duelId,
        playerA: handle,
        playerB: m.opponent,
        prompts: m.prompts,
        openedAt: now,
        expiresAt: now + DUEL_LIFETIME_MS,
        sideA: null,
        sideB: null,
        answersA: [],
        answersB: [],
        status: 'open',
        result: null,
      }
      return commit(state, v, now, { duels: { ...state.duels, [m.duelId]: runtime } }, [
        { kind: 'duel-opened', duelId: m.duelId },
      ])
    }

    case 'duel-start': {
      if (!isMember) return reject(stateIn, 'not_member')
      const duel = state.duels[m.duelId]
      if (!duel) return reject(stateIn, 'duel_unknown')
      const side = sideOf(duel, handle)
      if (!side) return reject(stateIn, 'not_in_duel')
      if (duel.status === 'complete') return reject(stateIn, 'duel_complete')
      if (now >= duel.expiresAt) return reject(stateIn, 'duel_expired')
      const existing = side === 'A' ? duel.sideA : duel.sideB
      if (existing) return reject(stateIn, 'side_already_started')
      const started: SideRuntime = { startedAt: now, lastAt: now, next: 0 }
      const updated: DuelRuntime =
        side === 'A' ? { ...duel, sideA: started } : { ...duel, sideB: started }
      return commit(state, v, now, { duels: { ...state.duels, [duel.id]: updated } }, [
        { kind: 'duel-started', duelId: duel.id, handle },
      ])
    }

    case 'duel-answer': {
      if (!isMember) return reject(stateIn, 'not_member')
      const duel = state.duels[m.duelId]
      if (!duel) return reject(stateIn, 'duel_unknown')
      const side = sideOf(duel, handle)
      if (!side) return reject(stateIn, 'not_in_duel')
      if (duel.status === 'complete') return reject(stateIn, 'duel_complete')
      if (now >= duel.expiresAt) return reject(stateIn, 'duel_expired')
      const runtime = side === 'A' ? duel.sideA : duel.sideB
      if (!runtime) return reject(stateIn, 'side_not_started')
      if (runtime.next >= duel.prompts.length) return reject(stateIn, 'side_finished')
      const expected = duel.prompts[runtime.next]
      if (!expected || expected.id !== m.promptId) return reject(stateIn, 'out_of_order')

      const elapsedMs = Math.max(0, now - runtime.lastAt)
      const answer = { promptId: m.promptId, answer: m.answer, elapsedMs, receivedAt: now }
      const nextRuntime: SideRuntime = { ...runtime, lastAt: now, next: runtime.next + 1 }
      let updated: DuelRuntime =
        side === 'A'
          ? { ...duel, sideA: nextRuntime, answersA: [...duel.answersA, answer] }
          : { ...duel, sideB: nextRuntime, answersB: [...duel.answersB, answer] }

      const effects: ReduceEffect[] = [
        { kind: 'duel-answered', duelId: duel.id, handle, elapsedMs },
      ]
      let league = state.league
      const bothDone =
        updated.answersA.length >= updated.prompts.length &&
        updated.answersB.length >= updated.prompts.length
      if (bothDone) {
        const result = decideDuel(asDuel(updated))
        updated = {
          ...updated,
          status: 'complete',
          result: {
            winner: result.winner,
            loser: result.loser,
            draw: result.draw,
            correctA: result.scoreA.correct,
            correctB: result.scoreB.correct,
          },
        }
        league = awardPoints(league, {
          kind: 'duel',
          winner: result.winner ?? updated.playerA,
          loser: result.loser ?? updated.playerB,
          draw: result.draw,
        })
        effects.push({ kind: 'duel-decided', duelId: duel.id, result })
      }
      return commit(
        state,
        v,
        now,
        { league, duels: { ...state.duels, [duel.id]: updated } },
        effects,
      )
    }

    case 'close-round': {
      if (!isMember) return reject(stateIn, 'not_member')
      if (isSeasonComplete(state.league)) return reject(stateIn, 'season_complete')
      if (!isRoundDue(state.league, new Date(now))) return reject(stateIn, 'round_not_due')
      const round = closeRound(state.league)
      return commit(state, v, now, { league: round.league }, [{ kind: 'round-closed', round }])
    }
  }
}
