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
  leagueDivisionDetail,
  leagueDuels,
  leagueEloEvents,
  leaguePlayers,
  leagueRounds,
  leagues,
  leagueSeasons,
  leagueTournaments,
  setDb,
  submitDuelAnswers,
  type LearningHubDB,
} from '../src/index'

const PROMPTS = [{ id: 'q1', question: '2+2?', answers: ['4'] }]

let db: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-div-'))
  db = await initDb({ path: join(tmp, 'div.db') })
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

describe('league division detail', () => {
  it('focuses one division: standings, round history, movement, internal duels', () => {
    createLeagueRow({ slug: 'spring', title: 'Spring', seasonStart: '2026-03-01' }, db)
    for (const h of ['amr', 'sara', 'omar', 'lina']) joinLeagueRow('spring', h, db)
    // amr and sara promote out of bronze; omar and lina stay
    awardLeaguePoints('spring', { kind: 'reviews', handle: 'amr', count: 50 }, db)
    awardLeaguePoints('spring', { kind: 'reviews', handle: 'sara', count: 30 }, db)
    // an internal bronze duel before the round closes
    createLeagueDuel(
      { slug: 'd1', leagueSlug: 'spring', playerA: 'omar', playerB: 'lina', prompts: PROMPTS },
      db,
    )
    submitDuelAnswers('d1', 'A', [{ promptId: 'q1', answer: '4', elapsedMs: 900 }], db)
    submitDuelAnswers('d1', 'B', [{ promptId: 'q1', answer: '5', elapsedMs: 500 }], db)
    closeLeagueRound('spring', db)

    const bronze = leagueDivisionDetail('spring', 'bronze', db)!
    // omar's duel win scored duelWin points, so he promoted with the scorers;
    // only lina (0 points) stays in bronze
    expect(bronze.standings.map((p) => p.handle)).toEqual(['lina'])
    expect(bronze.standings[0]!.elo).toBe(1000) // practice mode: Elo frozen
    // the duel followed omar out of bronze: no all-bronze duels remain
    expect(bronze.duels).toEqual([])
    // bronze's round winner is amr (winners are recorded in the scoring tier)
    expect(bronze.roundHistory).toEqual([{ round: 0, winner: 'amr', closedAt: expect.any(String) }])
    // movement: all three scorers promoted OUT of bronze
    expect(
      bronze.movements
        .filter((m) => m.kind === 'promoted_out')
        .map((m) => m.handle)
        .sort(),
    ).toEqual(['amr', 'omar', 'sara'])

    const silver = leagueDivisionDetail('spring', 'silver', db)!
    expect(silver.standings.map((p) => p.handle).sort()).toEqual(['amr', 'omar', 'sara'])
    // practice mode: omar's Elo stays at the 1000 baseline
    expect(silver.standings.find((p) => p.handle === 'omar')!.elo).toBe(1000)
    expect(
      silver.movements
        .filter((m) => m.kind === 'promoted_in')
        .map((m) => m.handle)
        .sort(),
    ).toEqual(['amr', 'omar', 'sara'])
    // d1 is cross-division (omar silver, lina bronze): listed in neither
    expect(silver.duels).toEqual([])
  })

  it('returns null for a missing league and empty views for quiet divisions', () => {
    expect(leagueDivisionDetail('missing', 'bronze', db)).toBeNull()
    createLeagueRow({ slug: 'spring', title: 'Spring', seasonStart: '2026-03-01' }, db)
    const diamond = leagueDivisionDetail('spring', 'diamond', db)!
    expect(diamond.standings).toEqual([])
    expect(diamond.roundHistory).toEqual([])
    expect(diamond.movements).toEqual([])
    expect(diamond.duels).toEqual([])
  })
})
