/**
 * Practice-scope integrity tests (PR #130 follow-up).
 *
 * Leagues ship as local & friendly PRACTICE play: no ranked effects (Elo
 * frozen, no Elo events), open duels redact correct and submitted answers on
 * every read/export surface, and local activity scoring derives points from
 * real revlog/focus events through one forward-only cursor per league — never
 * retroactive, never double-credited, and explicitly not per-person verified.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createLeagueDuel,
  createLeagueRow,
  createLeagueTournament,
  exportLeague,
  focusSessions,
  getLeagueDuel,
  initDb,
  joinLeagueRow,
  leagueAchievements,
  leagueActivityCursors,
  leagueDuels,
  leagueEloEvents,
  leaguePlayers,
  leagueRounds,
  leagueSeasons,
  leagueTournaments,
  leagues,
  recordTournamentMatchResult,
  redactLeagueDuelRow,
  revlog,
  setDb,
  submitDuelAnswers,
  syncLeaguePoints,
  type LearningHubDB,
} from '../src/index'

const PROMPTS = [
  { id: 'q1', question: '2+2?', answers: ['4', 'four'] },
  { id: 'q2', question: 'Capital of France?', answers: ['Paris'] },
]

let db: LearningHubDB
let revlogId: number

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-integrity-'))
  db = await initDb({ path: join(tmp, 'integrity.db') })
  setDb(db)
})

beforeEach(() => {
  // FK-safe delete order (children before parents).
  db.delete(leagueAchievements).run()
  db.delete(leagueSeasons).run()
  db.delete(leagueEloEvents).run()
  db.delete(leagueTournaments).run()
  db.delete(leagueDuels).run()
  db.delete(leagueRounds).run()
  db.delete(leagueActivityCursors).run()
  db.delete(leaguePlayers).run()
  db.delete(leagues).run()
  db.delete(revlog).run()
  db.delete(focusSessions).run()
  revlogId = Date.now()
})

function freshLeague(): void {
  createLeagueRow({ slug: 'spring', title: 'Spring League', seasonStart: '2026-03-01' }, db)
  joinLeagueRow('spring', 'amr', db)
  joinLeagueRow('spring', 'sara', db)
}

function addReviews(n: number): void {
  for (let i = 0; i < n; i += 1) {
    revlogId += 1
    db.insert(revlog)
      .values({
        id: revlogId,
        cardId: 1,
        rating: 3,
        state: 0,
        elapsedDays: 0,
        scheduledDays: 1,
        timeMs: 4000,
        reviewedAt: new Date(revlogId).toISOString(),
      })
      .run()
  }
}

function addFocusSession(actualMinutes: number, completed: boolean): void {
  db.insert(focusSessions)
    .values({
      startedAt: new Date().toISOString(),
      plannedMinutes: 25,
      actualMinutes,
      completed,
    })
    .run()
}

describe('answer redaction on read/export surfaces', () => {
  it('an open duel exposes questions only — no correct or submitted answers', () => {
    freshLeague()
    createLeagueDuel(
      { slug: 'd1', leagueSlug: 'spring', playerA: 'amr', playerB: 'sara', prompts: PROMPTS },
      db,
    )
    submitDuelAnswers(
      'd1',
      'A',
      [
        { promptId: 'q1', answer: '4', elapsedMs: 900 },
        { promptId: 'q2', answer: 'Paris', elapsedMs: 1100 },
      ],
      db,
    )

    const raw = getLeagueDuel('d1', db)!
    expect(raw.promptsJson[0]!.answers).toContain('4')
    expect(raw.answersAJson).toHaveLength(2)

    const safe = redactLeagueDuelRow(raw)
    expect(safe.promptsJson.every((p) => p.answers.length === 0)).toBe(true)
    expect(safe.promptsJson.map((p) => p.question)).toEqual(['2+2?', 'Capital of France?'])
    // the opponent's submitted answers are hidden too (early disclosure)
    expect(safe.answersAJson).toEqual([])
    expect(safe.answersBJson).toEqual([])
    // the stored row is untouched
    expect(getLeagueDuel('d1', db)!.answersAJson).toHaveLength(2)
  })

  it('a completed duel is returned in full for review', () => {
    freshLeague()
    createLeagueDuel(
      { slug: 'd1', leagueSlug: 'spring', playerA: 'amr', playerB: 'sara', prompts: PROMPTS },
      db,
    )
    const a = [
      { promptId: 'q1', answer: '4', elapsedMs: 900 },
      { promptId: 'q2', answer: 'Paris', elapsedMs: 1100 },
    ]
    submitDuelAnswers('d1', 'A', a, db)
    submitDuelAnswers('d1', 'B', a, db)

    const safe = redactLeagueDuelRow(getLeagueDuel('d1', db)!)
    expect(safe.promptsJson[0]!.answers).toContain('4')
    expect(safe.answersAJson).toHaveLength(2)
  })

  it('transfer export excludes open duels entirely', () => {
    freshLeague()
    createLeagueDuel(
      { slug: 'd1', leagueSlug: 'spring', playerA: 'amr', playerB: 'sara', prompts: PROMPTS },
      db,
    )
    submitDuelAnswers('d1', 'A', [{ promptId: 'q1', answer: '4', elapsedMs: 900 }], db)
    const a = [
      { promptId: 'q1', answer: '4', elapsedMs: 900 },
      { promptId: 'q2', answer: 'Paris', elapsedMs: 1100 },
    ]
    createLeagueDuel(
      { slug: 'd2', leagueSlug: 'spring', playerA: 'amr', playerB: 'sara', prompts: PROMPTS },
      db,
    )
    submitDuelAnswers('d2', 'A', a, db)
    submitDuelAnswers('d2', 'B', a, db)

    const envelope = exportLeague('spring', db)!
    // the open duel (answers in flight) never leaves the device
    expect(envelope.payload.duels.find((d) => d.duel.id === 'd1')).toBeUndefined()
    // completed duels travel in full for review
    const done = envelope.payload.duels.find((d) => d.duel.id === 'd2')!
    expect(done.status).toBe('complete')
    expect(done.duel.prompts[0]!.answers).toContain('4')
  })
})

describe('practice mode has no ranked effects', () => {
  it('pass-and-play decides the duel but freezes Elo and records no events', () => {
    freshLeague()
    createLeagueDuel(
      { slug: 'd1', leagueSlug: 'spring', playerA: 'amr', playerB: 'sara', prompts: PROMPTS },
      db,
    )
    // both sides answered on the same device — explicitly practice
    submitDuelAnswers(
      'd1',
      'A',
      [
        { promptId: 'q1', answer: '4', elapsedMs: 900 },
        { promptId: 'q2', answer: 'Paris', elapsedMs: 1100 },
      ],
      db,
    )
    const done = submitDuelAnswers(
      'd1',
      'B',
      [
        { promptId: 'q1', answer: '4', elapsedMs: 800 },
        { promptId: 'q2', answer: 'Lyon', elapsedMs: 700 },
      ],
      db,
    )
    expect(done.decided).toBe(true)
    expect(done.winner).toBe('amr')

    const players = db.select().from(leaguePlayers).all()
    expect(players.find((p) => p.handle === 'amr')!.elo).toBe(1000)
    expect(players.find((p) => p.handle === 'sara')!.elo).toBe(1000)
    expect(db.select().from(leagueEloEvents).all()).toHaveLength(0)
  })
})

describe('local activity scoring (derived, forward-only)', () => {
  it('the first sync only establishes the cursor — nothing retroactive', () => {
    freshLeague()
    addReviews(5) // activity from before the first sync
    const res = syncLeaguePoints('spring', 'amr', db)
    expect(res.established).toBe(true)
    expect(res.reviews).toBe(0)
    expect(res.points).toBe(0)
  })

  it('the second sync credits exactly the new events, completed focus only', () => {
    freshLeague()
    syncLeaguePoints('spring', 'amr', db)
    addReviews(3)
    addFocusSession(20, true)
    addFocusSession(15, false) // incomplete focus never counts
    const res = syncLeaguePoints('spring', 'amr', db)
    expect(res.established).toBe(false)
    expect(res.reviews).toBe(3)
    expect(res.focusMinutes).toBe(20)
    expect(res.points).toBe(3 + 20)
  })

  it('re-sync is idempotent and a second handle cannot re-credit the same events', () => {
    freshLeague()
    syncLeaguePoints('spring', 'amr', db)
    addReviews(4)
    expect(syncLeaguePoints('spring', 'amr', db).points).toBe(4)
    // nothing new since the cursor advanced
    expect(syncLeaguePoints('spring', 'amr', db).reviews).toBe(0)
    // sara cannot be credited for activity already counted on this device
    const sara = syncLeaguePoints('spring', 'sara', db)
    expect(sara.reviews).toBe(0)
    expect(sara.points).toBe(0)
  })

  it('rejects unknown leagues and handles', () => {
    freshLeague()
    expect(() => syncLeaguePoints('missing', 'amr', db)).toThrow()
    expect(() => syncLeaguePoints('spring', 'ghost', db)).toThrow()
  })
})

describe('result integrity guards', () => {
  it('a decided bracket match cannot be re-decided', () => {
    freshLeague()
    createLeagueTournament(
      {
        slug: 'cup',
        leagueSlug: 'spring',
        title: 'Spring Cup',
        seeds: ['amr', 'sara'],
      },
      db,
    )
    recordTournamentMatchResult('cup', 1, 0, 'amr', undefined, db)
    // two seeds = one deciding match, so the tournament is complete too
    expect(() => recordTournamentMatchResult('cup', 1, 0, 'sara', undefined, db)).toThrow(
      /already decided|already complete/,
    )
  })

  it('a completed duel rejects further answers', () => {
    freshLeague()
    createLeagueDuel(
      { slug: 'd1', leagueSlug: 'spring', playerA: 'amr', playerB: 'sara', prompts: PROMPTS },
      db,
    )
    const a = [
      { promptId: 'q1', answer: '4', elapsedMs: 900 },
      { promptId: 'q2', answer: 'Paris', elapsedMs: 1100 },
    ]
    submitDuelAnswers('d1', 'A', a, db)
    submitDuelAnswers('d1', 'B', a, db)
    expect(() => submitDuelAnswers('d1', 'A', a, db)).toThrow(/already complete/)
  })
})
