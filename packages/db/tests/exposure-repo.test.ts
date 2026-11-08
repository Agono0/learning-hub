import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  cards,
  decks,
  exposureEvents,
  findCardFronts,
  getKnownTokensSet,
  getWordExposureSummaries,
  initDb,
  recordExposure,
  recordExposureBatch,
  setDb,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB
let deckId: number

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-exposure-'))
  db = await initDb({ path: join(tmp, 'exposure.db') })
  setDb(db)
  deckId = db.insert(decks).values({ name: 'Vocab' }).returning().all()[0]!.id
})

beforeEach(() => {
  db.delete(exposureEvents).run()
  db.delete(cards).run()
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

/** Inserts `n` encounters of `token`, one per day starting at `startDay`. */
function seed(token: string, perDay: number[], startDay = 1) {
  perDay.forEach((count, i) => {
    const day = String(startDay + i).padStart(2, '0')
    for (let k = 0; k < count; k++) {
      db.insert(exposureEvents)
        .values({
          token,
          normalized: token.toLowerCase(),
          sourceType: 'reading',
          createdAt: `2026-03-${day}T10:0${k % 10}:00.000Z`,
        })
        .run()
    }
  })
}

function addCard(front: string, state = 0) {
  db.insert(cards)
    .values({
      deckId,
      type: 'basic',
      content: { basic: { front, back: 'x' } },
      due: new Date().toISOString(),
      state,
    })
    .run()
}

describe('exposure repo', () => {
  it('normalizes tokens on record and rejects blanks', () => {
    const row = recordExposure({ token: '  Synapse,  ', contextSnippet: 'ctx' })
    expect(row.normalized).toBe('synapse')
    expect(row.token).toBe('Synapse,')
    expect(row.sourceType).toBe('reading')
    expect(() => recordExposure({ token: '  ...  ' })).toThrow(/empty/)
  })

  it('batch-inserts, skipping blank tokens, and returns 0 for nothing', () => {
    expect(recordExposureBatch(['Axon', '  ', '--', 'dendrite'], { sourceType: 'note' })).toBe(2)
    expect(recordExposureBatch([])).toBe(0)
    expect(recordExposureBatch(['   '])).toBe(0)
    const rows = db.select().from(exposureEvents).all()
    expect(rows.map((r) => r.normalized).sort()).toEqual(['axon', 'dendrite'])
    expect(rows.every((r) => r.sourceType === 'note')).toBe(true)
  })

  it('rolls up counts and distinct days, applying the 5×/3-day promotion rule', () => {
    seed('myelin', [2, 2, 1]) // 5 encounters over 3 days → eligible
    seed('glia', [5]) // 5 encounters in 1 day → massed, not eligible
    seed('soma', [1, 1, 1]) // 3 days but only 3 encounters
    const words = getWordExposureSummaries(10)
    const by = Object.fromEntries(words.map((w) => [w.normalized, w]))
    expect(by.myelin).toMatchObject({
      encounterCount: 5,
      distinctDays: 3,
      eligibleForPromotion: true,
    })
    expect(by.glia).toMatchObject({
      encounterCount: 5,
      distinctDays: 1,
      eligibleForPromotion: false,
    })
    expect(by.soma).toMatchObject({
      encounterCount: 3,
      distinctDays: 3,
      eligibleForPromotion: false,
    })
    expect(by.myelin!.firstSeen < by.myelin!.lastSeen).toBe(true)
    // ordered by encounter count desc
    expect(words.at(-1)!.normalized).toBe('soma')
    expect(getWordExposureSummaries(1)).toHaveLength(1)
  })

  it('flags words that already exist as a basic card front (case-insensitive)', () => {
    seed('myelin', [1])
    seed('glia', [1])
    addCard('  Myelin ')
    const by = Object.fromEntries(getWordExposureSummaries().map((w) => [w.normalized, w]))
    expect(by.myelin!.isAlreadyCard).toBe(true)
    expect(by.glia!.isAlreadyCard).toBe(false)
    expect(findCardFronts(['myelin', 'nope'])).toEqual(new Set(['myelin']))
    expect(findCardFronts([]).size).toBe(0)
  })

  it('treats frequent words and graduated single-word cards as known', () => {
    seed('frequent', [5])
    seed('rare', [2])
    addCard('Graduated', 2)
    addCard('Fresh', 0)
    addCard('a whole sentence', 2)
    const known = getKnownTokensSet()
    expect(known.has('frequent')).toBe(true)
    expect(known.has('rare')).toBe(false)
    expect(known.has('graduated')).toBe(true)
    expect(known.has('fresh')).toBe(false)
    expect(known.has('a whole sentence')).toBe(false)
    expect(getKnownTokensSet(undefined, 2).has('rare')).toBe(true)
  })
})
