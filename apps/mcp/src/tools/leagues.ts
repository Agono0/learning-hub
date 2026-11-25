/**
 * Competitive Leagues MCP tools — seasonal leagues, duels and tournaments
 * through the shared leagues repository (packages/db repos/leagues).
 */
import { z } from 'zod'
import {
  awardLeaguePoints,
  syncLeaguePoints,
  closeDueRounds,
  createDuelFromDeck,
  closeLeagueRound,
  createLeagueDuel,
  createLeagueRow,
  createLeagueTournament,
  exportLeague,
  importLeague,
  buildLeagueDigest,
  leagueDuelStats,
  leagueRoundPreview,
  seedLeagueTournamentFromStandings,
  leagueDivisionDetail,
  leagueHeadToHead,
  listLeagueAchievements,
  syncLeagueAchievements,
  syncLeagueAchievementsAll,
  joinLeagueRow,
  leagueChampion,
  leaguePlayerProfile,
  leagueStandings,
  listLeagueDuels,
  redactLeagueDuelRow,
  listLeaguePlayers,
  listLeagueRounds,
  listLeagueRows,
  listLeagueSeasons,
  listLeagueTournaments,
  openTournamentMatches,
  recordTournamentMatchResult,
  rematchLeagueDuel,
  submitDuelAnswers,
  getRemoteLink,
  listRemoteLinks,
  loadLeagueQueue,
} from '@learning-hub/db'
import { DIVISION_ORDER, summarizeQueue } from '@learning-hub/core'
import { json, tool, type RegisteredTool } from '../tool-kit'

const tierEnum = z.enum(['bronze', 'silver', 'gold', 'platinum', 'diamond'])

const promptSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  answers: z.array(z.string().min(1)).min(1).describe('Accepted answers, case-insensitive'),
})

const answerSchema = z.object({
  promptId: z.string().min(1),
  answer: z.string(),
  elapsedMs: z.number().nonnegative().describe('Ms from prompt reveal to answer'),
})

