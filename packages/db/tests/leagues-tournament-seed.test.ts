import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  awardLeaguePoints,
  closeLeagueRound,
  createLeagueRow,
  getLeagueTournament,
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
  seedLeagueTournamentFromStandings,
  setDb,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-tseed-'))
  db = await initDb({ path: join(tmp, 'tseed.db') })
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

function leagueWithPoints(): void {
  createLeagueRow({ slug: 'spring', title: 'Spring', seasonStart: '2026-03-01' }, db)
  for (const h of ['amr', 'sara', 'khaled', 'omar']) joinLeagueRow('spring', h, db)
  awardLeaguePoints('spring', { kind: 'reviews', handle: 'amr', count: 10 }, db)
  awardLeaguePoints('spring', { kind: 'reviews', handle: 'sara', count: 5 }, db)
  awardLeaguePoints('spring', { kind: 'reviews', handle: 'khaled', count: 2 }, db)
}

describe('seedLeagueTournamentFromStandings', () => {
  it('rejects an unknown league', () => {
    expect(() =>
      seedLeagueTournamentFromStandings({ slug: 'cup', leagueSlug: 'nope', title: 'Cup' }, db),
    ).toThrow(/league not found/)
  })

  it('seeds strongest-first so the bracket pairs best vs worst', () => {
    leagueWithPoints()
    const t = seedLeagueTournamentFromStandings(
      { slug: 'cup', leagueSlug: 'spring', title: 'Spring Cup' },
      db,
    )
    expect(t.seedsJson).toEqual(['amr', 'sara', 'khaled', 'omar'])
    // opening round pairs seed 1 vs seed 4 and seed 2 vs seed 3
    const firstRound = t.matchesJson.filter((m) => m.round === 1)
    const pairings = firstRound.map((m) => [m.playerA, m.playerB].sort())
    expect(pairings).toEqual([
      ['amr', 'omar'],
      ['khaled', 'sara'],
    ])
    expect(getLeagueTournament('cup', db)?.leagueId).not.toBeNull()
  })

  it('caps the field with size', () => {
    leagueWithPoints()
    const t = seedLeagueTournamentFromStandings(
      { slug: 'cup', leagueSlug: 'spring', title: 'Top Two', size: 2 },
      db,
    )
    expect(t.seedsJson).toEqual(['amr', 'sara'])
  })

  it('ranks a promoted player above the whole lower division', () => {
    leagueWithPoints()
    closeLeagueRound('spring', db) // amr (top scorer) promotes out of bronze
    const t = seedLeagueTournamentFromStandings(
      { slug: 'cup', leagueSlug: 'spring', title: 'Cup' },
      db,
    )
    expect(t.seedsJson[0]).toBe('amr')
    expect(t.seedsJson).toHaveLength(4)
  })

  it('refuses a league with fewer than 2 players', () => {
    createLeagueRow({ slug: 'tiny', title: 'Tiny', seasonStart: '2026-03-01' }, db)
    joinLeagueRow('tiny', 'solo', db)
    expect(() =>
      seedLeagueTournamentFromStandings({ slug: 'cup', leagueSlug: 'tiny', title: 'Cup' }, db),
    ).toThrow(/at least 2 players/)
  })
})
