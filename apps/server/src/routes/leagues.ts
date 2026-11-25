/**
 * Learning HUB headless server — COMPETITIVE LEAGUES routes.
 *
 * Seasonal leagues (lh-leagues/v1): five divisions, weekly rounds,
 * promotion/relegation, head-to-head duels with Elo, and seeded
 * single-elimination tournaments. Every handler delegates to the shared
 * leagues repo (packages/db repos/leagues) so web, MCP, CLI and REST hosts
 * cannot drift (AGENTS.md rule 7).
 */
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  awardLeaguePoints,
  closeDueRounds,
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
  leagueStandings,
  listLeagueDuels,
  listLeaguePlayers,
  listLeagueRounds,
  listLeagueSeasons,
  listLeagueRows,
  listLeagueTournaments,
  openTournamentMatches,
  recordTournamentMatchResult,
  submitDuelAnswers,
} from '@learning-hub/db'
import { DIVISION_ORDER } from '@learning-hub/core'
import { jsonError, sendJson, readJson, readQuery } from '../http'
import type { Route } from './shared'

// ── Schemas ─────────────────────────────────────────────────────────────────

const createLeagueSchema = z.object({
  slug: z.string().min(1).max(60),
  title: z.string().min(1).max(200),
  seasonStart: z.string().min(1).optional(),
  roundLengthDays: z.number().int().min(1).max(28).optional(),
  seasonLengthRounds: z.number().int().min(2).max(52).optional(),
  promotionSlots: z.number().int().min(1).max(10).optional(),
  relegationSlots: z.number().int().min(0).max(10).optional(),
})

const joinSchema = z.object({
  slug: z.string().min(1),
  handle: z.string().min(1).max(50),
})

const pointsSchema = z.object({
  slug: z.string().min(1),
  event: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('reviews'), handle: z.string().min(1), count: z.number() }),
    z.object({ kind: z.literal('focus'), handle: z.string().min(1), minutes: z.number() }),
    z.object({
      kind: z.literal('duel'),
      winner: z.string().min(1),
      loser: z.string().min(1),
      draw: z.boolean().optional(),
    }),
  ]),
})

const slugQuerySchema = z.object({ slug: z.string().min(1) })

const standingsQuerySchema = z.object({
  slug: z.string().min(1),
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum', 'diamond']).optional(),
})

const duelCreateSchema = z.object({
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
})

const duelFromDeckSchema = z.object({
  slug: z.string().min(1).max(60),
  deckId: z.number().int().positive(),
  leagueSlug: z.string().min(1).optional(),
  playerA: z.string().min(1).max(50),
  playerB: z.string().min(1).max(50),
  limit: z.number().int().min(1).max(50).optional(),
  seed: z.number().int().optional(),
})

const duelAnswersSchema = z.object({
  slug: z.string().min(1),
  side: z.enum(['A', 'B']),
  answers: z.array(
    z.object({
      promptId: z.string().min(1),
      answer: z.string(),
      elapsedMs: z.number().nonnegative(),
    }),
  ),
})

const duelListQuerySchema = z.object({
  leagueSlug: z.string().min(1).optional(),
  status: z.enum(['open', 'complete']).optional(),
})

const tournamentCreateSchema = z.object({
  slug: z.string().min(1).max(60),
  leagueSlug: z.string().min(1).optional(),
  title: z.string().min(1).max(200),
  seeds: z.array(z.string().min(1)).min(2).max(64),
})

const tournamentResultSchema = z.object({
  slug: z.string().min(1),
  round: z.number().int().positive(),
  position: z.number().int().nonnegative(),
  winner: z.string().min(1),
  duelId: z.string().min(1).optional(),
})

// ── Handlers ────────────────────────────────────────────────────────────────

function getLeagues(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, { ok: true, leagues: listLeagueRows() })
}

async function postLeague(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, createLeagueSchema)
  if (getLeagueBySlug(body.slug)) return jsonError(res, 409, `league exists: ${body.slug}`)
  const row = createLeagueRow(body)
  sendJson(res, 201, { ok: true, league: row })
}

