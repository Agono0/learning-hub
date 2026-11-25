import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  closeLeagueRound,
  createLeagueRow,
  initDb,
  joinLeagueRow,
  leagueAchievements,
  leagueDuels,
  leagueEloEvents,
  leaguePlayers,
  leagueRounds,
  leagueRoundPreview,
  leagueSeasons,
  leagueTournaments,
  leagues,
  setDb,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-sched-'))
  db = await initDb({ path: join(tmp, 'sched.db') })
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

describe('leagueRoundPreview', () => {
  it('returns null for an unknown league', () => {
    expect(leagueRoundPreview('nope', {}, db)).toBeNull()
  })

  it('derives round windows from the season calendar', () => {
    createLeagueRow(
      { slug: 'spring', title: 'Spring', seasonStart: '2026-03-01', roundLengthDays: 7 },
      db,
    )
    joinLeagueRow('spring', 'amr', db)
    const p = leagueRoundPreview('spring', {}, db)!
    expect(p.currentRound).toBe(0)
    expect(p.current).toEqual({
      round: 0,
      startsAt: '2026-03-01T00:00:00.000Z',
      endsAt: '2026-03-08T00:00:00.000Z',
    })
    // season started long ago -> the round is due to close
    expect(p.dueNow).toBe(true)
    expect(p.msUntilRoundEnd).toBeLessThan(0)
    expect(p.roundsRemaining).toBe(10)
    expect(p.seasonComplete).toBe(false)
    expect(p.seasonEndsAt).toBe('2026-05-10T00:00:00.000Z')
    expect(p.upcoming).toHaveLength(3)
    expect(p.upcoming[0].round).toBe(1)
    expect(p.upcoming[0].startsAt).toBe('2026-03-08T00:00:00.000Z')
  })

  it('reports a not-due round for a future season', () => {
    createLeagueRow({ slug: 'future', title: 'Future', seasonStart: '2999-01-01' }, db)
    const p = leagueRoundPreview('future', {}, db)!
    expect(p.dueNow).toBe(false)
    expect(p.msUntilRoundEnd).toBeGreaterThan(0)
  })

  it('advances after a round closes and caps the preview at the season end', () => {
    createLeagueRow(
      {
        slug: 'spring',
        title: 'Spring',
        seasonStart: '2026-03-01',
        roundLengthDays: 7,
        seasonLengthRounds: 2,
      },
      db,
    )
    joinLeagueRow('spring', 'amr', db)
    closeLeagueRound('spring', db)
    const p = leagueRoundPreview('spring', { upcoming: 5 }, db)!
    expect(p.currentRound).toBe(1)
    expect(p.roundsRemaining).toBe(1)
    expect(p.upcoming).toHaveLength(1) // capped at rounds remaining
    expect(p.upcoming[0].round).toBe(1 + 1)

    // closing the last round auto-closes the season and starts a fresh one
    closeLeagueRound('spring', db)
    const done = leagueRoundPreview('spring', {}, db)!
    expect(done.currentRound).toBe(0)
    expect(done.seasonComplete).toBe(false)
    expect(done.roundsRemaining).toBe(2)
    expect(done.upcoming.length).toBeGreaterThan(0)
  })
})
