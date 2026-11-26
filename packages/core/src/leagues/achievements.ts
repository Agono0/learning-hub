/**
 * League achievements: a closed catalog of earnable badges for competitive
 * play (duel wins, Elo milestones, division climbs, round and season
 * titles, tournament championships). Pure evaluation over a gathered
 * context; persistence and notification side effects live in packages/db.
 */

export interface LeagueAchievementDef {
  id: string
  title: string
  description: string
}

/**
 * Everything needed to decide which achievements a player has earned.
 * Gathered by the db layer from players, seasons archives and tournaments.
 */
export interface LeagueAchievementContext {
  /** Current division. */
  tier: string
  points: number
  seasonPoints: number
  roundsWon: number
  duelsWon: number
  duelsLost: number
  elo: number
  /** Seasons this player championed (from the league_seasons archive). */
  seasonsChampioned: number
  /** Completed tournaments this player won. */
  tournamentsWon: number
}

export const LEAGUE_ACHIEVEMENTS: readonly LeagueAchievementDef[] = [
  {
    id: 'first-blood',
    title: 'First blood',
    description: 'Win your first league duel.',
  },
  {
    id: 'duel-veteran',
    title: 'Duel veteran',
    description: 'Win 5 league duels.',
  },
  {
    id: 'duel-champion',
    title: 'Duel champion',
    description: 'Win 10 league duels.',
  },
  {
    id: 'elo-climber',
    title: 'Elo climber',
    description: 'Reach a 1200 duel rating.',
  },
  {
    id: 'elo-master',
    title: 'Elo master',
    description: 'Reach a 1500 duel rating.',
  },
  {
    id: 'elo-grandmaster',
    title: 'Elo grandmaster',
    description: 'Reach a 2000 duel rating.',
  },
  {
    id: 'silver-climb',
    title: 'Silver climb',
    description: 'Earn promotion out of bronze.',
  },
  {
    id: 'gold-climb',
    title: 'Gold climb',
    description: 'Reach the gold division.',
  },
  {
    id: 'platinum-climb',
    title: 'Platinum climb',
    description: 'Reach the platinum division.',
  },
  {
    id: 'diamond-climb',
    title: 'Diamond climb',
    description: 'Reach the diamond division.',
  },
  {
    id: 'round-winner',
    title: 'Round winner',
    description: 'Win your division in a round.',
  },
  {
    id: 'season-contender',
    title: 'Season contender',
    description: 'Win your division in 3 rounds of one league.',
  },
  {
    id: 'season-champion',
    title: 'Season champion',
    description: 'Finish a season as the league champion.',
  },
  {
    id: 'tournament-champion',
    title: 'Tournament champion',
    description: 'Win a league tournament bracket.',
  },
  {
    id: 'points-century',
    title: 'Century',
    description: 'Bank 100 season points in one league.',
  },
  {
    id: 'points-millennium',
    title: 'Millennium',
    description: 'Bank 1,000 season points in one league.',
  },
] as const

export type LeagueAchievementId = (typeof LEAGUE_ACHIEVEMENTS)[number]['id']

const ACHIEVEMENT_INDEX = new Map(LEAGUE_ACHIEVEMENTS.map((a) => [a.id, a]))

/** Look up a catalog entry; null for an unknown id. */
export function getLeagueAchievement(id: string): LeagueAchievementDef | null {
  return ACHIEVEMENT_INDEX.get(id as LeagueAchievementId) ?? null
}

const TIER_RANK: Record<string, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
  diamond: 4,
}

/** Every achievement the context satisfies (earned or not — pure check). */
export function evaluateLeagueAchievements(ctx: LeagueAchievementContext): LeagueAchievementId[] {
  const earned: LeagueAchievementId[] = []
  const rank = TIER_RANK[ctx.tier] ?? 0

  if (ctx.duelsWon >= 1) earned.push('first-blood')
  if (ctx.duelsWon >= 5) earned.push('duel-veteran')
  if (ctx.duelsWon >= 10) earned.push('duel-champion')
  if (ctx.elo >= 1200) earned.push('elo-climber')
  if (ctx.elo >= 1500) earned.push('elo-master')
  if (ctx.elo >= 2000) earned.push('elo-grandmaster')
  if (rank >= TIER_RANK.silver) earned.push('silver-climb')
  if (rank >= TIER_RANK.gold) earned.push('gold-climb')
  if (rank >= TIER_RANK.platinum) earned.push('platinum-climb')
  if (rank >= TIER_RANK.diamond) earned.push('diamond-climb')
  if (ctx.roundsWon >= 1) earned.push('round-winner')
  if (ctx.roundsWon >= 3) earned.push('season-contender')
  if (ctx.seasonsChampioned >= 1) earned.push('season-champion')
  if (ctx.tournamentsWon >= 1) earned.push('tournament-champion')
  if (ctx.seasonPoints >= 100) earned.push('points-century')
  if (ctx.seasonPoints >= 1000) earned.push('points-millennium')

  return earned
}

/**
 * Diff helper: given everything the context satisfies and everything already
 * recorded, return only the newly earned ids (catalog order).
 */
export function newlyEarnedAchievements(
  ctx: LeagueAchievementContext,
  alreadyEarned: readonly string[],
): LeagueAchievementId[] {
  const have = new Set(alreadyEarned)
  return evaluateLeagueAchievements(ctx).filter((id) => !have.has(id))
}
