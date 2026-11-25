/**
 * LeagueRoom Durable Object: the authoritative state for ONE league.
 *
 * INACTIVE GROUNDWORK. The worker only routes to this class when the
 * LEAGUES_ENABLED variable is exactly "true"; it ships unset, and the app
 * does not call these routes. Turning it on, deploying it and binding the
 * Durable Object are the owner's decisions.
 *
 * Every state change arrives as a signed envelope. A request is handled in
 * this order, all inside one serialized critical section:
 *
 *   verify envelope (shape, clock window, nonce, sequence, signature)
 *   -> reduce on the authority clock
 *   -> persist the new state in ONE storage write
 *   -> only then replace the in-memory state
 *
 * The critical section matters: signature verification is async, so without
 * it two identical envelopes could both pass the replay check before either
 * commits. A failed storage write leaves memory and storage unchanged.
 */
import {
  AuthorityStateSchema,
  LeagueSchema,
  applyVerifiedMutation,
  createAuthorityState,
  digestInviteCode,
  leaguePlausibilityReport,
  ledgerOf,
  leagueSigningMessage,
  signedEnvelopeSchema,
  signerIdFromPubKey,
  verifyLeagueEnvelope,
  webCryptoVerifier,
  type AuthorityState,
  type SignatureVerifier,
} from '@learning-hub/core/leagues'

const STATE_KEY = 'authority'

/** Body size cap: a mutation is tiny; refuse anything near abuse territory. */
export const MAX_MUTATION_BODY_BYTES = 64 * 1024

export interface LeagueRoomDeps {
  /** Epoch ms; injectable so tests control the authority clock. */
  now?: () => number
  verify?: SignatureVerifier
}

function countLiveInvites(state: AuthorityState, now: number): number {
  return Object.values(state.invites).filter(
    (i) => !i.revoked && now < i.expiresAt && i.uses.length < i.maxUses,
  ).length
}

/** What a client may see: standings and duel progress, never accepted answers. */
export function publicLeagueView(state: AuthorityState, now: number = Date.now()) {
  return {
    ok: true as const,
    league: state.league,
    aliases: state.aliases,
    /** Policy and a live-invite count only: digests and uses stay private. */
    inviteOnly: state.inviteOnly,
    liveInvites: countLiveInvites(state, now),
    duels: Object.values(state.duels).map((d) => ({
      id: d.id,
      playerA: d.playerA,
      playerB: d.playerB,
      status: d.status,
      promptCount: d.prompts.length,
      answeredA: d.answersA.length,
      answeredB: d.answersB.length,
      expiresAt: d.expiresAt,
      result: d.result,
    })),
    accepted: state.accepted,
    /** Advisory timing flags per member (counts only; see plausibility.ts). */
    advisoryFlags: Object.fromEntries(
      Object.entries(leaguePlausibilityReport(state.duels)).map(([h, f]) => [
        h,
        f.map((x) => x.code),
      ]),
    ),
  }
}

/**
 * Read-only spectator summary. Deliberately smaller than publicLeagueView:
 * no duel ids, no per-player timing flags, no public keys. Members are listed
 * alphabetically by alias, never ranked: points here are local activity
 * scoring from signed mutations, not a verified skill measure.
 */
export function spectatorView(state: AuthorityState) {
  const duelStatus: Record<string, number> = {}
  for (const d of Object.values(state.duels)) {
    duelStatus[d.status] = (duelStatus[d.status] ?? 0) + 1
  }
  const members = state.league.players
    .map((p) => ({
      alias: state.aliases[p.handle] ?? 'member',
      activityPoints: p.seasonPoints,
      duels: p.duelsWon + p.duelsLost,
    }))
    .sort((a, b) => a.alias.localeCompare(b.alias))
  return {
    ok: true as const,
    title: state.league.title,
    round: state.league.currentRound,
    practiceOnly: true as const,
    members,
    inviteOnly: state.inviteOnly,
    duelStatus,
    acceptedMutations: state.accepted,
  }
}

export class LeagueRoom {
  private state: DurableObjectState
  private authority: AuthorityState | null = null
  private readonly now: () => number
  private readonly verify: SignatureVerifier
  /** Tail of the serialized critical section. */
  private chain: Promise<unknown> = Promise.resolve()
  /** Resolves once persisted state has been loaded (input gate in production). */
  private readonly ready: Promise<void>

