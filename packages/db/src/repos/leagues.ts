/**
 * @fileoverview Repositories for Competitive Study Leagues (lh-leagues/v1):
 * seasonal leagues with divisions, promotion/relegation rounds, head-to-head
 * duels with Elo exchange, and seeded single-elimination tournaments.
 *
 * The pure rules live in @learning-hub/core/leagues; this module persists and
 * reconstructs that state. Every function takes an optional trailing database
 * handle so tests and transactions can share a connection.
 */
import { and, desc, eq, or } from 'drizzle-orm'
import {
  LEAGUES_SCHEMA,
  awardPoints,
  closeRound,
  createLeague,
  createTournament,
  decideDuel,
  divisionStandings,
  duelEloUpdate,
  isDuelComplete,
  joinLeague,
  leagueLeader,
  openMatches,
  recordMatchResult,
  buildDuelPromptsFromCards,
  type DivisionTier,
  type Duel,
  type League,
  type LeagueEvent,
  type Tournament,
  isRoundDue,
  isSeasonComplete,
  closeSeason,
  createLeagueTransfer,
  parseLeagueTransfer,
  type LeagueTransfer,
  type LeagueTransferPayload,
} from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import type { Transaction } from '../transaction'
import {
  cards as cardsTable,
  leagueDuels,
  leagueEloEvents,
  leaguePlayers,
  leagueRounds,
  leagueSeasons,
  leagues,
  leagueTournaments,
} from '../schema'
import { withTransaction } from '../transaction'
import { getNotificationPrefs, logNotification } from './notification-center'
import { awardXp } from './xp'

export type LeagueRow = typeof leagues.$inferSelect
export type LeaguePlayerRow = typeof leaguePlayers.$inferSelect
export type LeagueRoundRow = typeof leagueRounds.$inferSelect
export type LeagueDuelRow = typeof leagueDuels.$inferSelect
export type LeagueTournamentRow = typeof leagueTournaments.$inferSelect
export type LeagueEloEventRow = typeof leagueEloEvents.$inferSelect
export type LeagueSeasonRow = typeof leagueSeasons.$inferSelect

// ─── Row <-> core type mapping ─────────────────────────────────────────────

function rowsToLeague(league: LeagueRow, players: LeaguePlayerRow[]): League {
  return {
    schema: LEAGUES_SCHEMA,
    id: league.slug,
    title: league.title,
    seasonStart: league.seasonStart,
    roundLengthDays: league.roundLengthDays,
    currentRound: league.currentRound,
    season: league.season,
    seasonLengthRounds: league.seasonLengthRounds,
    promotionSlots: league.promotionSlots,
    relegationSlots: league.relegationSlots,
    scoring: league.scoringJson,
    players: players.map((p) => ({
      handle: p.handle,
      tier: p.tier as DivisionTier,
      points: p.points,
      seasonPoints: p.seasonPoints,
      roundsWon: p.roundsWon,
      duelsWon: p.duelsWon,
      duelsLost: p.duelsLost,
    })),
  }
}

function rowToDuel(row: LeagueDuelRow): Duel {
  return {
    id: row.slug,
    playerA: row.playerA,
    playerB: row.playerB,
    prompts: row.promptsJson,
    answersA: row.answersAJson,
    answersB: row.answersBJson,
    createdAt: row.createdAt,
  }
}

function rowToTournament(row: LeagueTournamentRow): Tournament {
  return {
    id: row.slug,
    title: row.title,
    seeds: row.seedsJson,
    matches: row.matchesJson,
    champion: row.champion ?? undefined,
    createdAt: row.createdAt,
  }
}

// ─── Leagues ───────────────────────────────────────────────────────────────

export function createLeagueRow(
  data: {
    slug: string
    title: string
    seasonStart?: string
    roundLengthDays?: number
    seasonLengthRounds?: number
    promotionSlots?: number
    relegationSlots?: number
  },
  database?: LearningHubDB,
): LeagueRow {
  const conn = database ?? getDb()
  // Validate through the core engine so bad configs never reach the schema.
  const core = createLeague({
    id: data.slug,
    title: data.title,
    seasonStart: data.seasonStart ?? new Date().toISOString().slice(0, 10),
    roundLengthDays: data.roundLengthDays,
    seasonLengthRounds: data.seasonLengthRounds,
    promotionSlots: data.promotionSlots,
    relegationSlots: data.relegationSlots,
  })
  const [row] = conn
    .insert(leagues)
    .values({
      slug: core.id,
      title: core.title,
      seasonStart: core.seasonStart,
      roundLengthDays: core.roundLengthDays,
      seasonLengthRounds: core.seasonLengthRounds,
      promotionSlots: core.promotionSlots,
      relegationSlots: core.relegationSlots,
      scoringJson: core.scoring,
    })
    .returning()
    .all()
  return row!
}

