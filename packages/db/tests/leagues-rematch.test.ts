import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createLeagueDuel,
  createLeagueRow,
  getLeagueDuel,
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
  rematchLeagueDuel,
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
  const tmp = mkdtempSync(join(tmpdir(), 'lh-rematch-'))
  db = await initDb({ path: join(tmp, 'rematch.db') })
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

function completedDuel(slug: string): void {
  createLeagueRow({ slug: 'spring', title: 'Spring', seasonStart: '2026-03-01' }, db)
  joinLeagueRow('spring', 'amr', db)
  joinLeagueRow('spring', 'sara', db)
  createLeagueDuel(
    { slug, leagueSlug: 'spring', playerA: 'amr', playerB: 'sara', prompts: PROMPTS },
    db,
  )
  submitDuelAnswers(
    slug,
    'A',
    [
      { promptId: 'q1', answer: '4', elapsedMs: 900 },
      { promptId: 'q2', answer: 'Paris', elapsedMs: 1100 },
    ],
    db,
  )
  submitDuelAnswers(
    slug,
    'B',
    [
      { promptId: 'q1', answer: '5', elapsedMs: 500 },
      { promptId: 'q2', answer: 'Lyon', elapsedMs: 800 },
    ],
    db,
  )
}

describe('duel rematch', () => {
  it('creates a fresh open duel: same league and prompts, swapped seating', () => {
    completedDuel('d1')
    const rematch = rematchLeagueDuel('d1', 'd2', db)
    expect(rematch.slug).toBe('d2')
    expect(rematch.status).toBe('open')
    expect(rematch.winner).toBeNull()
    expect(rematch.playerA).toBe('sara') // seating swapped
    expect(rematch.playerB).toBe('amr')
    expect(rematch.promptsJson).toEqual(PROMPTS)
    // same league as the source
    const source = getLeagueDuel('d1', db)!
    expect(rematch.leagueId).toBe(source.leagueId)
    // the rematch is playable like any duel
    const half = submitDuelAnswers('d2', 'A', [{ promptId: 'q1', answer: '4', elapsedMs: 400 }], db)
    expect(half.decided).toBe(false)
  })

  it('rejects an incomplete source, a missing source, and a taken slug', () => {
    completedDuel('d1')
    expect(() => rematchLeagueDuel('d1', 'd1', db)).toThrow(/already exists/)
    expect(() => rematchLeagueDuel('ghost', 'd2', db)).toThrow(/not found/)
    createLeagueDuel(
      { slug: 'open-1', leagueSlug: 'spring', playerA: 'amr', playerB: 'sara', prompts: PROMPTS },
      db,
    )
    expect(() => rematchLeagueDuel('open-1', 'd2', db)).toThrow(/not complete/)
  })
})
