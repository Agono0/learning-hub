import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  awardLeaguePoints,
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
  leagues,
  leagueSeasons,
  leagueTournaments,
  listLeagueAchievements,
  notificationLog,
  setDb,
  submitDuelAnswers,
  syncLeagueAchievements,
  syncLeagueAchievementsAll,
  type LearningHubDB,
} from '../src/index'

const PROMPTS = [
  { id: 'q1', question: '2+2?', answers: ['4', 'four'] },
  { id: 'q2', question: 'Capital of France?', answers: ['Paris'] },
]
const RIGHT = [
  { promptId: 'q1', answer: '4', elapsedMs: 900 },
  { promptId: 'q2', answer: 'Paris', elapsedMs: 1100 },
]
const WRONG = [
  { promptId: 'q1', answer: '5', elapsedMs: 700 },
  { promptId: 'q2', answer: 'Lyon', elapsedMs: 800 },
]

let db: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-achv-'))
  db = await initDb({ path: join(tmp, 'achv.db') })
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
  db.delete(notificationLog).run()
})

function makeLeague(): void {
  createLeagueRow({ slug: 'spring', title: 'Spring Season', seasonStart: '2026-03-01' }, db)
  joinLeagueRow('spring', 'amr', db)
  joinLeagueRow('spring', 'sara', db)
}

describe('league achievements', () => {
  it('a duel win auto-banks first-blood for the winner and notifies', () => {
    makeLeague()
    createLeagueDuel(
      { slug: 'd1', leagueSlug: 'spring', playerA: 'amr', playerB: 'sara', prompts: PROMPTS },
      db,
    )
    submitDuelAnswers('d1', 'A', RIGHT, db)
    submitDuelAnswers('d1', 'B', WRONG, db)

    const amr = listLeagueAchievements('spring', 'amr', db)
    expect(amr.map((a) => a.achievementId)).toEqual(['first-blood'])
    expect(amr[0]!.title).toBe('First blood')
    // the loser earned nothing from losing
    expect(listLeagueAchievements('spring', 'sara', db)).toEqual([])

    const notices = db.select().from(notificationLog).all()
    expect(notices.some((n) => n.title.includes('First blood'))).toBe(true)
    expect(notices.every((n) => n.channel === 'league')).toBe(true)
  })

  it('round close banks climb and round-winner badges across the league', () => {
    makeLeague()
    awardLeaguePoints('spring', { kind: 'reviews', handle: 'amr', count: 10 }, db)
    // sara scores nothing: zero-point players neither promote nor win rounds
    closeLeagueRound('spring', db)

    const amr = listLeagueAchievements('spring', 'amr', db).map((a) => a.achievementId)
    expect(amr).toContain('round-winner')
    expect(amr).toContain('silver-climb') // promoted out of bronze
    expect(listLeagueAchievements('spring', 'sara', db)).toEqual([])
  })

  it('explicit sync is idempotent and reports only newly earned badges', () => {
    makeLeague()
    awardLeaguePoints('spring', { kind: 'reviews', handle: 'amr', count: 10 }, db)
    const first = syncLeagueAchievements('spring', 'amr', db)
    expect(first.map((a) => a.achievementId)).toEqual(['points-century'].slice(0, 0)) // 10 pts: nothing yet
    awardLeaguePoints('spring', { kind: 'reviews', handle: 'amr', count: 95 }, db)
    const second = syncLeagueAchievements('spring', 'amr', db)
    expect(second.map((a) => a.achievementId)).toEqual(['points-century'])
    const third = syncLeagueAchievements('spring', 'amr', db)
    expect(third).toEqual([])
    // still exactly one banked row
    expect(listLeagueAchievements('spring', 'amr', db)).toHaveLength(1)
  })

  it('sweeps the whole league and returns only players with new badges', () => {
    makeLeague()
    awardLeaguePoints('spring', { kind: 'reviews', handle: 'amr', count: 120 }, db)
    const out = syncLeagueAchievementsAll('spring', db)
    expect(out).toHaveLength(1)
    expect(out[0]!.handle).toBe('amr')
    expect(out[0]!.earned.map((a) => a.achievementId)).toEqual(['points-century'])
    expect(syncLeagueAchievementsAll('spring', db)).toEqual([])
    expect(syncLeagueAchievementsAll('missing', db)).toEqual([])
  })
})
