import { describe, it, expect } from 'vitest'
import {
  LEAGUE_ACHIEVEMENTS,
  evaluateLeagueAchievements,
  newlyEarnedAchievements,
  getLeagueAchievement,
  type LeagueAchievementContext,
} from '../src/leagues/index.js'

function ctx(overrides: Partial<LeagueAchievementContext> = {}): LeagueAchievementContext {
  return {
    tier: 'bronze',
    points: 0,
    seasonPoints: 0,
    roundsWon: 0,
    duelsWon: 0,
    duelsLost: 0,
    elo: 1000,
    seasonsChampioned: 0,
    tournamentsWon: 0,
    ...overrides,
  }
}

describe('league achievements', () => {
  it('catalog ids are unique and lookup works', () => {
    const ids = LEAGUE_ACHIEVEMENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(getLeagueAchievement('first-blood')!.title).toBe('First blood')
    expect(getLeagueAchievement('nope')).toBeNull()
  })

  it('a fresh bronze player earns nothing', () => {
    expect(evaluateLeagueAchievements(ctx())).toEqual([])
  })

  it('duel wins and Elo milestones stack in order', () => {
    expect(evaluateLeagueAchievements(ctx({ duelsWon: 1 }))).toEqual(['first-blood'])
    expect(evaluateLeagueAchievements(ctx({ duelsWon: 7, elo: 1250 }))).toEqual([
      'first-blood',
      'duel-veteran',
      'elo-climber',
    ])
    expect(evaluateLeagueAchievements(ctx({ duelsWon: 12, elo: 2100 }))).toEqual([
      'first-blood',
      'duel-veteran',
      'duel-champion',
      'elo-climber',
      'elo-master',
      'elo-grandmaster',
    ])
  })

  it('division climbs include every lower climb badge', () => {
    const earned = evaluateLeagueAchievements(ctx({ tier: 'platinum' }))
    expect(earned).toEqual(['silver-climb', 'gold-climb', 'platinum-climb'])
  })

  it('titles and points thresholds', () => {
    const earned = evaluateLeagueAchievements(
      ctx({ roundsWon: 3, seasonsChampioned: 1, tournamentsWon: 1, seasonPoints: 1000 }),
    )
    expect(earned).toEqual([
      'round-winner',
      'season-contender',
      'season-champion',
      'tournament-champion',
      'points-century',
      'points-millennium',
    ])
  })

  it('diffs against already-earned ids', () => {
    const c = ctx({ duelsWon: 6, elo: 1300 })
    expect(newlyEarnedAchievements(c, ['first-blood'])).toEqual(['duel-veteran', 'elo-climber'])
    expect(newlyEarnedAchievements(c, ['first-blood', 'duel-veteran', 'elo-climber'])).toEqual([])
  })
})
