/**
 * /api/cognitive/difficulty-audit endpoints, driven against an isolated temp
 * database: the measured stream derives from seeded revlog rows, the
 * self-reported stream goes through zod, and the honesty boundary (technique
 * mix is not measurable from telemetry) is asserted explicitly.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-difficulty-audit-')), 'api.db')

type Handlers = {
  get: typeof import('@/server/handlers/cognitive/difficulty-audit/route').GET
  post: typeof import('@/server/handlers/cognitive/difficulty-audit/route').POST
}
let H: Handlers
let db: (typeof import('@learning-hub/db'))['db']
let cards: (typeof import('@learning-hub/db'))['cards']
let decks: (typeof import('@learning-hub/db'))['decks']
let revlog: (typeof import('@learning-hub/db'))['revlog']

beforeAll(async () => {
  H = {
    get: (await import('@/server/handlers/cognitive/difficulty-audit/route')).GET,
    post: (await import('@/server/handlers/cognitive/difficulty-audit/route')).POST,
  }
  ;({ db, cards, decks, revlog } = await import('@learning-hub/db'))
  db.insert(decks).values({ id: 1, name: 'Audit Deck A' }).onConflictDoNothing().run()
  db.insert(decks).values({ id: 2, name: 'Audit Deck B' }).onConflictDoNothing().run()
})

const post = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** Seed interleaved review rows across two decks over the past 7 days. */
function seedReviews() {
  for (const [id, deckId] of [
    [11, 1],
    [12, 2],
    [13, 1],
    [14, 2],
    [15, 1],
  ] as const) {
    db.insert(cards)
      .values({
        id,
        deckId,
        type: 'basic',
        content: { basic: { front: `F ${id}`, back: `B ${id}` } },
        tags: [],
        state: 2,
        due: new Date().toISOString(),
        stability: 2,
        difficulty: 6,
      })
      .onConflictDoNothing()
      .run()
  }
  const dayMs = 86_400_000
  const rows = [11, 12, 13, 14, 15].map((cardId, i) => ({
    cardId,
    rating: 3,
    state: 2,
    elapsedDays: 1,
    scheduledDays: 1,
    timeMs: 60_000,
    confidence: 1 as const,
    // Spread across 5 different days (interleaved decks, spaced sessions).
    reviewedAt: new Date(Date.now() - (6 - i) * dayMs).toISOString(),
  }))
  db.insert(revlog).values(rows).run()
}

describe('/api/cognitive/difficulty-audit', () => {
  it('GET reports an honest no-data state before any reviews exist', async () => {
    const res = await H.get(new Request('http://localhost/api/cognitive/difficulty-audit'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.measured.retrievalMinutes).toBe(0)
    expect(data.measured.retrievalMinutesByDay).toHaveLength(7)
    expect(data.spacing.verdict).toBe('no_data')
    expect(data.interleaving.verdict).toBe('no_data')
    // Honesty boundary: telemetry cannot see techniques.
    expect(data.techniqueMix.measurable).toBe(false)
    expect(data.techniqueMix.prompts.length).toBe(10)
  })

  it('GET derives spacing and interleaving audits from real revlog rows', async () => {
    seedReviews()
    const res = await H.get(new Request('http://localhost/api/cognitive/difficulty-audit'))
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.measured.totalReviews).toBe(5)
    expect(data.measured.retrievalMinutes).toBe(5) // 5 × 60 s
    expect(data.measured.distinctDecks).toBe(2)
    // Fully interleaved: A,B,A,B,A → every adjacent pair switches decks.
    expect(data.measured.consecutiveSameDeckReviews).toBe(0)
    // 5 reviews is enough: A,B,A,B,A switches every adjacent pair → rate 1.0.
    expect(data.interleaving.verdict).toBe('well_interleaved')
    // 5 active days of 7 → well spaced.
    expect(data.spacing.verdict).toBe('well_spaced')
    expect(data.measured.sessionCount).toBe(5)
  })

  it('POST scores a fluency-trap mix and emits the substitution plan', async () => {
    const res = await H.post(
      new Request('http://localhost/api/cognitive/difficulty-audit', {
        ...post({
          windowDays: 7,
          minutesByTechnique: { rereading: 180, highlighting: 90, practice_testing: 30 },
        }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.report.mix.status).toBe('fluency_trap')
    // (180×25 + 90×22 + 30×95) / 300 = 9330/300 = 31.1 dividend.
    expect(data.report.mix.difficultyDividend).toBeCloseTo(31.1, 1)
    expect(data.report.risk.label).toBe('high')
    expect(data.report.substitutions.length).toBe(2)
    expect(data.report.substitutions[0].toId).toBe('practice_testing')
    // Measured stream recomputed server-side (client telemetry is not trusted).
    expect(data.measured.totalReviews).toBe(5)
  })

  it('POST rejects invalid technique ids and negative minutes via zod', async () => {
    const res = await H.post(
      new Request('http://localhost/api/cognitive/difficulty-audit', {
        ...post({
          windowDays: 7,
          minutesByTechnique: { not_a_technique: 50, rereading: -5 },
        }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('POST accepts an empty self-report and still audits telemetry honestly', async () => {
    const res = await H.post(
      new Request('http://localhost/api/cognitive/difficulty-audit', {
        ...post({ windowDays: 7, minutesByTechnique: {} }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.report.mix.status).toBe('no_data')
    expect(data.report.spacing.verdict).toBe('well_spaced')
    expect(data.report.nextBestAction).toContain('Log one week')
  })
})