export function getLeagueBySlug(
  slug: string,
  database?: LearningHubDB | Transaction,
): LeagueRow | null {
  const conn = database ?? getDb()
  return conn.select().from(leagues).where(eq(leagues.slug, slug)).get() ?? null
}

export function listLeagueRows(database?: LearningHubDB): LeagueRow[] {
  const conn = database ?? getDb()
  return conn.select().from(leagues).orderBy(desc(leagues.createdAt)).all()
}

export function listLeaguePlayers(slug: string, database?: LearningHubDB): LeaguePlayerRow[] {
  const conn = database ?? getDb()
  const league = getLeagueBySlug(slug, conn)
  if (!league) return []
  return conn
    .select()
    .from(leaguePlayers)
    .where(eq(leaguePlayers.leagueId, league.id))
    .orderBy(desc(leaguePlayers.seasonPoints), desc(leaguePlayers.points))
    .all()
}

export function joinLeagueRow(
  slug: string,
  handle: string,
  database?: LearningHubDB,
): LeaguePlayerRow {
  const conn = database ?? getDb()
  return withTransaction((tx) => {
    const league = getLeagueBySlug(slug, tx)
    if (!league) throw new Error(`league not found: ${slug}`)
    const players = tx
      .select()
      .from(leaguePlayers)
      .where(eq(leaguePlayers.leagueId, league.id))
      .all()
    const core = rowsToLeague(league, players)
    joinLeague(core, handle) // throws on duplicate or invalid handle
    const [row] = tx
      .insert(leaguePlayers)
      .values({ leagueId: league.id, handle, tier: 'bronze' })
      .returning()
      .all()
    return row!
  }, conn)
}

/** Load the full core League for a slug (league + players). */
export function loadLeague(slug: string, database?: LearningHubDB): League | null {
  const conn = database ?? getDb()
  const league = getLeagueBySlug(slug, conn)
  if (!league) return null
  const players = conn
    .select()
    .from(leaguePlayers)
    .where(eq(leaguePlayers.leagueId, league.id))
    .all()
  return rowsToLeague(league, players)
}

export function leagueStandings(
  slug: string,
  tier: DivisionTier,
  database?: LearningHubDB,
): { handle: string; points: number; seasonPoints: number }[] {
  const core = loadLeague(slug, database)
  if (!core) return []
  return divisionStandings(core, tier).map((p) => ({
    handle: p.handle,
    points: p.points,
    seasonPoints: p.seasonPoints,
  }))
}

export function leagueChampion(slug: string, database?: LearningHubDB): string | null {
  const core = loadLeague(slug, database)
  if (!core) return null
  return leagueLeader(core)?.handle ?? null
}

/** Award league points for a study event; persists the player's new totals. */
export function awardLeaguePoints(
  slug: string,
  event: LeagueEvent,
  database?: LearningHubDB,
): LeaguePlayerRow | null {
  const conn = database ?? getDb()
  return withTransaction((tx) => {
    const league = getLeagueBySlug(slug, tx)
    if (!league) throw new Error(`league not found: ${slug}`)
    const players = tx
      .select()
      .from(leaguePlayers)
      .where(eq(leaguePlayers.leagueId, league.id))
      .all()
    const before = rowsToLeague(league, players)
    const after = awardPoints(before, event)
    const handles = event.kind === 'duel' ? [event.winner, event.loser] : [event.handle]
    let first: LeaguePlayerRow | null = null
    for (const handle of handles) {
      const updated = after.players.find((p) => p.handle === handle)
      if (!updated) continue
      const [row] = tx
        .update(leaguePlayers)
        .set({
          points: updated.points,
          seasonPoints: updated.seasonPoints,
          duelsWon: updated.duelsWon,
          duelsLost: updated.duelsLost,
        })
        .where(and(eq(leaguePlayers.leagueId, league.id), eq(leaguePlayers.handle, handle)))
        .returning()
        .all()
      first = first ?? row ?? null
    }
    return first
  }, conn)
}

/**
 * Close the current round: promotes/relegates per the core rules, records the
 * round, and resets round points into season totals.
 */
