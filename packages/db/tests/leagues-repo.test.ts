import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  awardLeaguePoints,
  closeLeagueRound,
  createLeagueDuel,
  createLeagueRow,
  createLeagueTournament,
  getLeagueBySlug,
  getLeagueDuel,
  getLeagueTournament,
  initDb,
  joinLeagueRow,
  leagueChampion,
  leagueDuels,
  leaguePlayers,
  leagueRounds,
  leagues,
  leagueStandings,
  leagueTournaments,
  listLeagueDuels,
  listLeaguePlayers,
  listLeagueRounds,
  listLeagueRows,
  listLeagueTournaments,
  loadLeague,
  openTournamentMatches,
  recordTournamentMatchResult,
  setDb,
  submitDuelAnswers,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-leagues-'))
  db = await initDb({ path: join(tmp, 'leagues.db') })
  setDb(db)
})

beforeEach(() => {
  db.delete(leagueTournaments).run()
  db.delete(leagueDuels).run()
  db.delete(leagueRounds).run()
  db.delete(leaguePlayers).run()
  db.delete(leagues).run()
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

const PROMPTS = [
  { id: 'q1', question: '2+2?', answers: ['4', 'four'] },
  { id: 'q2', question: 'Capital of France?', answers: ['Paris'] },
]

function makeLeague(slug = 'spring'): void {
  createLeagueRow({ slug, title: 'Spring Season', seasonStart: '2026-03-01' }, db)
}

describe('league lifecycle', () => {
  it('creates a league with engine defaults and lists it', () => {
    makeLeague()
    const row = getLeagueBySlug('spring', db)!
    expect(row.title).toBe('Spring Season')
    expect(row.roundLengthDays).toBe(7)
    expect(row.promotionSlots).toBe(3)
    expect(row.scoringJson.duelWin).toBe(25)
    expect(listLeagueRows(db).map((l) => l.slug)).toContain('spring')
  })

  it('rejects an invalid config through the core engine', () => {
    expect(() => createLeagueRow({ slug: 'x', title: '', seasonStart: '2026-01-01' }, db)).toThrow()
  })

  it('joins players into bronze and rejects duplicates', () => {
    makeLeague()
    const p = joinLeagueRow('spring', 'amr', db)
    expect(p.tier).toBe('bronze')
    expect(p.elo).toBe(1000)
    expect(() => joinLeagueRow('spring', 'amr', db)).toThrow()
    expect(() => joinLeagueRow('missing', 'amr', db)).toThrow()
    expect(listLeaguePlayers('spring', db).map((x) => x.handle)).toEqual(['amr'])
  })

  it('awards review and focus points and keeps season totals', () => {
    makeLeague()
    joinLeagueRow('spring', 'amr', db)
    const row = awardLeaguePoints('spring', { kind: 'reviews', handle: 'amr', count: 40 }, db)!
    expect(row.points).toBe(40)
    expect(row.seasonPoints).toBe(0)
    awardLeaguePoints('spring', { kind: 'focus', handle: 'amr', minutes: 10 }, db)
    const core = loadLeague('spring', db)!
    expect(core.players[0]!.points).toBe(50)
    // strangers earn nothing
    expect(
      awardLeaguePoints('spring', { kind: 'reviews', handle: 'ghost', count: 5 }, db),
    ).toBeNull()
  })
})

describe('round close persistence', () => {
  it('promotes scorers, records the round, and resets round points', () => {
    makeLeague()
    joinLeagueRow('spring', 'amr', db)
    joinLeagueRow('spring', 'sara', db)
    awardLeaguePoints('spring', { kind: 'reviews', handle: 'amr', count: 100 }, db)
    awardLeaguePoints('spring', { kind: 'reviews', handle: 'sara', count: 10 }, db)

    const { round, promoted } = closeLeagueRound('spring', db)
    expect(round.round).toBe(0)
    expect(promoted).toContainEqual({ handle: 'amr', from: 'bronze', to: 'silver' })
    expect(round.winnersJson).toContainEqual({ tier: 'bronze', handle: 'amr' })

    const players = listLeaguePlayers('spring', db)
    const amr = players.find((p) => p.handle === 'amr')!
    const sara = players.find((p) => p.handle === 'sara')!
    expect(amr.tier).toBe('silver')
    expect(amr.points).toBe(0)
    expect(amr.seasonPoints).toBe(100)
    expect(amr.roundsWon).toBe(1)
    // 2 players in bronze, 3 promotion slots: both scorers advance
    expect(sara.tier).toBe('silver')
    expect(sara.seasonPoints).toBe(10)
    expect(getLeagueBySlug('spring', db)!.currentRound).toBe(1)
    expect(listLeagueRounds('spring', db)).toHaveLength(1)
  })

  it('zero-point players never promote, even alone at the top', () => {
    makeLeague()
    joinLeagueRow('spring', 'amr', db)
    const { promoted } = closeLeagueRound('spring', db)
    expect(promoted).toEqual([])
    expect(listLeaguePlayers('spring', db)[0]!.tier).toBe('bronze')
  })

  it('standings and champion read back from persisted state', () => {
    makeLeague()
    joinLeagueRow('spring', 'amr', db)
    joinLeagueRow('spring', 'sara', db)
    awardLeaguePoints('spring', { kind: 'reviews', handle: 'sara', count: 30 }, db)
    awardLeaguePoints('spring', { kind: 'reviews', handle: 'amr', count: 60 }, db)
    const standings = leagueStandings('spring', 'bronze', db)
    expect(standings[0]!.handle).toBe('amr')
    expect(leagueChampion('spring', db)).toBe('amr')
    expect(leagueChampion('missing', db)).toBeNull()
  })
})

describe('league duels', () => {
  it('creates, answers, decides a duel and moves Elo and points', () => {
    makeLeague()
    joinLeagueRow('spring', 'amr', db)
    joinLeagueRow('spring', 'sara', db)
    createLeagueDuel(
      { slug: 'd1', leagueSlug: 'spring', playerA: 'amr', playerB: 'sara', prompts: PROMPTS },
      db,
    )

    const half = submitDuelAnswers(
      'd1',
      'A',
      [
        { promptId: 'q1', answer: '4', elapsedMs: 900 },
        { promptId: 'q2', answer: 'Paris', elapsedMs: 1200 },
      ],
      db,
    )
    expect(half.decided).toBe(false)
    expect(getLeagueDuel('d1', db)!.status).toBe('open')
    expect(listLeagueDuels({ status: 'open' }, db).map((d) => d.slug)).toContain('d1')

    const done = submitDuelAnswers(
      'd1',
      'B',
      [
        { promptId: 'q1', answer: 'FOUR', elapsedMs: 2000 }, // alias + case-insensitive
        { promptId: 'q2', answer: 'Lyon', elapsedMs: 500 },
      ],
      db,
    )
    expect(done.decided).toBe(true)
    expect(done.winner).toBe('amr') // 2 correct beats 1

    const duel = getLeagueDuel('d1', db)!
    expect(duel.status).toBe('complete')
    expect(duel.winner).toBe('amr')

    const players = listLeaguePlayers('spring', db)
    const amr = players.find((p) => p.handle === 'amr')!
    const sara = players.find((p) => p.handle === 'sara')!
    expect(amr.duelsWon).toBe(1)
    expect(sara.duelsLost).toBe(1)
    expect(amr.elo).toBeGreaterThan(1000)
    expect(sara.elo).toBeLessThan(1000)
    expect(amr.points).toBe(25) // duelWin scoring
    expect(() => submitDuelAnswers('d1', 'A', [], db)).toThrow() // no double-decide
  })

  it('honest draw splits Elo delta and awards draw points', () => {
    makeLeague()
    joinLeagueRow('spring', 'amr', db)
    joinLeagueRow('spring', 'sara', db)
    createLeagueDuel(
      { slug: 'd2', leagueSlug: 'spring', playerA: 'amr', playerB: 'sara', prompts: PROMPTS },
      db,
    )
    const answers = [
      { promptId: 'q1', answer: '4', elapsedMs: 1000 },
      { promptId: 'q2', answer: 'Paris', elapsedMs: 1000 },
    ]
    submitDuelAnswers('d2', 'A', answers, db)
    const done = submitDuelAnswers('d2', 'B', answers, db)
    expect(done.winner).toBeNull()
    const players = listLeaguePlayers('spring', db)
    expect(players.find((p) => p.handle === 'amr')!.elo).toBe(1000)
    expect(players.find((p) => p.handle === 'sara')!.points).toBe(10) // duelDraw
  })

  it('rejects unknown prompts and same-player duels', () => {
    makeLeague()
    expect(() =>
      createLeagueDuel({ slug: 'd3', playerA: 'amr', playerB: 'amr', prompts: PROMPTS }, db),
    ).toThrow()
    createLeagueDuel({ slug: 'd4', playerA: 'amr', playerB: 'sara', prompts: PROMPTS }, db)
    expect(() =>
      submitDuelAnswers('d4', 'A', [{ promptId: 'nope', answer: 'x', elapsedMs: 1 }], db),
    ).toThrow()
    // duels outside any league still decide, without Elo side effects
    submitDuelAnswers(
      'd4',
      'A',
      [
        { promptId: 'q1', answer: '4', elapsedMs: 1 },
        { promptId: 'q2', answer: 'Paris', elapsedMs: 1 },
      ],
      db,
    )
    const done = submitDuelAnswers(
      'd4',
      'B',
      [
        { promptId: 'q1', answer: '4', elapsedMs: 1 },
        { promptId: 'q2', answer: 'wrong', elapsedMs: 1 },
      ],
      db,
    )
    expect(done.winner).toBe('amr')
  })
})

describe('league tournaments', () => {
  it('creates a bracket, propagates byes and crowns a champion', () => {
    makeLeague()
    const t = createLeagueTournament(
      { slug: 'cup', leagueSlug: 'spring', title: 'Spring Cup', seeds: ['amr', 'sara', 'mona'] },
      db,
    )
    expect(t.status).toBe('open')
    // 3 seeds -> bracket of 4, seed 1 gets the bye straight into the final
    const open = openTournamentMatches('cup', db)
    expect(open).toHaveLength(1)
    expect(open[0]).toMatchObject({ round: 1, position: 1, playerA: 'sara', playerB: 'mona' })

    recordTournamentMatchResult('cup', 1, 1, 'sara', undefined, db)
    const final = openTournamentMatches('cup', db)
    expect(final).toHaveLength(1)
    expect(final[0]).toMatchObject({ round: 2, position: 0, playerA: 'amr', playerB: 'sara' })

    const done = recordTournamentMatchResult('cup', 2, 0, 'amr', 'duel-99', db)
    expect(done.status).toBe('complete')
    expect(done.champion).toBe('amr')
    expect(getLeagueTournament('cup', db)!.completedAt).not.toBeNull()
    expect(listLeagueTournaments({ status: 'complete' }, db).map((x) => x.slug)).toContain('cup')
    expect(() => recordTournamentMatchResult('cup', 2, 0, 'amr', undefined, db)).toThrow()
  })

  it('rejects a winner who is not in the match', () => {
    createLeagueTournament({ slug: 'cup2', title: 'Cup', seeds: ['amr', 'sara'] }, db)
    expect(() => recordTournamentMatchResult('cup2', 1, 0, 'mona', undefined, db)).toThrow()
  })
})
