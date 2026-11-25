import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createLeagueDuel,
  createLeagueRow,
  initDb,
  joinLeagueRow,
  leagueDuels,
  leagueEloEvents,
  leagueHeadToHead,
  leaguePlayers,
  leagueRounds,
  leagues,
  leagueSeasons,
  leagueTournaments,
  setDb,
  submitDuelAnswers,
  type LearningHubDB,
} from '../src/index'

const PROMPTS = [
  { id: 'q1', question: '2+2?', answers: ['4', 'four'] },
  { id: 'q2', question: 'Capital of France?', answers: ['Paris'] },
]

let db: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-h2h-'))
  db = await initDb({ path: join(tmp, 'h2h.db') })
  setDb(db)
})

beforeEach(() => {
  db.delete(leagueSeasons).run()
  db.delete(leagueEloEvents).run()
  db.delete(leagueTournaments).run()
  db.delete(leagueDuels).run()
  db.delete(leagueRounds).run()
  db.delete(leaguePlayers).run()
  db.delete(leagues).run()
})

function playDuel(
  slug: string,
  a: string,
  b: string,
  aAnswers: { promptId: string; answer: string; elapsedMs: number }[],
  bAnswers: { promptId: string; answer: string; elapsedMs: number }[],
): void {
  createLeagueDuel({ slug, leagueSlug: 'spring', playerA: a, playerB: b, prompts: PROMPTS }, db)
  submitDuelAnswers(slug, 'A', aAnswers, db)
  submitDuelAnswers(slug, 'B', bAnswers, db)
}

const RIGHT = [
  { promptId: 'q1', answer: '4', elapsedMs: 900 },
  { promptId: 'q2', answer: 'Paris', elapsedMs: 1100 },
]
const WRONG = [
  { promptId: 'q1', answer: '5', elapsedMs: 700 },
  { promptId: 'q2', answer: 'Lyon', elapsedMs: 800 },
]

describe('league head-to-head', () => {
  it('summarizes a rivalry across seatings, with Elo framing and recent duels', () => {
    createLeagueRow({ slug: 'spring', title: 'Spring', seasonStart: '2026-03-01' }, db)
    joinLeagueRow('spring', 'amr', db)
    joinLeagueRow('spring', 'sara', db)
    joinLeagueRow('spring', 'omar', db)

    // amr beats sara seated as A, then again seated as B (seating-independent)
    playDuel('d1', 'amr', 'sara', RIGHT, WRONG)
    playDuel('d2', 'sara', 'amr', WRONG, RIGHT)
    // a duel against someone else must not count
    playDuel('d3', 'amr', 'omar', RIGHT, WRONG)

    const h2h = leagueHeadToHead('spring', 'amr', 'sara', db)!
    expect(h2h.summary.duels).toBe(2)
    expect(h2h.summary.winsA).toBe(2)
    expect(h2h.summary.winsB).toBe(0)
    expect(h2h.summary.draws).toBe(0)
    expect(h2h.summary.winRateA).toBe(1)
    expect(h2h.summary.streakA).toBe(2)
    expect(h2h.summary.accuracyA).toBe(1)
    expect(h2h.summary.accuracyB).toBe(0)
    expect(h2h.leader).toEqual({ leader: 'amr', edge: 2, even: false })
    // winner gained Elo, loser dropped
    expect(h2h.elo.eloA).toBeGreaterThan(1000)
    expect(h2h.elo.eloB).toBeLessThan(1000)
    expect(h2h.elo.higher).toBe('A')
    expect(h2h.recentDuels.map((d) => d.duelId)).toEqual(['d2', 'd1'])

    // mirrored arguments mirror the record
    const flip = leagueHeadToHead('spring', 'sara', 'amr', db)!
    expect(flip.summary.winsA).toBe(0)
    expect(flip.summary.winsB).toBe(2)
    expect(flip.elo.higher).toBe('B')
  })

  it('returns null for a missing league or player', () => {
    createLeagueRow({ slug: 'spring', title: 'Spring', seasonStart: '2026-03-01' }, db)
    joinLeagueRow('spring', 'amr', db)
    expect(leagueHeadToHead('missing', 'amr', 'sara', db)).toBeNull()
    expect(leagueHeadToHead('spring', 'amr', 'ghost', db)).toBeNull()
  })

  it('reports an empty record when the pair never duelled', () => {
    createLeagueRow({ slug: 'spring', title: 'Spring', seasonStart: '2026-03-01' }, db)
    joinLeagueRow('spring', 'amr', db)
    joinLeagueRow('spring', 'sara', db)
    const h2h = leagueHeadToHead('spring', 'amr', 'sara', db)!
    expect(h2h.summary.duels).toBe(0)
    expect(h2h.leader.even).toBe(true)
    expect(h2h.elo.gap).toBe(0)
    expect(h2h.recentDuels).toEqual([])
  })
})