export function closeLeagueRound(
  slug: string,
  database?: LearningHubDB,
): {
  round: LeagueRoundRow
  promoted: LeagueRoundRow['promotionsJson']
  relegated: LeagueRoundRow['relegationsJson']
  seasonClosed: { season: number; champion: string | null } | null
} {
  const conn = database ?? getDb()
  // captured for the post-commit notification pass (the notification ledger
  // repos take a LearningHubDB, not a transaction handle)
  let leagueTitle = ''
  let closedRound = 0
  let scoringWinnerHandles: string[] = []
  const outcome = withTransaction((tx) => {
    const league = getLeagueBySlug(slug, tx)
    if (!league) throw new Error(`league not found: ${slug}`)
    const players = tx
      .select()
      .from(leaguePlayers)
      .where(eq(leaguePlayers.leagueId, league.id))
      .all()
    const result = closeRound(rowsToLeague(league, players))
    leagueTitle = league.title
    closedRound = league.currentRound
    scoringWinnerHandles = result.roundWinners
      .filter((w) => {
        const row = players.find((p) => p.handle === w.handle && p.tier === w.tier)
        return row !== undefined && row.points > 0
      })
      .map((w) => w.handle)

    for (const p of result.league.players) {
      tx.update(leaguePlayers)
        .set({
          tier: p.tier,
          points: p.points,
          seasonPoints: p.seasonPoints,
          roundsWon: p.roundsWon,
        })
        .where(and(eq(leaguePlayers.leagueId, league.id), eq(leaguePlayers.handle, p.handle)))
        .run()
    }
    tx.update(leagues)
      .set({ currentRound: result.league.currentRound, updatedAt: new Date().toISOString() })
      .where(eq(leagues.id, league.id))
      .run()
    // canonical XP for every division winner who actually scored this round
    // (one XP path; no reward for an uncontested zero-point top)
    for (const w of result.roundWinners) {
      if (!scoringWinnerHandles.includes(w.handle)) continue
      awardXp(tx, {
        source: 'league',
        meta: { leagueSlug: slug, round: league.currentRound, tier: w.tier, handle: w.handle },
      })
    }
    const [round] = tx
      .insert(leagueRounds)
      .values({
        leagueId: league.id,
        round: league.currentRound,
        promotionsJson: result.promoted,
        relegationsJson: result.relegated,
        winnersJson: result.roundWinners,
      })
      .returning()
      .all()
    // season close: the last round of the season crowns a champion, archives
    // the final table and resets everyone to bronze for the next season
    let seasonRow: LeagueSeasonRow | null = null
    let seasonChampion: string | null = null
    let seasonNumber = 0
    if (isSeasonComplete(result.league)) {
      const today = new Date().toISOString().slice(0, 10)
      const seasonResult = closeSeason(result.league, today)
      seasonChampion = seasonResult.champion
      seasonNumber = seasonResult.season
      for (const p of seasonResult.league.players) {
        tx.update(leaguePlayers)
          .set({ tier: p.tier, points: p.points, seasonPoints: p.seasonPoints })
          .where(and(eq(leaguePlayers.leagueId, league.id), eq(leaguePlayers.handle, p.handle)))
          .run()
      }
      tx.update(leagues)
        .set({
          season: seasonResult.league.season,
          seasonStart: seasonResult.league.seasonStart,
          currentRound: 0,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(leagues.id, league.id))
        .run()
      const [archived] = tx
        .insert(leagueSeasons)
        .values({
          leagueId: league.id,
          season: seasonResult.season,
          champion: seasonResult.champion,
          finalStandingsJson: seasonResult.finalStandings.map((p) => ({
            handle: p.handle,
            tier: p.tier,
            seasonPoints: p.seasonPoints,
            roundsWon: p.roundsWon,
            // Elo is a db-side career stat, not part of the core player schema
            elo: players.find((row) => row.handle === p.handle)?.elo ?? 1000,
          })),
        })
        .returning()
        .all()
      seasonRow = archived!
    }
    return {
      round: round!,
      promoted: result.promoted,
      relegated: result.relegated,
      result,
      seasonRow,
      seasonChampion,
      seasonNumber,
    }
  }, conn)

  // league-round notifications on the 'league' channel, honoring prefs
  // (master switch / per-channel toggle) via the delivery decision
  const prefs = getNotificationPrefs(conn)
  const leaguePref = prefs.channels['league']
  const decision = !prefs.masterEnabled
    ? ('suppress_master' as const)
    : leaguePref && !leaguePref.enabled
      ? ('suppress_channel' as const)
      : ('deliver' as const)
  const now = new Date().toISOString()
  const promotedHandles = new Set(outcome.promoted.map((p) => p.handle))
  for (const p of outcome.promoted) {
    const alsoWon = scoringWinnerHandles.includes(p.handle)
    logNotification(
      {
        channel: 'league',
        title: alsoWon
          ? `Won ${p.from} and promoted to ${p.to} in ${leagueTitle}`
          : `Promoted to ${p.to} in ${leagueTitle}`,
        body: `Round ${closedRound} is closed.${alsoWon ? ' Top of the division.' : ''} Round points are reset — the climb restarts.`,
        actionUrl: '/leagues',
        decision,
        createdAt: now,
      },
      conn,
    )
  }
  for (const r of outcome.relegated) {
    logNotification(
      {
        channel: 'league',
        title: `Relegated to ${r.to} in ${leagueTitle}`,
        body: `Round ${closedRound}: bottom of ${r.from}. Log reviews or win a duel to climb back.`,
        actionUrl: '/leagues',
        decision,
        createdAt: now,
      },
      conn,
    )
  }
  if (outcome.seasonRow) {
    logNotification(
      {
        channel: 'league',
        title: `Season ${outcome.seasonNumber} of ${leagueTitle} is over${
          outcome.seasonChampion ? ` — champion: ${outcome.seasonChampion}` : ''
        }`,
        body: 'The final table is archived. Everyone restarts in bronze — Elo and career stats carry over.',
        actionUrl: '/leagues',
        decision,
        createdAt: now,
      },
      conn,
    )
  }
  for (const w of outcome.result.roundWinners) {
    if (!scoringWinnerHandles.includes(w.handle) || promotedHandles.has(w.handle)) continue
    logNotification(
      {
        channel: 'league',
        title: `Won ${w.tier} in round ${closedRound} of ${leagueTitle}`,
        body: 'Division winners earn leagueRoundWin XP. Diamond has no promotion — defend the crown.',
        actionUrl: '/leagues',
        decision,
        createdAt: now,
      },
      conn,
    )
  }
  return {
    round: outcome.round,
    promoted: outcome.promoted,
    relegated: outcome.relegated,
    seasonClosed: outcome.seasonRow
      ? { season: outcome.seasonNumber, champion: outcome.seasonChampion }
      : null,
  }
}

/** Archived seasons for a league, newest first. */
export function listLeagueSeasons(slug: string, database?: LearningHubDB): LeagueSeasonRow[] {
  const conn = database ?? getDb()
  const league = getLeagueBySlug(slug, conn)
  if (!league) return []
  return conn
    .select()
    .from(leagueSeasons)
    .where(eq(leagueSeasons.leagueId, league.id))
    .orderBy(desc(leagueSeasons.season))
    .all()
}

export function listLeagueRounds(slug: string, database?: LearningHubDB): LeagueRoundRow[] {
  const conn = database ?? getDb()
  const league = getLeagueBySlug(slug, conn)
  if (!league) return []
  return conn
    .select()
    .from(leagueRounds)
    .where(eq(leagueRounds.leagueId, league.id))
    .orderBy(desc(leagueRounds.round))
    .all()
}

// ─── Duels ─────────────────────────────────────────────────────────────────

export function createLeagueDuel(
  data: {
    slug: string
    leagueSlug?: string
    playerA: string
    playerB: string
    prompts: { id: string; question: string; answers: string[] }[]
  },
  database?: LearningHubDB,
): LeagueDuelRow {
  const conn = database ?? getDb()
  if (data.playerA === data.playerB) throw new Error('a duel needs two different players')
  if (data.prompts.length === 0) throw new Error('a duel needs at least one prompt')
  const leagueId = data.leagueSlug ? (getLeagueBySlug(data.leagueSlug, conn)?.id ?? null) : null
  if (data.leagueSlug && leagueId === null) throw new Error(`league not found: ${data.leagueSlug}`)
  const [row] = conn
    .insert(leagueDuels)
    .values({
      slug: data.slug,
      leagueId,
      playerA: data.playerA,
      playerB: data.playerB,
      promptsJson: data.prompts,
    })
    .returning()
    .all()
  return row!
}

export function getLeagueDuel(
  slug: string,
  database?: LearningHubDB | Transaction,
): LeagueDuelRow | null {
  const conn = database ?? getDb()
  return conn.select().from(leagueDuels).where(eq(leagueDuels.slug, slug)).get() ?? null
}

export function listLeagueDuels(
  opts: { leagueSlug?: string; status?: 'open' | 'complete' } = {},
  database?: LearningHubDB,
): LeagueDuelRow[] {
  const conn = database ?? getDb()
  let leagueId: number | undefined
  if (opts.leagueSlug) {
    leagueId = getLeagueBySlug(opts.leagueSlug, conn)?.id
    if (leagueId === undefined) return []
  }
  const rows = conn.select().from(leagueDuels).orderBy(desc(leagueDuels.createdAt)).all()
  return rows.filter(
    (r) =>
      (leagueId === undefined || r.leagueId === leagueId) &&
      (!opts.status || r.status === opts.status),
  )
}

/**
 * Submit one side's answers. When both sides are in, the duel is decided:
 * winner recorded, Elo exchanged (for league duels), and duel league points
 * awarded to both players.
 */
export function submitDuelAnswers(
  slug: string,
  side: 'A' | 'B',
  answers: { promptId: string; answer: string; elapsedMs: number }[],
  database?: LearningHubDB,
): { duel: LeagueDuelRow; decided: boolean; winner: string | null } {
  const conn = database ?? getDb()
  return withTransaction((tx) => {
    const row = getLeagueDuel(slug, tx)
    if (!row) throw new Error(`duel not found: ${slug}`)
    if (row.status === 'complete') throw new Error('duel already complete')
    const duel = rowToDuel(row)
    const known = new Set(duel.prompts.map((p) => p.id))
    for (const a of answers) {
      if (!known.has(a.promptId)) throw new Error(`unknown prompt: ${a.promptId}`)
    }
    if (side === 'A') duel.answersA = answers
    else duel.answersB = answers

    if (!isDuelComplete(duel)) {
      const [updated] = tx
        .update(leagueDuels)
        .set(side === 'A' ? { answersAJson: answers } : { answersBJson: answers })
        .where(eq(leagueDuels.id, row.id))
        .returning()
        .all()
      return { duel: updated!, decided: false, winner: null }
    }

    const result = decideDuel(duel)
    const completedAt = new Date().toISOString()
    const [updated] = tx
      .update(leagueDuels)
      .set({
        answersAJson: duel.answersA,
        answersBJson: duel.answersB,
        status: 'complete',
        winner: result.winner,
        completedAt,
      })
      .where(eq(leagueDuels.id, row.id))
      .returning()
      .all()

    // League effects: Elo exchange + duel points, only for league duels whose
    // players are both league members.
    if (row.leagueId !== null) {
      const league = tx.select().from(leagues).where(eq(leagues.id, row.leagueId)).get()
      if (league) {
        const pa = tx
          .select()
          .from(leaguePlayers)
          .where(and(eq(leaguePlayers.leagueId, league.id), eq(leaguePlayers.handle, row.playerA)))
          .get()
        const pb = tx
          .select()
          .from(leaguePlayers)
          .where(and(eq(leaguePlayers.leagueId, league.id), eq(leaguePlayers.handle, row.playerB)))
          .get()
        if (pa && pb) {
          const winnerRow =
            result.winner === row.playerA ? pa : result.winner === row.playerB ? pb : null
          const loserRow =
            result.loser === row.playerA ? pa : result.loser === row.playerB ? pb : null
          if (winnerRow && loserRow) {
            const elo = duelEloUpdate(winnerRow.elo, loserRow.elo, result.draw)
            tx.update(leaguePlayers)
              .set({
                elo: elo.winnerAfter,
                duelsWon: winnerRow.duelsWon + 1,
                points: winnerRow.points + league.scoringJson.duelWin,
              })
              .where(eq(leaguePlayers.id, winnerRow.id))
              .run()
            tx.update(leaguePlayers)
              .set({ elo: elo.loserAfter, duelsLost: loserRow.duelsLost + 1 })
              .where(eq(leaguePlayers.id, loserRow.id))
              .run()
            tx.insert(leagueEloEvents)
              .values([
                {
                  leagueId: league.id,
                  duelId: row.id,
                  handle: winnerRow.handle,
                  opponent: loserRow.handle,
                  result: 'win' as const,
                  eloBefore: winnerRow.elo,
                  eloAfter: elo.winnerAfter,
                },
                {
                  leagueId: league.id,
                  duelId: row.id,
                  handle: loserRow.handle,
                  opponent: winnerRow.handle,
                  result: 'loss' as const,
                  eloBefore: loserRow.elo,
                  eloAfter: elo.loserAfter,
                },
              ])
              .run()
          } else if (result.draw) {
            const elo = duelEloUpdate(pa.elo, pb.elo, true)
            tx.update(leaguePlayers)
              .set({ elo: elo.winnerAfter, points: pa.points + league.scoringJson.duelDraw })
              .where(eq(leaguePlayers.id, pa.id))
              .run()
            tx.update(leaguePlayers)
              .set({ elo: elo.loserAfter, points: pb.points + league.scoringJson.duelDraw })
              .where(eq(leaguePlayers.id, pb.id))
              .run()
            tx.insert(leagueEloEvents)
              .values([
                {
                  leagueId: league.id,
                  duelId: row.id,
                  handle: pa.handle,
                  opponent: pb.handle,
                  result: 'draw' as const,
                  eloBefore: pa.elo,
                  eloAfter: elo.winnerAfter,
                },
                {
                  leagueId: league.id,
                  duelId: row.id,
                  handle: pb.handle,
                  opponent: pa.handle,
                  result: 'draw' as const,
                  eloBefore: pb.elo,
                  eloAfter: elo.loserAfter,
                },
              ])
              .run()
          }
        }
      }
    }
    return { duel: updated!, decided: true, winner: result.winner }
  }, conn)
}

// ─── Tournaments ───────────────────────────────────────────────────────────

export function createLeagueTournament(
  data: { slug: string; leagueSlug?: string; title: string; seeds: string[] },
  database?: LearningHubDB,
): LeagueTournamentRow {
  const conn = database ?? getDb()
  const leagueId = data.leagueSlug ? (getLeagueBySlug(data.leagueSlug, conn)?.id ?? null) : null
  if (data.leagueSlug && leagueId === null) throw new Error(`league not found: ${data.leagueSlug}`)
  const core = createTournament(data.slug, data.title, data.seeds)
  const [row] = conn
    .insert(leagueTournaments)
    .values({
      slug: core.id,
      leagueId,
      title: core.title,
      seedsJson: core.seeds,
      matchesJson: core.matches,
    })
    .returning()
    .all()
  return row!
}

export function getLeagueTournament(
  slug: string,
  database?: LearningHubDB | Transaction,
): LeagueTournamentRow | null {
  const conn = database ?? getDb()
  return conn.select().from(leagueTournaments).where(eq(leagueTournaments.slug, slug)).get() ?? null
}

export function listLeagueTournaments(
  opts: { leagueSlug?: string; status?: 'open' | 'complete' } = {},
  database?: LearningHubDB,
): LeagueTournamentRow[] {
  const conn = database ?? getDb()
  let leagueId: number | undefined
  if (opts.leagueSlug) {
    leagueId = getLeagueBySlug(opts.leagueSlug, conn)?.id
    if (leagueId === undefined) return []
  }
  const rows = conn
    .select()
    .from(leagueTournaments)
    .orderBy(desc(leagueTournaments.createdAt))
    .all()
  return rows.filter(
    (r) =>
      (leagueId === undefined || r.leagueId === leagueId) &&
      (!opts.status || r.status === opts.status),
  )
}

/** Playable matches right now (both slots filled, no winner yet). */
export function openTournamentMatches(
  slug: string,
  database?: LearningHubDB,
): Tournament['matches'] {
  const conn = database ?? getDb()
  const row = getLeagueTournament(slug, conn)
  if (!row) return []
  return openMatches(rowToTournament(row))
}

/** Record a match winner; on a final, the tournament completes. */
export function recordTournamentMatchResult(
  slug: string,
  round: number,
  position: number,
  winner: string,
  duelId?: string,
  database?: LearningHubDB,
): LeagueTournamentRow {
  const conn = database ?? getDb()
  return withTransaction((tx) => {
    const row = getLeagueTournament(slug, tx)
    if (!row) throw new Error(`tournament not found: ${slug}`)
    if (row.status === 'complete') throw new Error('tournament already complete')
    const next = recordMatchResult(rowToTournament(row), round, position, winner, duelId)
    const [updated] = tx
      .update(leagueTournaments)
      .set({
        matchesJson: next.matches,
        champion: next.champion ?? null,
        status: next.champion ? 'complete' : 'open',
        completedAt: next.champion ? new Date().toISOString() : null,
      })
      .where(eq(leagueTournaments.id, row.id))
      .returning()
      .all()
    return updated!
  }, conn)
}

// ── Duel generation from a deck ─────────────────────────────────────────────

/**
 * Create a duel whose prompts come from a deck's answerable cards (basic,
 * typein, mcq). Same seed + same deck = same duel, so two devices generate
 * matching duels; omit the seed for a fresh draw.
 */
export function createDuelFromDeck(
  data: {
    slug: string
    deckId: number
    playerA: string
    playerB: string
    leagueSlug?: string
    limit?: number
    seed?: number
  },
  database?: LearningHubDB,
): LeagueDuelRow {
  const conn = database ?? getDb()
  const rows = conn
    .select({ id: cardsTable.id, content: cardsTable.content })
    .from(cardsTable)
    .where(eq(cardsTable.deckId, data.deckId))
    .all()
  const prompts = buildDuelPromptsFromCards(
    rows.map((r) => ({ id: r.id, content: r.content as Record<string, unknown> })),
    { limit: data.limit ?? 10, ...(data.seed !== undefined ? { seed: data.seed } : {}) },
  )
  if (prompts.length === 0) {
    throw new Error(`deck ${data.deckId} has no answerable cards (basic, typein or mcq)`)
  }
  return createLeagueDuel(
    {
      slug: data.slug,
      playerA: data.playerA,
      playerB: data.playerB,
      prompts,
      ...(data.leagueSlug !== undefined ? { leagueSlug: data.leagueSlug } : {}),
    },
    conn,
  )
}

/**
 * Close every league round whose end instant has passed (scheduling sweep).
 * A league inactive for several round lengths catches up in one sweep: the
 * elapsed rounds are real history, so each is recorded (empty rounds are
 * silent — no XP, no notifications, no promotions). Capped at 104 closes
 * per league per sweep (two years of weekly rounds) as a pathological-loop
 * guard.
 */
export function closeDueRounds(
  now: Date = new Date(),
  database?: LearningHubDB,
): { slug: string; roundClosed: number }[] {
  const conn = database ?? getDb()
  const closed: { slug: string; roundClosed: number }[] = []
  for (const row of listLeagueRows(conn)) {
    let league = row
    let guard = 0
    while (guard < 104 && isRoundDue(league, now)) {
      const { round } = closeLeagueRound(row.slug, conn)
      closed.push({ slug: row.slug, roundClosed: round.round })
      league = getLeagueBySlug(row.slug, conn)!
      guard++
    }
  }
  return closed
}

/** Elo history for one player in a league, newest first (profile sparkline). */
export function listLeagueEloEvents(
  slug: string,
  handle: string,
  limit = 50,
  database?: LearningHubDB,
): LeagueEloEventRow[] {
  const conn = database ?? getDb()
  const league = getLeagueBySlug(slug, conn)
  if (!league) return []
  return conn
    .select()
    .from(leagueEloEvents)
    .where(and(eq(leagueEloEvents.leagueId, league.id), eq(leagueEloEvents.handle, handle)))
    .orderBy(desc(leagueEloEvents.id))
    .limit(limit)
    .all()
}

/**
 * One player's full competitive profile in a league: standing, duel record
 * (draws counted from completed duels, since the player row tracks only
 * wins/losses), recent duels and the Elo trajectory.
 */
export function leaguePlayerProfile(
  slug: string,
  handle: string,
  database?: LearningHubDB,
): {
  player: LeaguePlayerRow
  record: { wins: number; losses: number; draws: number }
  recentDuels: LeagueDuelRow[]
  eloHistory: LeagueEloEventRow[]
  rank: number
} | null {
  const conn = database ?? getDb()
  const league = getLeagueBySlug(slug, conn)
  if (!league) return null
  const player = conn
    .select()
    .from(leaguePlayers)
    .where(and(eq(leaguePlayers.leagueId, league.id), eq(leaguePlayers.handle, handle)))
    .get()
  if (!player) return null

  const completed = conn
    .select()
    .from(leagueDuels)
    .where(
      and(
        eq(leagueDuels.leagueId, league.id),
        eq(leagueDuels.status, 'complete'),
        or(eq(leagueDuels.playerA, handle), eq(leagueDuels.playerB, handle)),
      ),
    )
    .orderBy(desc(leagueDuels.id))
    .all()
  const wins = completed.filter((d) => d.winner === handle).length
  const draws = completed.filter((d) => d.winner === null).length
  const losses = completed.length - wins - draws

  // rank inside the player's division by the standings ordering
  const division = conn
    .select()
    .from(leaguePlayers)
    .where(and(eq(leaguePlayers.leagueId, league.id), eq(leaguePlayers.tier, player.tier)))
    .all()
    .sort(
      (a, b) =>
        b.points - a.points || b.seasonPoints - a.seasonPoints || a.handle.localeCompare(b.handle),
    )
  const rank = division.findIndex((p) => p.handle === handle) + 1

  return {
    player,
    record: { wins, losses, draws },
    recentDuels: completed.slice(0, 10),
    eloHistory: listLeagueEloEvents(slug, handle, 50, conn),
    rank,
  }
}

// ─── Portable export/import (lh-leagues-transfer/v1) ───────────────────────

/**
 * Gather a league's full state into a checksummed transfer envelope. Returns
 * null when the slug does not exist.
 */
export function exportLeague(slug: string, database?: LearningHubDB): LeagueTransfer | null {
  const conn = database ?? getDb()
  const league = getLeagueBySlug(slug, conn)
  if (!league) return null
  const players = conn
    .select()
    .from(leaguePlayers)
    .where(eq(leaguePlayers.leagueId, league.id))
    .all()
  const rounds = conn
    .select()
    .from(leagueRounds)
    .where(eq(leagueRounds.leagueId, league.id))
    .orderBy(desc(leagueRounds.round))
    .all()
  const duels = conn.select().from(leagueDuels).where(eq(leagueDuels.leagueId, league.id)).all()
  const tournaments = conn
    .select()
    .from(leagueTournaments)
    .where(eq(leagueTournaments.leagueId, league.id))
    .all()
  const seasons = conn
    .select()
    .from(leagueSeasons)
    .where(eq(leagueSeasons.leagueId, league.id))
    .orderBy(desc(leagueSeasons.season))
    .all()
  const duelSlugById = new Map(duels.map((d) => [d.id, d.slug]))
  const eloEvents = conn
    .select()
    .from(leagueEloEvents)
    .where(eq(leagueEloEvents.leagueId, league.id))
    .all()
    .map((e) => ({
      duelSlug: duelSlugById.get(e.duelId) ?? '',
      handle: e.handle,
      opponent: e.opponent,
      result: e.result,
      eloBefore: e.eloBefore,
      eloAfter: e.eloAfter,
      createdAt: e.createdAt,
    }))

  const payload: LeagueTransferPayload = {
    league: rowsToLeague(league, players),
    players: players.map((p) => ({
      handle: p.handle,
      tier: p.tier,
      points: p.points,
      seasonPoints: p.seasonPoints,
      roundsWon: p.roundsWon,
      duelsWon: p.duelsWon,
      duelsLost: p.duelsLost,
      elo: p.elo,
      joinedAt: p.joinedAt,
    })),
    rounds: rounds.map((r) => ({
      round: r.round,
      closedAt: r.closedAt,
      promotionsJson: r.promotionsJson,
      relegationsJson: r.relegationsJson,
      winnersJson: r.winnersJson,
    })),
    duels: duels.map((d) => ({
      duel: rowToDuel(d),
      status: d.status as 'open' | 'complete',
      winner: d.winner,
      completedAt: d.completedAt,
      createdAt: d.createdAt,
    })),
    tournaments: tournaments.map((t) => ({
      tournament: rowToTournament(t),
      status: t.status as 'open' | 'complete',
      createdAt: t.createdAt,
    })),
    seasons: seasons.map((se) => ({
      season: se.season,
      champion: se.champion,
      finalStandingsJson: se.finalStandingsJson,
      closedAt: se.closedAt,
    })),
    eloEvents,
  }
  return createLeagueTransfer(payload)
}

/**
 * Import a transfer envelope as a NEW league. The league slug and every
 * duel/tournament slug must be free — slugs are globally unique and an
 * import never overwrites existing state. Returns the created league row.
 */
export function importLeague(raw: string | unknown, database?: LearningHubDB): LeagueRow {
  const conn = database ?? getDb()
  const transfer = parseLeagueTransfer(raw)
  const { payload } = transfer
  const slug = payload.league.id
  return withTransaction((tx) => {
    if (getLeagueBySlug(slug, tx)) throw new Error(`league already exists: ${slug}`)
    for (const d of payload.duels) {
      if (getLeagueDuel(d.duel.id, tx)) throw new Error(`duel slug already exists: ${d.duel.id}`)
    }
    for (const t of payload.tournaments) {
      if (getLeagueTournament(t.tournament.id, tx))
        throw new Error(`tournament slug already exists: ${t.tournament.id}`)
    }

    const core = payload.league
    const [league] = tx
      .insert(leagues)
      .values({
        slug: core.id,
        title: core.title,
        seasonStart: core.seasonStart,
        roundLengthDays: core.roundLengthDays,
        seasonLengthRounds: core.seasonLengthRounds,
        currentRound: core.currentRound,
        season: core.season,
        promotionSlots: core.promotionSlots,
        relegationSlots: core.relegationSlots,
        scoringJson: core.scoring,
      })
      .returning()
      .all()

    for (const p of payload.players) {
      tx.insert(leaguePlayers)
        .values({
          leagueId: league!.id,
          handle: p.handle,
          tier: p.tier,
          points: p.points,
          seasonPoints: p.seasonPoints,
          roundsWon: p.roundsWon,
          duelsWon: p.duelsWon,
          duelsLost: p.duelsLost,
          elo: p.elo,
          joinedAt: p.joinedAt,
        })
        .run()
    }
    for (const r of payload.rounds) {
      tx.insert(leagueRounds)
        .values({
          leagueId: league!.id,
          round: r.round,
          promotionsJson: r.promotionsJson,
          relegationsJson: r.relegationsJson,
          winnersJson: r.winnersJson,
          closedAt: r.closedAt,
        })
        .run()
    }
    const duelIdBySlug = new Map<string, number>()
    for (const d of payload.duels) {
      const [row] = tx
        .insert(leagueDuels)
        .values({
          slug: d.duel.id,
          leagueId: league!.id,
          playerA: d.duel.playerA,
          playerB: d.duel.playerB,
          promptsJson: d.duel.prompts,
          answersAJson: d.duel.answersA,
          answersBJson: d.duel.answersB,
          status: d.status,
          winner: d.winner,
          createdAt: d.createdAt,
          completedAt: d.completedAt,
        })
        .returning()
        .all()
      duelIdBySlug.set(d.duel.id, row!.id)
    }
    for (const t of payload.tournaments) {
      tx.insert(leagueTournaments)
        .values({
          slug: t.tournament.id,
          leagueId: league!.id,
          title: t.tournament.title,
          seedsJson: t.tournament.seeds,
          matchesJson: t.tournament.matches,
          status: t.status,
          champion: t.tournament.champion ?? null,
          createdAt: t.createdAt,
        })
        .run()
    }
    for (const se of payload.seasons) {
      tx.insert(leagueSeasons)
        .values({
          leagueId: league!.id,
          season: se.season,
          champion: se.champion,
          finalStandingsJson: se.finalStandingsJson,
          closedAt: se.closedAt,
        })
        .run()
    }
    for (const e of payload.eloEvents) {
      const duelId = duelIdBySlug.get(e.duelSlug)
      if (!duelId) continue // event for a duel missing from the payload: skip, don't crash
      tx.insert(leagueEloEvents)
        .values({
          leagueId: league!.id,
          duelId,
          handle: e.handle,
          opponent: e.opponent,
          result: e.result,
          eloBefore: e.eloBefore,
          eloAfter: e.eloAfter,
          createdAt: e.createdAt,
        })
        .run()
    }
    return league!
  }, conn)
}
