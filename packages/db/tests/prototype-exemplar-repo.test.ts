/**
 * Prototype & Exemplar repository tests — append-only session ledger,
 * day-bucketed stats, and the zod boundary, against a real temp database.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  BIRD_TYPICALITY_SET,
  evaluateCategorizationSession,
  type CategorizationSubmission,
} from '@learning-hub/core'
import {
  countSessions,
  getLastSession,
  initDb,
  listSessions,
  prototypeExemplarSessions,
  saveSession,
  setDb,
  statsByDay,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB

/** A small normative-consistent bird submission (mirrors the engine tests). */
const BIRD_SUBMISSION: CategorizationSubmission = {
  setId: BIRD_TYPICALITY_SET.id,
  typicalityRatings: {
    'bird-robin-old': 1,
    'bird-eagle': 2,
    'bird-chicken-old': 4,
    'bird-penguin-old': 5,
  },
  classifications: {
    'bird-robin-old': 'A',
    'bird-chicken-old': 'A',
    'bird-penguin-old': 'A',
    'bird-bat-old': 'B',
    'bird-eagle': 'A',
    'bird-dove': 'A',
    'bird-kiwi': 'A',
    'bird-butterfly': 'B',
    'bird-moth': 'B',
  },
}

/** Evaluate through the engine so the stored metrics are the real telemetry. */
function birdEvaluation() {
  return evaluateCategorizationSession(BIRD_TYPICALITY_SET, BIRD_SUBMISSION)
}

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-prototype-exemplar-'))
  db = await initDb({ path: join(tmp, 'proto-exemplar.db') })
  setDb(db)
})

beforeEach(() => {
  db.delete(prototypeExemplarSessions).run()
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('append-only session ledger', () => {
  it('starts empty and honestly reports "no sessions yet"', () => {
    expect(getLastSession(db)).toBeNull()
    expect(listSessions({ database: db })).toEqual([])
    expect(countSessions(db)).toBe(0)
  })

  it('appends one row per save and round-trips the typed payloads', () => {
    const stored = saveSession(
      {
        setId: BIRD_TYPICALITY_SET.id,
        submission: BIRD_SUBMISSION,
        evaluation: birdEvaluation(),
        createdAt: '2026-01-15T09:00:00.000Z',
      },
      db,
    )
    expect(stored.setId).toBe(BIRD_TYPICALITY_SET.id)
    expect(stored.phase).toBe('complete')
    expect(stored.trials).toEqual(BIRD_SUBMISSION)
    expect(stored.metrics.cri).toBeGreaterThan(0)
    expect(stored.accuracy).toBe(stored.metrics.overallAccuracy)
    expect(stored.createdAt).toBe('2026-01-15T09:00:00.000Z')

    const listed = listSessions({ database: db })
    expect(listed).toHaveLength(1)
    expect(listed[0]!.metrics.mcd).toBe(stored.metrics.mcd)
  })

  it('lists newest first and respects the limit', () => {
    for (const createdAt of [
      '2026-01-13T08:00:00.000Z',
      '2026-01-14T08:00:00.000Z',
      '2026-01-15T08:00:00.000Z',
    ]) {
      saveSession(
        {
          setId: BIRD_TYPICALITY_SET.id,
          submission: BIRD_SUBMISSION,
          evaluation: birdEvaluation(),
          createdAt,
        },
        db,
      )
    }
    const all = listSessions({ database: db })
    expect(all.map((s) => s.createdAt)).toEqual([
      '2026-01-15T08:00:00.000Z',
      '2026-01-14T08:00:00.000Z',
      '2026-01-13T08:00:00.000Z',
    ])
    expect(listSessions({ limit: 2, database: db })).toHaveLength(2)
    expect(getLastSession(db)!.createdAt).toBe('2026-01-15T08:00:00.000Z')
  })

  it('rejects invalid payloads at the zod boundary (append-only, nothing partial)', () => {
    const bad = {
      setId: BIRD_TYPICALITY_SET.id,
      submission: { ...BIRD_SUBMISSION, typicalityRatings: { 'bird-robin-old': 99 } },
      evaluation: birdEvaluation(),
    }
    expect(() =>
      saveSession(bad, db),
    ).toThrow()
    expect(countSessions(db)).toBe(0)
  })
})

describe('day-bucketed stats (dayKey convention, UTC)', () => {
  it('zero-fills days without sessions and aggregates accuracy per UTC day', () => {
    saveSession(
      {
        setId: BIRD_TYPICALITY_SET.id,
        submission: BIRD_SUBMISSION,
        evaluation: birdEvaluation(),
        createdAt: '2026-01-14T10:00:00.000Z',
      },
      db,
    )
    saveSession(
      {
        setId: BIRD_TYPICALITY_SET.id,
        submission: BIRD_SUBMISSION,
        evaluation: birdEvaluation(),
        createdAt: '2026-01-14T18:00:00.000Z',
      },
      db,
    )
    saveSession(
      {
        setId: BIRD_TYPICALITY_SET.id,
        submission: BIRD_SUBMISSION,
        evaluation: birdEvaluation(),
        createdAt: '2026-01-16T09:00:00.000Z',
      },
      db,
    )
    const stats = statsByDay({ now: new Date('2026-01-16T12:00:00.000Z'), days: 4, database: db })
    expect(stats).toHaveLength(4)
    expect(stats.map((s) => s.day)).toEqual([
      '2026-01-13',
      '2026-01-14',
      '2026-01-15',
      '2026-01-16',
    ])
    expect(stats[0]!.sessions).toBe(0)
    expect(stats[0]!.meanAccuracy).toBeNull()
    expect(stats[1]!.sessions).toBe(2)
    expect(stats[1]!.meanAccuracy).not.toBeNull()
    expect(stats[3]!.sessions).toBe(1)
  })
})