async function postLeagueJoin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, joinSchema)
  try {
    const player = joinLeagueRow(body.slug, body.handle)
    sendJson(res, 201, { ok: true, player })
  } catch (err) {
    jsonError(res, 400, err instanceof Error ? err.message : 'join failed')
  }
}

async function postLeaguePoints(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, pointsSchema)
  try {
    const player = awardLeaguePoints(body.slug, body.event)
    sendJson(res, 200, { ok: true, awarded: player !== null, player })
  } catch (err) {
    jsonError(res, 404, err instanceof Error ? err.message : 'league not found')
  }
}

async function postLeagueCloseRound(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, slugQuerySchema)
  try {
    const result = closeLeagueRound(body.slug)
    sendJson(res, 200, {
      ok: true,
      round: result.round.round,
      promoted: result.promoted,
      relegated: result.relegated,
    })
  } catch (err) {
    jsonError(res, 404, err instanceof Error ? err.message : 'league not found')
  }
}

function getLeaguePlayers(_req: IncomingMessage, res: ServerResponse, url: URL): void {
  const q = readQuery(url, slugQuerySchema)
  if (!getLeagueBySlug(q.slug)) return jsonError(res, 404, `league not found: ${q.slug}`)
  sendJson(res, 200, { ok: true, players: listLeaguePlayers(q.slug) })
}

function getLeagueStandings(_req: IncomingMessage, res: ServerResponse, url: URL): void {
  const q = readQuery(url, standingsQuerySchema)
  if (!getLeagueBySlug(q.slug)) return jsonError(res, 404, `league not found: ${q.slug}`)
  if (q.tier) {
    return sendJson(res, 200, {
      ok: true,
      tier: q.tier,
      standings: leagueStandings(q.slug, q.tier),
    })
  }
  sendJson(res, 200, {
    ok: true,
    champion: leagueChampion(q.slug),
    divisions: DIVISION_ORDER.map((tier) => ({ tier, standings: leagueStandings(q.slug, tier) })),
  })
}

function getLeagueRounds(_req: IncomingMessage, res: ServerResponse, url: URL): void {
  const q = readQuery(url, slugQuerySchema)
  if (!getLeagueBySlug(q.slug)) return jsonError(res, 404, `league not found: ${q.slug}`)
  sendJson(res, 200, { ok: true, rounds: listLeagueRounds(q.slug) })
}

function getDuels(_req: IncomingMessage, res: ServerResponse, url: URL): void {
  const q = readQuery(url, duelListQuerySchema)
  sendJson(res, 200, { ok: true, duels: listLeagueDuels(q) })
}

async function postDuel(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, duelCreateSchema)
  if (getLeagueDuel(body.slug)) return jsonError(res, 409, `duel exists: ${body.slug}`)
  try {
    const duel = createLeagueDuel(body)
    sendJson(res, 201, { ok: true, duel })
  } catch (err) {
    jsonError(res, 400, err instanceof Error ? err.message : 'duel creation failed')
  }
}

async function postDuelFromDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, duelFromDeckSchema)
  if (getLeagueDuel(body.slug)) return jsonError(res, 409, `duel exists: ${body.slug}`)
  try {
    const duel = createDuelFromDeck(body)
    sendJson(res, 201, { ok: true, duel })
  } catch (err) {
    jsonError(res, 400, err instanceof Error ? err.message : 'duel creation failed')
  }
}

async function postDuelAnswers(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, duelAnswersSchema)
  try {
    const result = submitDuelAnswers(body.slug, body.side, body.answers)
    sendJson(res, 200, {
      ok: true,
      decided: result.decided,
      winner: result.winner,
      duel: result.duel,
    })
  } catch (err) {
    jsonError(res, 400, err instanceof Error ? err.message : 'answer submission failed')
  }
}

function getTournaments(_req: IncomingMessage, res: ServerResponse, url: URL): void {
  const q = readQuery(url, duelListQuerySchema)
  sendJson(res, 200, { ok: true, tournaments: listLeagueTournaments(q) })
}

async function postTournament(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, tournamentCreateSchema)
  if (getLeagueTournament(body.slug)) return jsonError(res, 409, `tournament exists: ${body.slug}`)
  try {
    const tournament = createLeagueTournament(body)
    sendJson(res, 201, { ok: true, tournament })
  } catch (err) {
    jsonError(res, 400, err instanceof Error ? err.message : 'tournament creation failed')
  }
}

