/**
 * /api/leagues — competitive study leagues (lh-leagues/v1): seasons with
 * divisions and promotion/relegation, duels, and tournaments, over the
 * shared leagues repository (packages/db repos/leagues).
 */
import { z } from 'zod'
import {
  awardLeaguePoints,
  createDuelFromDeck,
  closeLeagueRound,
  createLeagueDuel,
  createLeagueRow,
  createLeagueTournament,
  getLeagueBySlug,
  getLeagueDuel,
  getLeagueTournament,
  joinLeagueRow,
  leagueChampion,
  leaguePlayerProfile,
  leagueStandings,
  listLeagueDuels,
  listLeaguePlayers,
  listLeagueRounds,
  listLeagueRows,
  listLeagueTournaments,
  openTournamentMatches,
  recordTournamentMatchResult,
  submitDuelAnswers,
} from '@learning-hub/db'
import { DIVISION_ORDER } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const tierEnum = z.enum(['bronze', 'silver', 'gold', 'platinum', 'diamond'])

/** GET /api/leagues?view=…&slug=… — read surface for the leagues UI. */
export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const view = url.searchParams.get('view') ?? 'list'

  if (view === 'list') return Response.json({ ok: true, leagues: listLeagueRows() })

  const slug = url.searchParams.get('slug') ?? ''
  if (view === 'detail') {
    const league = getLeagueBySlug(slug)
    if (!league) return Response.json({ error: `league not found: ${slug}` }, { status: 404 })
    return Response.json({
      ok: true,
      league,
      players: listLeaguePlayers(slug),
      champion: leagueChampion(slug),
      divisions: DIVISION_ORDER.map((tier) => ({
        tier,
        standings: leagueStandings(slug, tier),
      })),
      rounds: listLeagueRounds(slug),
      duels: listLeagueDuels({ leagueSlug: slug }),
      tournaments: listLeagueTournaments({ leagueSlug: slug }),
    })
  }
  if (view === 'player') {
    const handle = url.searchParams.get('handle') ?? ''
    const profile = leaguePlayerProfile(slug, handle)
    if (!profile) return Response.json({ error: 'player not found' }, { status: 404 })
    return Response.json({ ok: true, profile })
  }
  if (view === 'standings') {
    const tier = tierEnum.optional().parse(url.searchParams.get('tier') ?? undefined)
    if (!getLeagueBySlug(slug))
      return Response.json({ error: `league not found: ${slug}` }, { status: 404 })
    if (tier) return Response.json({ ok: true, tier, standings: leagueStandings(slug, tier) })
    return Response.json({
      ok: true,
      champion: leagueChampion(slug),
      divisions: DIVISION_ORDER.map((t) => ({ tier: t, standings: leagueStandings(slug, t) })),
    })
  }
  if (view === 'duels') {
    const status = z
      .enum(['open', 'complete'])
      .optional()
      .parse(url.searchParams.get('status') ?? undefined)
    return Response.json({
      ok: true,
      duels: listLeagueDuels({ leagueSlug: slug || undefined, status }),
    })
  }
  if (view === 'duel') {
    const duel = getLeagueDuel(slug)
    if (!duel) return Response.json({ error: `duel not found: ${slug}` }, { status: 404 })
    return Response.json({ ok: true, duel })
  }
  if (view === 'tournaments') {
    const status = z
      .enum(['open', 'complete'])
      .optional()
      .parse(url.searchParams.get('status') ?? undefined)
    return Response.json({
      ok: true,
      tournaments: listLeagueTournaments({ leagueSlug: slug || undefined, status }),
    })
  }
  if (view === 'tournament-open') {
    if (!getLeagueTournament(slug))
      return Response.json({ error: `tournament not found: ${slug}` }, { status: 404 })
    return Response.json({ ok: true, matches: openTournamentMatches(slug) })
  }
  return Response.json({ error: `unknown view: ${view}` }, { status: 400 })
})

const postSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    slug: z.string().min(1).max(60),
    title: z.string().min(1).max(200),
    seasonStart: z.string().min(1).optional(),
    roundLengthDays: z.number().int().min(1).max(28).optional(),
    promotionSlots: z.number().int().min(1).max(10).optional(),
    relegationSlots: z.number().int().min(0).max(10).optional(),
  }),
  z.object({
    action: z.literal('join'),
    slug: z.string().min(1),
    handle: z.string().min(1).max(50),
  }),
  z.object({
    action: z.literal('points'),
    slug: z.string().min(1),
    handle: z.string().min(1),
    reviews: z.number().optional(),
    focusMinutes: z.number().optional(),
  }),
  z.object({ action: z.literal('close-round'), slug: z.string().min(1) }),
  z.object({
    action: z.literal('duel-create'),
    slug: z.string().min(1).max(60),
    leagueSlug: z.string().min(1).optional(),
    playerA: z.string().min(1).max(50),
    playerB: z.string().min(1).max(50),
    prompts: z
      .array(
        z.object({
          id: z.string().min(1),
          question: z.string().min(1),
          answers: z.array(z.string().min(1)).min(1),
        }),
      )
      .min(1)
      .max(50),
  }),
  z.object({
    action: z.literal('duel-create-from-deck'),
    slug: z.string().min(1).max(60),
    deckId: z.number().int().positive(),
    leagueSlug: z.string().min(1).optional(),
    playerA: z.string().min(1).max(50),
    playerB: z.string().min(1).max(50),
    limit: z.number().int().min(1).max(50).optional(),
    seed: z.number().int().optional(),
  }),
  z.object({
    action: z.literal('duel-answer'),
    slug: z.string().min(1),
    side: z.enum(['A', 'B']),
    answers: z.array(
      z.object({
        promptId: z.string().min(1),
        answer: z.string(),
        elapsedMs: z.number().nonnegative(),
      }),
    ),
  }),
  z.object({
    action: z.literal('tournament-create'),
    slug: z.string().min(1).max(60),
    leagueSlug: z.string().min(1).optional(),
    title: z.string().min(1).max(200),
    seeds: z.array(z.string().min(1)).min(2).max(64),
  }),
  z.object({
    action: z.literal('tournament-result'),
    slug: z.string().min(1),
    round: z.number().int().positive(),
    position: z.number().int().nonnegative(),
    winner: z.string().min(1),
    duelId: z.string().min(1).optional(),
  }),
])

/** POST /api/leagues — action dispatch (create/join/points/duels/tournaments). */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, postSchema)
  try {
    switch (body.action) {
      case 'create': {
        if (getLeagueBySlug(body.slug)) {
          return Response.json({ error: `league exists: ${body.slug}` }, { status: 409 })
        }
        const league = createLeagueRow(body)
        return Response.json({ ok: true, league }, { status: 201 })
      }
      case 'join': {
        const player = joinLeagueRow(body.slug, body.handle)
        return Response.json({ ok: true, player }, { status: 201 })
      }
      case 'points': {
        if (body.reviews === undefined && body.focusMinutes === undefined) {
          return Response.json({ error: 'pass reviews or focusMinutes' }, { status: 400 })
        }
        const event =
          body.reviews !== undefined
            ? ({ kind: 'reviews', handle: body.handle, count: body.reviews } as const)
            : ({ kind: 'focus', handle: body.handle, minutes: body.focusMinutes! } as const)
        const player = awardLeaguePoints(body.slug, event)
        return Response.json({ ok: true, awarded: player !== null, player })
      }
      case 'close-round': {
        const r = closeLeagueRound(body.slug)
        return Response.json({
          ok: true,
          round: r.round.round,
          promoted: r.promoted,
          relegated: r.relegated,
        })
      }
      case 'duel-create': {
        if (getLeagueDuel(body.slug)) {
          return Response.json({ error: `duel exists: ${body.slug}` }, { status: 409 })
        }
        const duel = createLeagueDuel(body)
        return Response.json({ ok: true, duel }, { status: 201 })
      }
      case 'duel-create-from-deck': {
        if (getLeagueDuel(body.slug)) {
          return Response.json({ error: `duel exists: ${body.slug}` }, { status: 409 })
        }
        const duel = createDuelFromDeck(body)
        return Response.json({ ok: true, duel }, { status: 201 })
      }
      case 'duel-answer': {
        const r = submitDuelAnswers(body.slug, body.side, body.answers)
        return Response.json({ ok: true, decided: r.decided, winner: r.winner, duel: r.duel })
      }
      case 'tournament-create': {
        if (getLeagueTournament(body.slug)) {
          return Response.json({ error: `tournament exists: ${body.slug}` }, { status: 409 })
        }
        const tournament = createLeagueTournament(body)
        return Response.json({ ok: true, tournament }, { status: 201 })
      }
      case 'tournament-result': {
        const tournament = recordTournamentMatchResult(
          body.slug,
          body.round,
          body.position,
          body.winner,
          body.duelId,
        )
        return Response.json({ ok: true, tournament })
      }
    }
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'league action failed' },
      { status: 400 },
    )
  }
})