export const leagueTools: RegisteredTool[] = [
  tool(
    'league_create',
    'Create a competitive study league season (five divisions, weekly rounds).',
    {
      slug: z.string().min(1).max(60),
      title: z.string().min(1).max(200),
      seasonStart: z.string().optional().describe('ISO date of round 1; defaults to today'),
      roundLengthDays: z.number().int().min(1).max(28).optional(),
      seasonLengthRounds: z.number().int().min(2).max(52).optional(),
      promotionSlots: z.number().int().min(1).max(10).optional(),
      relegationSlots: z.number().int().min(0).max(10).optional(),
    },
    ({
      slug,
      title,
      seasonStart,
      roundLengthDays,
      seasonLengthRounds,
      promotionSlots,
      relegationSlots,
    }) =>
      json({
        ok: true,
        league: createLeagueRow({
          slug,
          title,
          seasonStart,
          roundLengthDays,
          seasonLengthRounds,
          promotionSlots,
          relegationSlots,
        }),
      }),
  ),
  tool('league_list', 'List leagues, newest first.', {}, () =>
    json({ ok: true, leagues: listLeagueRows() }),
  ),
  tool(
    'league_join',
    'Join a league; every player starts in bronze.',
    { slug: z.string().min(1), handle: z.string().min(1).max(50) },
    ({ slug, handle }) => json({ ok: true, player: joinLeagueRow(slug, handle) }),
  ),
  tool(
    'duel_rematch',
    'Rematch a completed duel: a new open duel between the same players with the same prompts and swapped seating.',
    { duelSlug: z.string().min(1), newSlug: z.string().min(1).max(60) },
    ({ duelSlug, newSlug }) => json({ ok: true, duel: rematchLeagueDuel(duelSlug, newSlug) }),
  ),
  tool(
    'league_division',
    'Focused view of one division: standings with Elo, round-win history, promotion/relegation movement, and duels between current members.',
    { slug: z.string().min(1), tier: tierEnum },
    ({ slug, tier }) => {
      const division = leagueDivisionDetail(slug, tier)
      if (!division) throw new Error(`league not found: ${slug}`)
      return json({ ok: true, division })
    },
  ),
  tool(
    'tournament_seed',
    'Auto-seed a tournament bracket from league standings: strongest players first (highest division, then season points), best-vs-worst pairing. Size caps the field.',
    {
      slug: z.string().min(1).max(60),
      leagueSlug: z.string().min(1),
      title: z.string().min(1).max(200),
      size: z.number().int().min(2).max(64).optional(),
    },
    ({ slug, leagueSlug, title, size }) =>
      json({
        ok: true,
        tournament: seedLeagueTournamentFromStandings({ slug, leagueSlug, title, size }),
      }),
  ),
  tool(
    'league_duel_stats',
    'Per-player duel performance in a league: record (W-L-D), win rate, mean accuracy, mean time per correct answer, and win streaks. Accuracy and speed use the same scoring that decides duels, so they double as a study-strength signal and matchmaking input.',
    { slug: z.string().min(1) },
    ({ slug }) => {
      const stats = leagueDuelStats(slug)
      if (stats === null) throw new Error(`league not found: ${slug}`)
      return json({ ok: true, stats })
    },
  ),
  tool(
    'league_schedule',
    "A league's round calendar: when the current round starts and ends, whether it is due to close, rounds remaining, season end, and a preview of the next rounds.",
    { slug: z.string().min(1), upcoming: z.number().int().min(0).max(10).optional() },
    ({ slug, upcoming }) => {
      const schedule = leagueRoundPreview(slug, { upcoming })
      if (!schedule) throw new Error(`league not found: ${slug}`)
      return json({ ok: true, schedule })
    },
  ),
  tool(
    'league_digest',
    'Weekly league recap: division standings, the last closed round (winners, promotions, relegations), duel activity, 7-day Elo movers and newly earned badges.',
    { slug: z.string().min(1) },
    ({ slug }) => {
      const digest = buildLeagueDigest(slug)
      if (!digest) throw new Error(`league not found: ${slug}`)
      return json({ ok: true, digest })
    },
  ),
  tool(
    'league_achievements',
    "List a player's earned league achievement badges (oldest first).",
    { slug: z.string().min(1), handle: z.string().min(1) },
    ({ slug, handle }) => json({ ok: true, achievements: listLeagueAchievements(slug, handle) }),
  ),
  tool(
    'league_achievements_sync',
    'Re-evaluate achievements: for one player (handle) or the whole league (omit handle). Banks and returns only newly earned badges.',
    { slug: z.string().min(1), handle: z.string().min(1).optional() },
    ({ slug, handle }) =>
      handle
        ? json({ ok: true, earned: syncLeagueAchievements(slug, handle) })
        : json({ ok: true, unlocked: syncLeagueAchievementsAll(slug) }),
  ),
  tool(
    'league_head_to_head',
    'Full head-to-head record between two league players: wins/draws, accuracy, speed, streaks, Elo gap and recent duels.',
    { slug: z.string().min(1), a: z.string().min(1), b: z.string().min(1) },
    ({ slug, a, b }) => {
      const headToHead = leagueHeadToHead(slug, a, b)
      if (!headToHead) throw new Error('league or player not found')
      return json({ ok: true, headToHead })
    },
  ),
  tool(
    'league_export',
    'Export a league as a portable, checksummed transfer envelope (players, rounds, completed duels, tournaments, seasons). Open duels never travel: their prompts carry correct answers and in-flight submissions.',
    { slug: z.string().min(1) },
    ({ slug }) => {
      const transfer = exportLeague(slug)
      if (!transfer) throw new Error(`league not found: ${slug}`)
      return json({ ok: true, transfer })
    },
  ),
  tool(
    'league_import',
    'Import a league transfer envelope as a NEW league (its slug and duel/tournament slugs must be free).',
    { transfer: z.unknown() },
    ({ transfer }) => json({ ok: true, slug: importLeague(transfer).slug }),
  ),
  tool(
    'league_seasons',
    'Archived seasons for a league (champion + final table), newest first.',
    { slug: z.string().min(1) },
    ({ slug }) => json({ ok: true, seasons: listLeagueSeasons(slug) }),
  ),
  tool(
    'league_player_profile',
    "One player's competitive profile: division rank, duel record, recent duels and Elo trajectory.",
    {
      slug: z.string().min(1),
      handle: z.string().min(1),
    },
    ({ slug, handle }) => {
      const profile = leaguePlayerProfile(slug, handle)
      if (!profile) throw new Error(`player not found: ${handle}`)
      return json({ ok: true, profile })
    },
  ),
  tool(
    'league_standings',
    'Standings for one division, or the full table with the current champion.',
    { slug: z.string().min(1), tier: tierEnum.optional() },
    ({ slug, tier }) =>
      tier
        ? json({ ok: true, tier, standings: leagueStandings(slug, tier) })
        : json({
            ok: true,
            champion: leagueChampion(slug),
            divisions: DIVISION_ORDER.map((t) => ({
              tier: t,
              standings: leagueStandings(slug, t),
            })),
          }),
  ),
  tool(
    'league_players',
    'League players ordered by season points.',
    { slug: z.string().min(1) },
    ({ slug }) => json({ ok: true, players: listLeaguePlayers(slug) }),
  ),
  tool(
    'league_sync_points',
    'Local activity scoring: credit NEW review/focus activity on this device to a league player (forward-only cursor, idempotent, never retroactive). Not per-person verified — on a shared device the cursor cannot identify who studied.',
    { slug: z.string().min(1), handle: z.string().min(1) },
    ({ slug, handle }) => json({ ok: true, ...syncLeaguePoints(slug, handle) }),
  ),
  tool(
    'league_award_points',
    'FRIENDLY/SELF-REPORTED: award league points for a claimed study event (reviews, focus minutes, duel result). Not verified — prefer league_sync_points for activity-derived scoring.',
    {
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
    },
    ({ slug, event }) => json({ ok: true, player: awardLeaguePoints(slug, event) }),
  ),
  tool(
    'league_close_due',
    'Scheduling sweep: close every league round whose end instant has passed (empty catch-up rounds are recorded silently).',
    {},
    () => json({ ok: true, closed: closeDueRounds() }),
  ),
  tool(
    'league_close_round',
    'Close the current round: promote top scorers (must have scored), relegate the bottom, record the round, reset round points.',
    { slug: z.string().min(1) },
    ({ slug }) => {
      const r = closeLeagueRound(slug)
      return json({ ok: true, round: r.round.round, promoted: r.promoted, relegated: r.relegated })
    },
  ),
  tool(
    'league_rounds',
    'Closed round history for a league.',
    { slug: z.string().min(1) },
    ({ slug }) => json({ ok: true, rounds: listLeagueRounds(slug) }),
  ),
  tool(
    'duel_create',
    'Create a head-to-head duel from recall prompts (optionally inside a league).',
    {
      slug: z.string().min(1).max(60),
      leagueSlug: z.string().min(1).optional(),
      playerA: z.string().min(1).max(50),
      playerB: z.string().min(1).max(50),
      prompts: z.array(promptSchema).min(1).max(50),
    },
    (args) => json({ ok: true, duel: createLeagueDuel(args) }),
  ),
  tool(
    'duel_create_from_deck',
    "Create a duel from a deck's answerable cards (basic/typein/mcq). Same seed + same deck = same duel on every device.",
    {
      slug: z.string().min(1).max(60),
      deckId: z.number().int().positive(),
      leagueSlug: z.string().min(1).optional(),
      playerA: z.string().min(1).max(50),
      playerB: z.string().min(1).max(50),
      limit: z.number().int().min(1).max(50).optional(),
      seed: z.number().int().optional(),
    },
    (args) => json({ ok: true, duel: createDuelFromDeck(args) }),
  ),
  tool(
    'duel_answer',
    'Submit one side of a duel. When both sides are in, the duel is decided: accuracy first, then speed on correct answers. Practice leagues are local & friendly: duel points are awarded, Elo stays frozen (no ranked effects).',
    { slug: z.string().min(1), side: z.enum(['A', 'B']), answers: z.array(answerSchema) },
    ({ slug, side, answers }) => {
      const r = submitDuelAnswers(slug, side, answers)
      return json({ ok: true, decided: r.decided, winner: r.winner, duel: r.duel })
    },
  ),
  tool(
    'duel_list',
    'List duels, optionally filtered by league and status.',
    {
      leagueSlug: z.string().min(1).optional(),
      status: z.enum(['open', 'complete']).optional(),
    },
    (opts) => json({ ok: true, duels: listLeagueDuels(opts).map(redactLeagueDuelRow) }),
  ),
  tool(
    'tournament_create',
    'Create a seeded single-elimination tournament (byes auto-advance).',
    {
      slug: z.string().min(1).max(60),
      leagueSlug: z.string().min(1).optional(),
      title: z.string().min(1).max(200),
      seeds: z.array(z.string().min(1)).min(2).max(64),
    },
    (args) => json({ ok: true, tournament: createLeagueTournament(args) }),
  ),
  tool(
    'tournament_open_matches',
    'Matches playable right now in a tournament.',
    { slug: z.string().min(1) },
    ({ slug }) => json({ ok: true, matches: openTournamentMatches(slug) }),
  ),
  tool(
    'tournament_record_result',
    'Record a match winner (optionally linked to a duel); a final crowns the champion.',
    {
      slug: z.string().min(1),
      round: z.number().int().positive(),
      position: z.number().int().nonnegative(),
      winner: z.string().min(1),
      duelId: z.string().min(1).optional(),
    },
    ({ slug, round, position, winner, duelId }) =>
      json({
        ok: true,
        tournament: recordTournamentMatchResult(slug, round, position, winner, duelId),
      }),
  ),
  tool(
    'tournament_list',
    'List tournaments, optionally filtered by league and status.',
    {
      leagueSlug: z.string().min(1).optional(),
      status: z.enum(['open', 'complete']).optional(),
    },
    (opts) => json({ ok: true, tournaments: listLeagueTournaments(opts) }),
  ),
  tool(
    'remote_league_links',
    'List linked remote leagues (optional local/friendly practice groundwork). Read-only: shows link status and queue counts, never scores or ranks, and never signing keys.',
    {},
    () =>
      json({
        ok: true,
        links: listRemoteLinks().map((l) => ({
          remoteLeagueId: l.remoteLeagueId,
          serverUrl: l.serverUrl,
          nextSeq: l.nextSeq,
          lastStatus: l.lastStatus ?? null,
          queue: summarizeQueue(loadLeagueQueue(l.id).queue),
        })),
      }),
  ),
  tool(
    'remote_league_queue',
    'Inspect the offline mutation queue for one linked remote league. Read-only; payloads are not echoed.',
    {
      serverUrl: z.string().min(1),
      remoteLeagueId: z.string().min(1),
    },
    ({ serverUrl, remoteLeagueId }) => {
      let link
      try {
        link = getRemoteLink(serverUrl, remoteLeagueId)
      } catch (err) {
        return json({ ok: false, error: err instanceof Error ? err.message : 'invalid server url' })
      }
      if (!link) return json({ ok: false, error: 'no such link' })
      const { queue, recovered } = loadLeagueQueue(link.id)
      return json({
        ok: true,
        recovered,
        summary: summarizeQueue(queue),
        items: queue.items.length,
      })
    },
  ),
]