function getTournamentOpen(_req: IncomingMessage, res: ServerResponse, url: URL): void {
  const q = readQuery(url, slugQuerySchema)
  if (!getLeagueTournament(q.slug)) return jsonError(res, 404, `tournament not found: ${q.slug}`)
  sendJson(res, 200, { ok: true, matches: openTournamentMatches(q.slug) })
}

async function postTournamentResult(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, tournamentResultSchema)
  try {
    const tournament = recordTournamentMatchResult(
      body.slug,
      body.round,
      body.position,
      body.winner,
      body.duelId,
    )
    sendJson(res, 200, { ok: true, tournament })
  } catch (err) {
    jsonError(res, 400, err instanceof Error ? err.message : 'result rejected')
  }
}

function postLeagueCloseDue(_req: IncomingMessage, res: ServerResponse): void {
  const closed = closeDueRounds()
  sendJson(res, 200, { ok: true, closed })
}

function getLeagueSeasons(_req: IncomingMessage, res: ServerResponse, url: URL): void {
  const q = readQuery(url, slugQuerySchema)
  if (!getLeagueBySlug(q.slug)) return jsonError(res, 404, `league not found: ${q.slug}`)
  sendJson(res, 200, { ok: true, seasons: listLeagueSeasons(q.slug) })
}

// ── Route table ─────────────────────────────────────────────────────────────

export const leaguesRoutes: Route[] = [
  { method: 'GET', path: '/leagues', summary: 'list leagues', handler: getLeagues },
  {
    method: 'POST',
    path: '/leagues',
    summary: 'create a league (engine-validated)',
    handler: postLeague,
  },
  {
    method: 'POST',
    path: '/leagues/join',
    summary: 'join a league (starts in bronze)',
    handler: postLeagueJoin,
  },
  {
    method: 'POST',
    path: '/leagues/points',
    summary: 'award league points for a study event',
    handler: postLeaguePoints,
  },
  {
    method: 'POST',
    path: '/leagues/close-due',
    summary: 'close every due round (one per league per sweep)',
    handler: postLeagueCloseDue,
  },
  {
    method: 'POST',
    path: '/leagues/close-round',
    summary: 'close the round: promote/relegate, record, reset',
    handler: postLeagueCloseRound,
  },
  {
    method: 'GET',
    path: '/leagues/players',
    summary: 'league players by season points (?slug=)',
    handler: getLeaguePlayers,
  },
  {
    method: 'GET',
    path: '/leagues/standings',
    summary: 'division standings or full table + champion (?slug=&tier=)',
    handler: getLeagueStandings,
  },
  {
    method: 'GET',
    path: '/leagues/seasons',
    summary: 'archived seasons, newest first (?slug=)',
    handler: getLeagueSeasons,
  },
  {
    method: 'GET',
    path: '/leagues/rounds',
    summary: 'closed round history (?slug=)',
    handler: getLeagueRounds,
  },
  {
    method: 'GET',
    path: '/leagues/duels',
    summary: 'duels (?leagueSlug=&status=)',
    handler: getDuels,
  },
  { method: 'POST', path: '/leagues/duels', summary: 'create a duel', handler: postDuel },
  {
    method: 'POST',
    path: '/leagues/duels/from-deck',
    summary: 'create a duel from a deck of cards',
    handler: postDuelFromDeck,
  },
  {
    method: 'POST',
    path: '/leagues/duels/answers',
    summary: 'submit one side; decides when both are in',
    handler: postDuelAnswers,
  },
  {
    method: 'GET',
    path: '/leagues/tournaments',
    summary: 'tournaments (?leagueSlug=&status=)',
    handler: getTournaments,
  },
  {
    method: 'POST',
    path: '/leagues/tournaments',
    summary: 'create a seeded bracket',
    handler: postTournament,
  },
  {
    method: 'GET',
    path: '/leagues/tournaments/open',
    summary: 'playable matches right now (?slug=)',
    handler: getTournamentOpen,
  },
  {
    method: 'POST',
    path: '/leagues/tournaments/result',
    summary: 'record a match winner (completes on the final)',
    handler: postTournamentResult,
  },
]
