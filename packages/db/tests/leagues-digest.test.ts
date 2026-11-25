import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  awardLeaguePoints,
  buildLeagueDigest,
  closeLeagueRound,
  createLeagueDuel,
  createLeagueRow,
  initDb,
  joinLeagueRow,
  leagueAchievements,
  leagueDuels,
  leagueEloEvents,
  leaguePlayers,
  leagueRounds,
  leagueSeasons,
  leagueTournaments,
  leagues,
  setDb,
  submitDuelAnswers,
  type LearningHubDB,
} from '../src/index'

const PROMPTS = [
  { id: 'q1', question: '2+2?', answers: ['4'] },
  { id: 'q2', question: 'Capital of France?', answers: ['Paris'] },
]

let db: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-digest-'))
  db = await initDb({ path: join(tmp, 'digest.db') })
  setDb(db)
})

beforeEach(() => {
  db.delete(leagueAchievements).run()
  db.delete(leagueSeasons).run()
  db.delete(leagueEloEvents).run()
  db.delete(leagueTournaments).run()
  db.delete(leagueDuels).run()
  db.delete(leagueRounds).run()
  db.delete(leaguePlayers).run()
  db.delete(leagues).run()
})

function freshLeague(): void {
  createLeagueRow({ slug: 'spring', title: 'Spring League', seasonStart: '2026-03-01' }, db)
  joinLeagueRow('spring', 'amr', db)
  joinLeagueRow('spring', 'sara', db)
}

function side(
  answers: [string, string],
): { promptId: string; answer: string; elapsedMs: number }[] {
  return [
    { promptId: 'q1', answer: answers[0], elapsedMs: 900 },
    { promptId: 'q2', answer: answers[1], elapsedMs: 1100 },
  ]
}

function playedDuel(slug: string, aAnswers: [string, string], bAnswers: [string, string]): void {
  createLeagueDuel(
    { slug, leagueSlug: 'spring', playerA: 'amr', playerB: 'sara', prompts: PROMPTS },
    db,
  )
  submitDuelAnswers(slug, 'A', side(aAnswers), db)
  submitDuelAnswers(slug, 'B', side(bAnswers), db)
}

describe('buildLeagueDigest', () => {
  it('returns null for an unknown league', () => {
    expect(buildLeagueDigest('nope', db)).toBeNull()
  })

  it('summarizes an idle league: standings, no rounds, no duels', () => {
    freshLeague()
    const digest = buildLeagueDigest('spring', db)
    expect(digest).not.toBeNull()
    expect(digest!.slug).toBe('spring')
    expect(digest!.title).toBe('Spring League')
    expect(digest!.playerCount).toBe(2)
    expect(digest!.roundsClosed).toBe(0)
    expect(digest!.lastRound).toBeNull()
    expect(digest!.duels).toEqual({ open: 0, completed: 0, recentCompleted: [] })
    expect(digest!.eloMovers).toEqual([])
    expect(digest!.newAchievements).toEqual([])
    // both players start in bronze, zero points
    expect(digest!.divisions).toHaveLength(1)
    expect(digest!.divisions[0].tier).toBe('bronze')
    expect(digest!.divisions[0].standings.map((s) => s.handle).sort()).toEqual(['amr', 'sara'])
    expect(digest!.divisions[0].standings.every((s) => s.seasonPoints === 0)).toBe(true)
  })

  it('reports the last closed round with winners and movement', () => {
    freshLeague()
    awardLeaguePoints('spring', { kind: 'reviews', handle: 'amr', count: 8 }, db)
    awardLeaguePoints('spring', { kind: 'reviews', handle: 'sara', count: 2 }, db)
    closeLeagueRound('spring', db)

    const digest = buildLeagueDigest('spring', db)!
    expect(digest.roundsClosed).toBe(1)
    expect(digest.lastRound).not.toBeNull()
    expect(digest.lastRound!.round).toBe(0) // rounds are 0-indexed
    expect(digest.lastRound!.winners).toEqual([{ tier: 'bronze', handle: 'amr' }])
    // season points survive the round close; round points reset
    const amr = digest.divisions[0].standings.find((s) => s.handle === 'amr')!
    expect(amr.seasonPoints).toBeGreaterThan(0)
    expect(amr.roundsWon).toBe(1)
  })

  it('tracks duel activity and weekly Elo movers', () => {
    freshLeague()
    // amr answers both correctly, sara misses one -> amr wins, Elo moves
    playedDuel('d-1', ['4', 'Paris'], ['4', 'London'])
    createLeagueDuel(
      { slug: 'd-2', leagueSlug: 'spring', playerA: 'amr', playerB: 'sara', prompts: PROMPTS },
      db,
    )

    const digest = buildLeagueDigest('spring', db)!
    expect(digest.duels.open).toBe(1)
    expect(digest.duels.completed).toBe(1)
    expect(digest.duels.recentCompleted).toHaveLength(1)
    expect(digest.duels.recentCompleted[0]).toMatchObject({
      slug: 'd-1',
      playerA: 'amr',
      playerB: 'sara',
      winner: 'amr',
    })
    const amr = digest.eloMovers.find((m) => m.handle === 'amr')!
    const sara = digest.eloMovers.find((m) => m.handle === 'sara')!
    expect(amr.delta).toBeGreaterThan(0)
    expect(sara.delta).toBeLessThan(0)
    expect(amr.duels).toBe(1)
    // movers are ordered by delta, biggest gainer first
    expect(digest.eloMovers[0].handle).toBe('amr')
  })

  it('lists achievements earned inside the weekly window only', () => {
    freshLeague()
    playedDuel('d-1', ['4', 'Paris'], ['4', 'London']) // amr duel win -> achievement
    const digest = buildLeagueDigest('spring', db)!
    const ids = digest.newAchievements.map((a) => a.achievementId)
    expect(ids.length).toBeGreaterThan(0)
    expect(digest.newAchievements.every((a) => a.handle === 'amr')).toBe(true)

    // backdate the earned rows beyond the window: they drop out of the digest
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    db.update(leagueAchievements).set({ earnedAt: old }).run()
    expect(buildLeagueDigest('spring', db)!.newAchievements).toEqual([])
  })
})
