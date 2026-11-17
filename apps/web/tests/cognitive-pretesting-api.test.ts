/**
 * /api/cognitive/pretesting endpoints, driven against an isolated temp DB:
 * GET builds pretest questions from REAL card content (young cards only) and
 * scores the Little & Bjork solid-pretest gate; POST evaluates explicit
 * protocol trials through the pure engine.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-pretesting-')), 'api.db')

type Handlers = {
  get: typeof import('@/server/handlers/cognitive/pretesting/route').GET
  post: typeof import('@/server/handlers/cognitive/pretesting/route').POST
}
let H: Handlers
let db: (typeof import('@learning-hub/db'))['db']
let cards: (typeof import('@learning-hub/db'))['cards']
let decks: (typeof import('@learning-hub/db'))['decks']

beforeAll(async () => {
  H = {
    get: (await import('@/server/handlers/cognitive/pretesting/route')).GET,
    post: (await import('@/server/handlers/cognitive/pretesting/route')).POST,
  }
  ;({ db, cards, decks } = await import('@learning-hub/db'))
  db.insert(decks).values({ id: 1, name: 'Pretest Deck' }).onConflictDoNothing().run()
})

const post = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

function seedCard(id: number, stability: number, difficulty: number, front: string, back: string) {
  db.insert(cards)
    .values({
      id,
      deckId: 1,
      type: 'basic',
      content: { basic: { front, back } },
      tags: [],
      state: 2,
      due: new Date().toISOString(),
      stability,
      difficulty,
    })
    .onConflictDoNothing()
    .run()
}

describe('/api/cognitive/pretesting', () => {
  it('GET returns an honest empty candidate list before any cards exist', async () => {
    const res = await H.get(new Request('http://localhost/api/cognitive/pretesting'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.sampleSize).toBe(0)
    expect(data.candidates).toEqual([])
    expect(data.protocol.citation).toContain('Kornell')
  })

  it('GET builds questions from real young cards and gates relatedness', async () => {
    seedCard(21, 0.5, 8, 'What is a quorum?', 'A majority quorum of replicated nodes')
    seedCard(22, 25, 3, 'Consolidated old card', 'Old answer')

    const res = await H.get(new Request('http://localhost/api/cognitive/pretesting'))
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.sampleSize).toBe(1)
    const q = data.candidates[0]
    expect(q.cardId).toBe(21)
    expect(q.front).toContain('quorum')
    expect(typeof q.solidPretest).toBe('boolean')
    // The consolidated card (stability 25) is excluded by design.
    expect(data.candidates.some((c: { cardId: number }) => c.cardId === 22)).toBe(false)
  })

  it('POST evaluates a compliant failed-pretest protocol at the capped multiplier', async () => {
    const res = await H.post(
      new Request('http://localhost/api/cognitive/pretesting', {
        ...post({
          cards: [
            {
              cardId: 31,
              prompt: 'What is memory consolidation?',
              target: 'Memory consolidation stabilizes fragile traces during sleep',
              relatedness: 0.8,
              attempts: [
                {
                  cardId: 31,
                  kind: 'direct_retrieval',
                  guess: 'something with sleep',
                  confidence: 0.6,
                  wasCorrect: false,
                  feedbackDelivered: true,
                },
              ],
              studyEpisodes: [{ cardId: 31, delayMsAfterAttempt: 15000, resolvesPretest: true }],
              criterionRecalls: 3,
              successfulRecalls: 3,
              criterionMet: true,
            },
          ],
        }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.cardCount).toBe(1)
    expect(data.report.protocolCompliance).toBe(1)
    expect(data.report.cards[0].predictedRetentionMultiplier).toBe(1.25)
    expect(data.report.relearningQueue).toEqual([])
  })

  it('POST surfaces confident wrong guesses as hypercorrection targets', async () => {
    const res = await H.post(
      new Request('http://localhost/api/cognitive/pretesting', {
        ...post({
          cards: [
            {
              cardId: 32,
              prompt: 'What is the role of the striatum?',
              target: 'The striatum links reward prediction to action selection',
              relatedness: 0.7,
              attempts: [
                {
                  cardId: 32,
                  kind: 'direct_retrieval',
                  guess: 'It consolidates memories during sleep',
                  confidence: 0.9,
                  wasCorrect: false,
                  feedbackDelivered: true,
                },
              ],
              studyEpisodes: [{ cardId: 32, delayMsAfterAttempt: 9000, resolvesPretest: true }],
              criterionRecalls: 3,
              successfulRecalls: 0,
              criterionMet: false,
            },
          ],
        }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.report.hypercorrectionTargets).toHaveLength(1)
    expect(data.report.hypercorrectionTargets[0].confidence).toBe(0.9)
    expect(data.report.relearningQueue).toContain(32)
    expect(data.report.guidance).toContain('Butterfield')
  })

  it('POST rejects malformed attempts via zod', async () => {
    const res = await H.post(
      new Request('http://localhost/api/cognitive/pretesting', {
        ...post({
          cards: [
            {
              cardId: 33,
              prompt: 'What?',
              target: 'Something',
              attempts: [{ confidence: 5 }],
            },
          ],
        }),
      }),
    )
    expect(res.status).toBe(400)
  })
})
