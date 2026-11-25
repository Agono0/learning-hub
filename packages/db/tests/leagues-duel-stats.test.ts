import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createLeagueDuel,
  createLeagueRow,
  initDb,
  joinLeagueRow,
  leagueAchievements,
  leagueDuels,
  leagueDuelStats,
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
  const tmp = mkdtempSync(join(tmpdir(), 'lh-dstats-'))
  db = await initDb({ path: join(tmp, 'dstats.db') })
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

function freshLeague(handles: string[] = ['amr', 'sara']): void {
  createLeagueRow({ slug: 'spring', title: 'Spring', seasonStart: '2026-03-01' }, db)
  for (const h of handles) joinLeagueRow('spring', h, db)
}

type Answers = [string, string][]

function play(slug: string, a: string, b: string, aAns: Answers, bAns: Answers): void {
  createLeagueDuel({ slug, leagueSlug: 'spring', playerA: a, playerB: b, prompts: PROMPTS }, db)
  submitDuelAnswers(
    slug,
    'A',
    aAns.map(([answer, ms], i) => ({ promptId: PROMPTS[i].id, answer, elapsedMs: Number(ms) })),
    db,
  )
  submitDuelAnswers(
    slug,
    'B',
    bAns.map(([answer, ms], i) => ({ promptId: PROMPTS[i].id, answer, elapsedMs: Number(ms) })),
    db,
  )
}

describe('leagueDuelStats', () => {
  it('returns null for an unknown league and [] for a league without completed duels', () => {
    expect(leagueDuelStats('nope', db)).toBeNull()
    freshLeague()
    expect(leagueDuelStats('spring', db)).toEqual([])
    // an open duel does not count
    createLeagueDuel(
      { slug: 'open', leagueSlug: 'spring', playerA: 'amr', playerB: 'sara', prompts: PROMPTS },
      db,
    )
    expect(leagueDuelStats('spring', db)).toEqual([])
  })

  it('aggregates record, accuracy, answer speed and streaks per player', () => {
    freshLeague()
    // duel 1: amr wins 2/2 fast, sara 1/2
    play(
      'd-1',
      'amr',
      'sara',
      [
        ['4', '900'],
        ['Paris', '1100'],
      ],
      [
        ['4', '1500'],
        ['London', '800'],
      ],
    )
    // duel 2: amr wins again (both 1/1 on q1-correct tie -> speed decides: amr faster)
    play(
      'd-2',
      'amr',
      'sara',
      [
        ['4', '600'],
        ['Rome', '700'],
      ],
      [
        ['4', '1200'],
        ['Madrid', '500'],
      ],
    )
    // duel 3: honest draw (same correct count, same speed on correct)
    play(
      'd-3',
      'amr',
      'sara',
      [
        ['4', '1000'],
        ['x', '100'],
      ],
      [
        ['4', '1000'],
        ['y', '100'],
      ],
    )

    const stats = leagueDuelStats('spring', db)!
    expect(stats.map((s) => s.handle)).toEqual(['amr', 'sara'])
    const amr = stats[0]
    expect(amr.played).toBe(3)
    expect(amr.wins).toBe(2)
    expect(amr.losses).toBe(0)
    expect(amr.draws).toBe(1)
    expect(amr.winRate).toBeCloseTo(2 / 3)
    // accuracy: (2/2 + 1/2 + 1/2) / 3 = 2/3
    expect(amr.avgAccuracy).toBeCloseTo(2 / 3)
    // correct times: d1 q1 900 + q2 1100, d2 q1 600, d3 q1 1000 -> 3600/4
    expect(amr.avgCorrectTimeMs).toBeCloseTo(900)
    expect(amr.bestStreak).toBe(2)
    expect(amr.currentStreak).toBe(0) // draw broke it

    const sara = stats[1]
    expect(sara.wins).toBe(0)
    expect(sara.losses).toBe(2)
    expect(sara.draws).toBe(1)
    expect(sara.bestStreak).toBe(0)
  })

  it('tracks a live win streak across rematches', () => {
    freshLeague()
    play(
      'd-1',
      'amr',
      'sara',
      [
        ['4', '500'],
        ['Paris', '500'],
      ],
      [
        ['4', '900'],
        ['Paris', '900'],
      ],
    )
    play(
      'd-2',
      'amr',
      'sara',
      [
        ['4', '500'],
        ['Paris', '500'],
      ],
      [
        ['4', '900'],
        ['Paris', '900'],
      ],
    )
    const amr = leagueDuelStats('spring', db)!.find((s) => s.handle === 'amr')!
    expect(amr.currentStreak).toBe(2)
    expect(amr.bestStreak).toBe(2)
    expect(amr.winRate).toBe(1)
    expect(amr.avgAccuracy).toBe(1)
  })
})
