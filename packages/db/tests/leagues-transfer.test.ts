import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createLeagueDuel,
  createLeagueRow,
  closeLeagueRound,
  exportLeague,
  importLeague,
  initDb,
  joinLeagueRow,
  leagueDuels,
  leagueEloEvents,
  leaguePlayers,
  leagueRounds,
  leagues,
  leagueSeasons,
  leagueTournaments,
  listLeagueDuels,
  listLeagueEloEvents,
  listLeaguePlayers,
  listLeagueRounds,
  loadLeague,
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
  const tmp = mkdtempSync(join(tmpdir(), 'lh-transfer-'))
  db = await initDb({ path: join(tmp, 'transfer.db') })
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

function buildLeague(): void {
  createLeagueRow({ slug: 'spring', title: 'Spring Season', seasonStart: '2026-03-01' }, db)
  joinLeagueRow('spring', 'amr', db)
  joinLeagueRow('spring', 'sara', db)
  createLeagueDuel(
    { slug: 'd1', leagueSlug: 'spring', playerA: 'amr', playerB: 'sara', prompts: PROMPTS },
    db,
  )
  submitDuelAnswers(
    'd1',
    'A',
    [
      { promptId: 'q1', answer: '4', elapsedMs: 900 },
      { promptId: 'q2', answer: 'Paris', elapsedMs: 1200 },
    ],
    db,
  )
  submitDuelAnswers(
    'd1',
    'B',
    [
      { promptId: 'q1', answer: '5', elapsedMs: 500 },
      { promptId: 'q2', answer: 'Lyon', elapsedMs: 800 },
    ],
    db,
  )
  closeLeagueRound('spring', db)
}

describe('league export/import', () => {
  it('exports a full league and re-imports an identical copy', () => {
    buildLeague()

    const transfer = exportLeague('spring', db)
    expect(transfer).not.toBeNull()
    expect(transfer!.schema).toBe('lh-leagues-transfer/v1')
    expect(transfer!.payload.players).toHaveLength(2)
    expect(transfer!.payload.duels).toHaveLength(1)
    expect(transfer!.payload.rounds).toHaveLength(1)
    expect(transfer!.payload.eloEvents.length).toBeGreaterThan(0)

    const snapshot = JSON.parse(JSON.stringify(transfer)) // JSON round-trip, as over the wire

    // wipe every league table (FK-safe order) and re-import from scratch
    db.delete(leagueSeasons).run()
    db.delete(leagueEloEvents).run()
    db.delete(leagueTournaments).run()
    db.delete(leagueDuels).run()
    db.delete(leagueRounds).run()
    db.delete(leaguePlayers).run()
    db.delete(leagues).run()
    expect(loadLeague('spring', db)).toBeNull()

    const row = importLeague(snapshot, db)
    expect(row.slug).toBe('spring')

    const league = loadLeague('spring', db)!
    expect(league.title).toBe('Spring Season')
    expect(league.currentRound).toBe(1)

    const players = listLeaguePlayers('spring', db)
    expect(players.map((p) => p.handle).sort()).toEqual(['amr', 'sara'])
    const amr = players.find((p) => p.handle === 'amr')!
    expect(amr.duelsWon).toBe(1)
    expect(amr.elo).toBeGreaterThan(1000)

    const rounds = listLeagueRounds('spring', db)
    expect(rounds).toHaveLength(1)
    expect(rounds[0]!.round).toBe(0)

    const duels = listLeagueDuels({ leagueSlug: 'spring' }, db)
    expect(duels).toHaveLength(1)
    expect(duels[0]!.slug).toBe('d1')
    expect(duels[0]!.status).toBe('complete')
    expect(duels[0]!.winner).toBe('amr')

    // Elo history survived and points at the re-imported duel (new numeric id)
    const events = listLeagueEloEvents('spring', 'amr', 50, db)
    expect(events.length).toBeGreaterThan(0)
    expect(events.every((e) => e.handle === 'amr')).toBe(true)
    expect(events.every((e) => e.duelId === duels[0]!.id)).toBe(true)
    const saraEvents = listLeagueEloEvents('spring', 'sara', 50, db)
    expect(saraEvents.length).toBeGreaterThan(0)
  })

  it('rejects importing a slug that already exists', () => {
    buildLeague()
    const transfer = exportLeague('spring', db)!
    expect(() => importLeague(transfer, db)).toThrow(/already exists/)
  })

  it('returns null when exporting a missing league', () => {
    expect(exportLeague('nope', db)).toBeNull()
  })
})