  constructor(state: DurableObjectState, deps: LeagueRoomDeps = {}) {
    this.state = state
    this.now = deps.now ?? (() => Date.now())
    this.verify = deps.verify ?? webCryptoVerifier
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<unknown>(STATE_KEY)
      if (stored) {
        const parsed = AuthorityStateSchema.safeParse(stored)
        if (parsed.success) this.authority = parsed.data
      }
    })
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const run = this.chain.then(work, work)
    this.chain = run.catch(() => undefined)
    return run
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname.endsWith('/state')) {
      if (!this.authority)
        return Response.json({ error: 'league not initialized' }, { status: 404 })
      return Response.json(publicLeagueView(this.authority, this.now()))
    }

    if (request.method === 'GET' && url.pathname.endsWith('/spectate')) {
      if (!this.authority)
        return Response.json({ error: 'league not initialized' }, { status: 404 })
      const etag = `"lg-${this.authority.accepted}"`
      const headers = { ETag: etag, 'Cache-Control': 'no-store' }
      if (request.headers.get('If-None-Match') === etag) {
        return new Response(null, { status: 304, headers })
      }
      return Response.json(spectatorView(this.authority), { headers })
    }

    if (request.method === 'POST' && url.pathname.endsWith('/init')) {
      return this.serialize(() => this.init(request))
    }

    if (request.method === 'POST' && url.pathname.endsWith('/mutate')) {
      return this.serialize(() => this.mutate(request))
    }

    return new Response('Not Found', { status: 404 })
  }

  private async readJson(request: Request): Promise<unknown | Response> {
    const text = await request.text()
    if (text.length > MAX_MUTATION_BODY_BYTES) {
      return Response.json({ error: 'body too large' }, { status: 413 })
    }
    try {
      return JSON.parse(text)
    } catch {
      return Response.json({ error: 'body is not JSON' }, { status: 400 })
    }
  }

  /**
   * Last accepted sequence for the sender, so an out-of-sync client can catch
   * up. The seq check runs before the signature check, so this verifies the
   * signature itself first: an unsigned caller learns nothing about any key.
   */
  private async seqHint(body: unknown, state: AuthorityState): Promise<{ lastSeq?: number }> {
    const parsed = signedEnvelopeSchema.safeParse((body as { envelope?: unknown } | null)?.envelope)
    if (!parsed.success) return {}
    const env = parsed.data
    try {
      const ok = await this.verify({
        pubKey: env.pubKey,
        message: leagueSigningMessage(env.payload, env.timestamp, env.nonce),
        signature: env.signature,
      })
      if (!ok) return {}
      return { lastSeq: ledgerOf(state).lastSeq(await signerIdFromPubKey(env.pubKey)) }
    } catch {
      return {}
    }
  }

  private async init(request: Request): Promise<Response> {
    if (this.authority)
      return Response.json({ error: 'league already initialized' }, { status: 409 })
    const body = await this.readJson(request)
    if (body instanceof Response) return body
    const parsed = LeagueSchema.safeParse((body as { league?: unknown } | null)?.league)
    if (!parsed.success) return Response.json({ error: 'invalid league' }, { status: 400 })
    // A new league starts empty: members only ever arrive through signed joins.
    const league = { ...parsed.data, players: [], currentRound: 0 }
    const next = createAuthorityState(league)
    await this.state.storage.put(STATE_KEY, next)
    this.authority = next
    return Response.json(publicLeagueView(next, this.now()), { status: 201 })
  }

  private async mutate(request: Request): Promise<Response> {
    const current = this.authority
    if (!current) return Response.json({ error: 'league not initialized' }, { status: 404 })
    const body = await this.readJson(request)
    if (body instanceof Response) return body

    const now = this.now()
    const verified = await verifyLeagueEnvelope({
      envelope: (body as { envelope?: unknown } | null)?.envelope,
      expectedLeagueId: current.league.id,
      now,
      ledger: ledgerOf(current),
      verify: this.verify,
    })
    if (!verified.ok) {
      const status = verified.code === 'bad_signature' ? 401 : 400
      if (verified.code === 'bad_seq') {
        return Response.json(
          { ok: false, code: verified.code, ...(await this.seqHint(body, current)) },
          { status },
        )
      }
      return Response.json({ ok: false, code: verified.code }, { status })
    }

    // The reducer is synchronous, so the join's secret is digested here.
    // Only the digest reaches the reducer, state and storage.
    const inviteDigest =
      verified.mutation.type === 'join' && verified.mutation.invite
        ? await digestInviteCode(verified.mutation.invite)
        : undefined
    const reduced = applyVerifiedMutation(current, verified, now, { inviteDigest })
    if (!reduced.ok) return Response.json({ ok: false, code: reduced.code }, { status: 409 })

    // Persist first; memory only advances once storage accepted the write.
    try {
      await this.state.storage.put(STATE_KEY, reduced.state)
    } catch {
      return Response.json({ ok: false, code: 'storage_failed' }, { status: 503 })
    }
    this.authority = reduced.state
    return Response.json({
      ok: true,
      effects: reduced.effects.map((e) => e.kind),
      accepted: reduced.state.accepted,
    })
  }
}
