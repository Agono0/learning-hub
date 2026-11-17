/**
 * Cognitive Metacognition & TMR API endpoints, driven against an isolated,
 * EMPTY temp database (initDb creates every table itself).
 *
 * The metacognition GET derives its report from REAL revlog rows (the
 * per-review confidence signal persisted by executeReview), so this suite
 * seeds a small review history and asserts the derived monitoring metrics —
 * no hardcoded sample reports.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-metacognition-tmr-')), 'api.db')

type Handlers = {
  metacognitionGet: typeof import('@/server/handlers/cognitive/metacognition/route').GET
  metacognitionPost: typeof import('@/server/handlers/cognitive/metacognition/route').POST
  hypercorrectionGet: typeof import('@/server/handlers/cognitive/hypercorrection/route').GET
  hypercorrectionPost: typeof import('@/server/handlers/cognitive/hypercorrection/route').POST
  tmrGet: typeof import('@/server/handlers/cognitive/tmr/route').GET
  tmrPost: typeof import('@/server/handlers/cognitive/tmr/route').POST
}
let H: Handlers
let db: (typeof import('@learning-hub/db'))['db']
let revlog: (typeof import('@learning-hub/db'))['revlog']
let cards: (typeof import('@learning-hub/db'))['cards']
let decks: (typeof import('@learning-hub/db'))['decks']

beforeAll(async () => {
  H = {
    metacognitionGet: (await import('@/server/handlers/cognitive/metacognition/route')).GET,
    metacognitionPost: (await import('@/server/handlers/cognitive/metacognition/route')).POST,
    hypercorrectionGet: (await import('@/server/handlers/cognitive/hypercorrection/route')).GET,
    hypercorrectionPost: (await import('@/server/handlers/cognitive/hypercorrection/route')).POST,
    tmrGet: (await import('@/server/handlers/cognitive/tmr/route')).GET,
    tmrPost: (await import('@/server/handlers/cognitive/tmr/route')).POST,
  }
  ;({ db, revlog, cards, decks } = await import('@learning-hub/db'))
  // revlog.cardId → cards.id → decks.id: satisfy the FK chain once.
  db.insert(decks).values({ id: 1, name: 'Calibration Test Deck' }).onConflictDoNothing().run()
})

const post = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** Minimal valid revlog row (confidence defaults to 1 = confident). */
function revlogRow(overrides: {
  cardId: number
  rating: number
  confidence?: 0 | 1
  timeMs?: number
}) {
  return {
    cardId: overrides.cardId,
    rating: overrides.rating,
    state: 2,
    elapsedDays: 0,
    scheduledDays: 1,
    timeMs: overrides.timeMs ?? 1500,
    confidence: overrides.confidence ?? 1,
    reviewedAt: new Date().toISOString(),
  }
}

