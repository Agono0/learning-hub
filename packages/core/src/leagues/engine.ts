/**
 * Competitive Leagues (lh-leagues/v1): seasonal study competition.
 *
 * Players are placed into divisions (tiers) of a league. Each week is a
 * round: players earn league points from study activity (reviews, focus
 * minutes, duel wins) and head-to-head duels settle ties directly. At the
 * end of a round the top players promote to the next division up, the
 * bottom ones relegate, and at season end the top division's champion is
 * crowned. All logic is pure; persistence lives in the db layer.
 */
import { z } from 'zod'

export const LEAGUES_SCHEMA = 'lh-leagues/v1'

export const DivisionTierSchema = z.enum(['bronze', 'silver', 'gold', 'platinum', 'diamond'])
export type DivisionTier = z.infer<typeof DivisionTierSchema>

export const DIVISION_ORDER: DivisionTier[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond']

export const LeaguePlayerSchema = z.object({
  handle: z.string().min(1).max(50),
  tier: DivisionTierSchema,
  /** League points earned this round. */
  points: z.number().int().nonnegative().default(0),
  /** Season totals (never reset). */
  seasonPoints: z.number().int().nonnegative().default(0),
  roundsWon: z.number().int().nonnegative().default(0),
  duelsWon: z.number().int().nonnegative().default(0),
  duelsLost: z.number().int().nonnegative().default(0),
})
export type LeaguePlayer = z.infer<typeof LeaguePlayerSchema>

export const LeagueSchema = z.object({
  schema: z.literal(LEAGUES_SCHEMA),
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  /** ISO date of the season's first round. */
  seasonStart: z.string().min(1),
  roundLengthDays: z.number().int().min(1).max(28).default(7),
  currentRound: z.number().int().nonnegative().default(0),
  players: z.array(LeaguePlayerSchema),
  /** How many promote/relegate per division at round end. */
  promotionSlots: z.number().int().min(1).max(10).default(3),
  relegationSlots: z.number().int().min(0).max(10).default(3),
  /** Points awarded for events (see awardPoints). */
  scoring: z
    .object({
      review: z.number().int().nonnegative().default(1),
      focusMinute: z.number().int().nonnegative().default(1),
      duelWin: z.number().int().nonnegative().default(25),
      duelDraw: z.number().int().nonnegative().default(10),
    })
    .default({ review: 1, focusMinute: 1, duelWin: 25, duelDraw: 10 }),
})
export type League = z.infer<typeof LeagueSchema>

export interface LeagueInput {
  id: string
  title: string
  seasonStart: string
  roundLengthDays?: number
  promotionSlots?: number
  relegationSlots?: number
}

export function createLeague(input: LeagueInput): League {
  return LeagueSchema.parse({
    schema: LEAGUES_SCHEMA,
    id: input.id,
    title: input.title,
    seasonStart: input.seasonStart,
    roundLengthDays: input.roundLengthDays ?? 7,
    currentRound: 0,
    players: [],
    promotionSlots: input.promotionSlots ?? 3,
    relegationSlots: input.relegationSlots ?? 3,
    scoring: { review: 1, focusMinute: 1, duelWin: 25, duelDraw: 10 },
  })
}

export function joinLeague(league: League, handle: string): League {
  if (league.players.some((p) => p.handle === handle)) return league
  return LeagueSchema.parse({
    ...league,
    players: [
      ...league.players,
      {
        handle,
        tier: 'bronze',
        points: 0,
        seasonPoints: 0,
        roundsWon: 0,
        duelsWon: 0,
        duelsLost: 0,
      },
    ],
  })
}

export type LeagueEvent =
  | { kind: 'reviews'; handle: string; count: number }
  | { kind: 'focus'; handle: string; minutes: number }
  | { kind: 'duel'; winner: string; loser: string; draw?: boolean }

/** Award round points for one event. Unknown handles are ignored. */
export function awardPoints(league: League, event: LeagueEvent): League {
  const players = league.players.map((p) => ({ ...p }))
  const find = (h: string) => players.find((p) => p.handle === h)
  switch (event.kind) {
    case 'reviews': {
      const p = find(event.handle)
      if (p && event.count > 0) p.points += Math.floor(event.count) * league.scoring.review
      break
    }
    case 'focus': {
      const p = find(event.handle)
      if (p && event.minutes > 0) p.points += Math.floor(event.minutes) * league.scoring.focusMinute
      break
    }
    case 'duel': {
      const w = find(event.winner)
      const l = find(event.loser)
      if (!w || !l) break
      if (event.draw) {
        w.points += league.scoring.duelDraw
        l.points += league.scoring.duelDraw
      } else {
        w.points += league.scoring.duelWin
        w.duelsWon += 1
        l.duelsLost += 1
      }
      break
    }
  }
  return LeagueSchema.parse({ ...league, players })
}

/** Standings within one tier, sorted by round points then season points. */
export function divisionStandings(league: League, tier: DivisionTier): LeaguePlayer[] {
  return league.players
    .filter((p) => p.tier === tier)
    .sort(
      (a, b) =>
        b.points - a.points || b.seasonPoints - a.seasonPoints || a.handle.localeCompare(b.handle),
    )
}

export interface RoundResult {
  league: League
  promoted: { handle: string; from: DivisionTier; to: DivisionTier }[]
  relegated: { handle: string; from: DivisionTier; to: DivisionTier }[]
  roundWinners: { tier: DivisionTier; handle: string }[]
}

/**
 * Close the current round: reset round points into season totals, promote the
 * top of each division (except diamond), relegate the bottom (except
 * bronze), and advance the round counter.
 */
export function closeRound(league: League): RoundResult {
  const promoted: RoundResult['promoted'] = []
  const relegated: RoundResult['relegated'] = []
  const roundWinners: RoundResult['roundWinners'] = []
  const tierMoves = new Map<string, DivisionTier>()

  for (let i = 0; i < DIVISION_ORDER.length; i++) {
    const tier = DIVISION_ORDER[i]
    const standings = divisionStandings(league, tier)
    if (standings.length === 0) continue
    roundWinners.push({ tier, handle: standings[0].handle })
    const up = DIVISION_ORDER[i + 1]
    const down = DIVISION_ORDER[i - 1]
    if (up) {
      // you must play to advance: a zero-point player never promotes, even
      // when alone at the top of a division
      for (const p of standings.slice(0, league.promotionSlots).filter((p) => p.points > 0)) {
        tierMoves.set(p.handle, up)
        promoted.push({ handle: p.handle, from: tier, to: up })
      }
    }
    if (down) {
      // never relegate someone already promoted this round
      const candidates = standings
        .slice(Math.max(0, standings.length - league.relegationSlots))
        .filter((p) => !tierMoves.has(p.handle))
      for (const p of candidates) {
        tierMoves.set(p.handle, down)
        relegated.push({ handle: p.handle, from: tier, to: down })
      }
    }
  }

  const players = league.players.map((p) => {
    const won = roundWinners.some((w) => w.handle === p.handle)
    return {
      ...p,
      tier: tierMoves.get(p.handle) ?? p.tier,
      seasonPoints: p.seasonPoints + p.points,
      points: 0,
      roundsWon: p.roundsWon + (won ? 1 : 0),
    }
  })
  return {
    league: LeagueSchema.parse({ ...league, players, currentRound: league.currentRound + 1 }),
    promoted,
    relegated,
    roundWinners,
  }
}

/** Minimal shape the scheduling helpers need (a db row qualifies). */
export type LeagueSchedule = Pick<League, 'seasonStart' | 'roundLengthDays' | 'currentRound'>

/**
 * Instant the current round ends: seasonStart (an ISO calendar date, read as
 * UTC midnight) plus (currentRound + 1) round lengths. UTC math keeps every
 * device on the same boundary regardless of local timezone.
 */
export function roundEndsAt(league: LeagueSchedule): Date {
  const start = new Date(`${league.seasonStart}T00:00:00.000Z`)
  return new Date(start.getTime() + (league.currentRound + 1) * league.roundLengthDays * 86_400_000)
}

/** True once the current round's end instant has passed. */
export function isRoundDue(league: LeagueSchedule, now: Date = new Date()): boolean {
  return now.getTime() >= roundEndsAt(league).getTime()
}

/** Champion at any moment: leader of the highest non-empty division. */
export function leagueLeader(league: League): LeaguePlayer | undefined {
  for (let i = DIVISION_ORDER.length - 1; i >= 0; i--) {
    const standings = divisionStandings(league, DIVISION_ORDER[i])
    if (standings.length > 0) return standings[0]
  }
  return undefined
}