async function seedCard(id: number) {
  db.insert(cards)
    .values({
      id,
      deckId: 1,
      type: 'basic',
      content: { basic: { front: `Front ${id}`, back: `Back ${id}` } },
      tags: [],
      state: 2,
      due: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .run()
}

describe('/api/cognitive/metacognition', () => {
  it('GET returns an honest empty report before any reviews exist', async () => {
    const res = await H.metacognitionGet(
      new Request('http://localhost/api/cognitive/metacognition'),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.sampleSize).toBe(0)
    expect(data.profile.sampleSize).toBe(0)
    expect(data.profile.goodmanKruskalGamma).toBe(0)
    expect(data.crucibleDrillIds).toEqual([])
  })

  it('POST evaluates learner judgment trials and detects fluency illusion', async () => {
    const res = await H.metacognitionPost(
      new Request('http://localhost/api/cognitive/metacognition', {
        ...post({
          trials: [
            { confidence: 0.95, outcome: 0.0, latencyMs: 1200 },
            { confidence: 0.9, outcome: 0.0, latencyMs: 1400 },
            { confidence: 0.85, outcome: 0.0, latencyMs: 1500 },
          ],
        }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.report.bias).toBeGreaterThan(0.25)
    expect(data.report.status).toBe('fluency_illusion')
    expect(data.report.difficultyAdjustment).toBe('escalate_to_free_production')
  })

  it('GET derives monitoring metrics and the crucible drill list from revlog', async () => {
    // Seed: 6 confident-correct trials, then a confident miss on card 42 and a
    // hesitant (uncertain) miss on card 7.
    for (let i = 1; i <= 3; i++) await seedCard(i)
    await seedCard(42)
    await seedCard(7)
    const rows = [] as ReturnType<typeof revlogRow>[]
    for (let i = 1; i <= 3; i++) {
      rows.push(revlogRow({ cardId: i, rating: 3, timeMs: 1200 + i * 100 }))
      rows.push(revlogRow({ cardId: i, rating: 4, timeMs: 1100 + i * 100 }))
    }
    rows.push(revlogRow({ cardId: 42, rating: 1, confidence: 1, timeMs: 2000 }))
    rows.push(revlogRow({ cardId: 7, rating: 1, confidence: 0, timeMs: 4000 }))
    db.insert(revlog).values(rows).run()

    const res = await H.metacognitionGet(
      new Request('http://localhost/api/cognitive/metacognition'),
    )
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.sampleSize).toBe(8)
    expect(data.ok).toBe(true)
    // 6 of 8 correct → the canonical profile reflects the real log.
    expect(data.profile.overallAccuracy).toBeCloseTo(0.75, 2)
    expect(data.profile.sampleSize).toBe(8)
    // Confident miss on card 42 lands in the crucible drill list…
    expect(data.crucibleDrillIds).toContain(42)
    // …and the uncertain miss on card 7 does NOT (that is the honest part).
    expect(data.crucibleDrillIds).not.toContain(7)
    const preview = data.cruciblePreviews.find((p: { id: number }) => p.id === 42)
    expect(preview).toBeDefined()
  })
})

describe('/api/cognitive/hypercorrection', () => {
  it('GET reconstructs correction trials and queues uncorrected confident misses', async () => {
    // State so far (seeded by the metacognition suite): six confident correct
    // reviews, a confident miss on card 42, and an uncertain miss on card 7.
    // No retest has happened yet → corrections 0 (crucible dormant), but both
    // misses sit armed in the relearning queue.
    const dormant = await H.hypercorrectionGet(
      new Request('http://localhost/api/cognitive/hypercorrection'),
    )
    expect(dormant.status).toBe(200)
    const dormantData = await dormant.json()
    expect(dormantData.ok).toBe(true)
    expect(dormantData.sampleSize).toBe(0)
    expect(dormantData.report.status).toBe('no_evidence')
    const dormantIds = dormantData.queue.map((q: { cardId: number }) => q.cardId)
    expect(dormantIds).toContain(42)
    expect(dormantIds).toContain(7)

    // Now: card 42 gets a successful retest (corrected high-confidence error)
    // and card 99 commits a confident miss with NO retest (stays armed).
    await seedCard(99)
    db.insert(revlog)
      .values([
        revlogRow({ cardId: 99, rating: 1, confidence: 1, timeMs: 2200 }),
        revlogRow({ cardId: 42, rating: 3, confidence: 1, timeMs: 2400 }),
      ])
      .run()

    const res = await H.hypercorrectionGet(
      new Request('http://localhost/api/cognitive/hypercorrection'),
    )
    expect(res.status).toBe(200)
    const data = await res.json()

    // One correction event: card 42's confident miss → later success.
    expect(data.sampleSize).toBe(1)
    expect(data.report.overallCorrectionRate).toBe(1)
    expect(data.report.status).toBe('strongly_operating')
    // Card 99 armed + card 7 armed (uncertain) → 2 queue candidates; 42 left the queue.
    const queueIds = data.queue.map((q: { cardId: number }) => q.cardId)
    expect(queueIds).toContain(99)
    expect(queueIds).toContain(7)
    expect(queueIds).not.toContain(42)
    // The confident miss outranks the hesitant one.
    const q99 = data.queue.find((q: { cardId: number }) => q.cardId === 99)
    const q7 = data.queue.find((q: { cardId: number }) => q.cardId === 7)
    expect(q99.priority).toBeGreaterThan(q7.priority)
    expect(q99.rationale).toContain('Butterfield')
  })

  it('POST evaluates explicit correction trials with shocks and forecasts', async () => {
    const res = await H.hypercorrectionPost(
      new Request('http://localhost/api/cognitive/hypercorrection', {
        ...post({
          corrections: [
            { cardId: 1, initialConfidence: 0.95, wasCorrected: true },
            { cardId: 2, initialConfidence: 0.9, wasCorrected: true },
            { cardId: 3, initialConfidence: 0.2, wasCorrected: false },
          ],
          candidates: [
            { cardId: 1, errorConfidence: 0.95, stability: 1.5, difficulty: 7 },
            { cardId: 3, errorConfidence: 0.2, stability: 3, difficulty: 5 },
          ],
        }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    // High-confidence band corrected 100%, low band 0% → index 1.
    expect(data.report.hypercorrectionIndex).toBe(1)
    // One uncorrected confident miss (card 1? no — card 1 corrected; card 3 is
    // low-confidence) → only the extreme-band miss of card… none. Wait: both
    // high-confidence errors were corrected, so no uncorrected shocks.
    expect(data.uncorrectedShocks).toEqual([])
    expect(data.queue.length).toBe(2)
    // Confident error outranks the timid one.
    expect(data.queue[0].cardId).toBe(1)
    expect(data.forecastedCorrectionProbability).toBeGreaterThan(0.7)
  })
})

describe('/api/cognitive/tmr', () => {
  it('GET returns an honest empty plan before any cards exist', async () => {
    const res = await H.tmrGet(new Request('http://localhost/api/cognitive/tmr'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.sampleSize).toBe(0)
    expect(data.plan.cues).toEqual([])
    expect(data.plan.forecastedRetentionGain).toBe(0)
    // The hypnogram still exists (it models the window, not the data).
    expect(data.plan.swsWindows.length).toBeGreaterThanOrEqual(1)
    expect(data.plan.targetAcousticDba).toBe(35)
  })

  it('GET derives vulnerable candidates and tonight plan from real FSRS state', async () => {
    // Seed review-state cards with distinct stability: card 301 is the most
    // fragile (lowest stability, near-term due); 303 is consolidated.
    for (const [id, stability, difficulty] of [
      [301, 0.8, 8],
      [302, 3, 5],
      [303, 25, 3],
    ] as const) {
      db.insert(cards)
        .values({
          id,
          deckId: 1,
          type: 'basic',
          content: { basic: { front: `TMR ${id}`, back: `Back ${id}` } },
          tags: [],
          state: 2,
          due: new Date(Date.now() + 86400000).toISOString(),
          stability,
          difficulty,
        })
        .onConflictDoNothing()
        .run()
    }

    const res = await H.tmrGet(new Request('http://localhost/api/cognitive/tmr'))
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.sampleSize).toBe(3)
    const ids = data.candidates.map((c: { cardId: number }) => c.cardId)
    // Most fragile first in the candidate ranking.
    expect(ids[0]).toBe(301)
    expect(data.candidates[0].fragility).toBeGreaterThan(data.candidates[2].fragility)

    // Tonight plan schedules the fragile cards into SWS blocks.
    expect(data.plan.cues.length).toBeGreaterThan(0)
    expect(data.plan.forecastedRetentionGain).toBeGreaterThan(0)
    expect(data.plan.forecastedRetentionGain).toBeLessThanOrEqual(0.28)
    expect(data.tonight.hypnogram.totalOpportunityMinutes).toBe(480)
    for (const cue of data.plan.cues) {
      const block = data.tonight.swsBlocks.find(
        (b: { cycleIndex: number }) => b.cycleIndex === cue.cycleIndex,
      )
      expect(block).toBeDefined()
    }
  })

  it('POST builds a personalized plan from an explicit sleep profile', async () => {
    const res = await H.tmrPost(
      new Request('http://localhost/api/cognitive/tmr', {
        ...post({
          bedtime: '23:30',
          wakeTime: '06:30',
          chronotype: -0.5,
          sleepDebtHours: 3,
          maxAcousticDba: 32,
          cards: [
            { cardId: 401, stability: 0.5, difficulty: 8 },
            { cardId: 402, stability: 5, difficulty: 4 },
          ],
        }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.candidateCount).toBe(2)
    // Explicit cards derive tonal signatures when none are supplied.
    const cue401 = data.plan.cues.find((c: { cardId: number }) => c.cardId === 401)
    expect(cue401).toBeDefined()
    expect(cue401.baseFrequency).toBeGreaterThan(100)
    // Sleep debt shows up in the model's assumptions.
    expect(data.plan.assumptions.join(' ')).toContain('3h debt')
  })

  it('POST still supports the legacy duration-only plan shape', async () => {
    const res = await H.tmrPost(
      new Request('http://localhost/api/cognitive/tmr', {
        ...post({
          cards: [
            { cardId: 501, stability: 0.5, difficulty: 8 },
            { cardId: 502, stability: 5, difficulty: 4 },
          ],
        }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.plan.cues.length).toBeGreaterThanOrEqual(2)
  })

  it('POST prioritizes the most vulnerable explicit card in the deepest SWS block', async () => {
    const res = await H.tmrPost(
      new Request('http://localhost/api/cognitive/tmr', {
        ...post({
          bedtime: '23:00',
          wakeTime: '07:00',
          cards: [
            { cardId: 201, stability: 0.5, difficulty: 8 },
            { cardId: 202, stability: 5.0, difficulty: 2 },
          ],
        }),
      }),
    )
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    // Pass 1 schedules one cue per card, most fragile first.
    expect(data.plan.cues[0].cardId).toBe(201)
    expect(data.plan.cues[0].blockDeltaWeight).toBe(
      Math.max(...data.plan.swsBlocks.map((b: { deltaWeight: number }) => b.deltaWeight)),
    )
    // The consolidated card still gets its fair-share cue.
    expect(data.plan.cues.some((c: { cardId: number }) => c.cardId === 202)).toBe(true)
  })
})
