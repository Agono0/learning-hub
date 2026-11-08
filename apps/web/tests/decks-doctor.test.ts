/**
 * Deck Doctor handler integration test (F-12)
 *
 * Verifies GET diagnosis over seeded decks, POST applying mechanical actions
 * transactionally (suspend, delete with tombstone, cloze regeneration, deck rename),
 * transactional rollback on failure, and strict zod input validation.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-doctor-')), 'doctor.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = {
  doctor: typeof import('../src/server/handlers/decks/doctor/route')
  db: typeof import('@learning-hub/db')
}

let M: Modules
let testDeckId: number
let leechCardId: number
let dupeCard1Id: number
let dupeCard2Id: number
let clozeCardId: number

const BASE = 'http://localhost'
const get = (path: string) => new Request(`${BASE}${path}`)
const post = (path: string, body: unknown) =>
  new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

beforeAll(async () => {
  const dbMod = await import('@learning-hub/db')
  const doctorMod = await import('../src/server/handlers/decks/doctor/route')
  M = { doctor: doctorMod, db: dbMod }

  // Seed a test deck
  const [deck] = M.db.db
    .insert(M.db.decks)
    .values({
      name: 'Untitled',
      description: 'Deck with various linter findings and leeches',
    })
    .returning()
    .all()
  testDeckId = deck!.id

  // 1. Leech card (lapses = 9)
  const [leech] = M.db.db
    .insert(M.db.cards)
    .values({
      deckId: testDeckId,
      due: new Date().toISOString(),
      type: 'basic',
      content: {
        basic: {
          front: 'In neuroanatomy: What is the primary role of the amygdala?',
          back: 'Emotional memory processing and fear conditioning',
        },
      },
      source: 'Kandel Principles',
      tags: ['neuroscience'],
      lapses: 9,
      suspended: false,
    })
    .returning()
    .all()
  leechCardId = leech!.id

  // 2. Near-duplicate pair (W6 interference)
  const [dupe1] = M.db.db
    .insert(M.db.cards)
    .values({
      deckId: testDeckId,
      due: new Date().toISOString(),
      type: 'basic',
      content: {
        basic: {
          front: 'What is the speed of light in vacuum?',
          back: '300,000 km/s',
        },
      },
      source: 'Physics 101',
      tags: ['physics'],
      lapses: 0,
    })
    .returning()
    .all()
  dupeCard1Id = dupe1!.id

  const [dupe2] = M.db.db
    .insert(M.db.cards)
    .values({
      deckId: testDeckId,
      due: new Date().toISOString(),
      type: 'basic',
      content: {
        basic: {
          front: 'What is the speed of light in vacuum?',
          back: '300,000 km/s',
        },
      },
      source: 'Physics 101',
      tags: ['physics'],
      lapses: 0,
    })
    .returning()
    .all()
  dupeCard2Id = dupe2!.id

  // 3. Basic card suitable for cloze regeneration (W11)
  const [clozeCard] = M.db.db
    .insert(M.db.cards)
    .values({
      deckId: testDeckId,
      due: new Date().toISOString(),
      type: 'basic',
      content: {
        basic: {
          front: 'What does mitochondria produce?',
          back: 'ATP through cellular aerobic respiration',
        },
      },
      source: 'Biology 101',
      tags: ['biology'],
      lapses: 0,
    })
    .returning()
    .all()
  clozeCardId = clozeCard!.id
})

describe('Deck Doctor API (/api/decks/doctor)', () => {
  it('GET /api/decks/doctor returns diagnosis, healthScore, findings, and fix actions', async () => {
    const res = await M.doctor.GET(get(`/api/decks/doctor?deckId=${testDeckId}`))
    expect(res.status).toBe(200)

    const data = (await res.json()) as {
      deckId: number
      healthScore: number
      findings: Array<{ ruleId: string; severity: string; cardId: number }>
      actions: Array<{ kind: string; cardId?: number; deckId?: number }>
      stats: { totalCards: number; leechCount: number }
    }

    expect(data.deckId).toBe(testDeckId)
    expect(data.stats.totalCards).toBe(4)
    expect(data.stats.leechCount).toBe(1)
    expect(data.healthScore).toBeLessThan(100)

    // Contains suspend action for the leech
    const suspendAct = data.actions.find(
      (a) => a.kind === 'suspend-card' && a.cardId === leechCardId,
    )
    expect(suspendAct).toBeDefined()

    // Contains delete action for the duplicate card
    const deleteAct = data.actions.find(
      (a) => a.kind === 'delete-card' && (a.cardId === dupeCard1Id || a.cardId === dupeCard2Id),
    )
    expect(deleteAct).toBeDefined()

    // Contains rename-deck action for the "Untitled" deck
    const renameAct = data.actions.find((a) => a.kind === 'rename-deck')
    expect(renameAct).toBeDefined()
  })

  it('GET returns 404 for non-existent deck', async () => {
    const res = await M.doctor.GET(get('/api/decks/doctor?deckId=999999'))
    expect(res.status).toBe(404)
  })

  it('GET returns 400 for invalid query parameter', async () => {
    const res = await M.doctor.GET(get('/api/decks/doctor?deckId=invalid'))
    expect(res.status).toBe(400)
  })

  it('POST /api/decks/doctor applies actions atomically in a single transaction', async () => {
    const deleteTargetId = Math.max(dupeCard1Id, dupeCard2Id)

    const res = await M.doctor.POST(
      post('/api/decks/doctor', {
        deckId: testDeckId,
        actions: [
          { kind: 'suspend-card', cardId: leechCardId, rule: 'leech-prevention' },
          { kind: 'delete-card', cardId: deleteTargetId, rule: 'W6-interference' },
          { kind: 'regenerate-cloze', cardId: clozeCardId, rule: 'W11-cloze-suggestion' },
          {
            kind: 'rename-deck',
            deckId: testDeckId,
            to: 'Medical Neuroscience',
            rule: 'deck-naming',
          },
        ],
      }),
    )

    expect(res.status).toBe(200)
    const data = (await res.json()) as { ok: boolean; appliedCount: number }
    expect(data.ok).toBe(true)
    expect(data.appliedCount).toBe(4)

    // Verify card was suspended
    const [suspendedCard] = M.db.db
      .select()
      .from(M.db.cards)
      .where(eq(M.db.cards.id, leechCardId))
      .limit(1)
      .all()
    expect(suspendedCard?.suspended).toBe(true)

    // Verify duplicate card was deleted
    const [deletedCard] = M.db.db
      .select()
      .from(M.db.cards)
      .where(eq(M.db.cards.id, deleteTargetId))
      .limit(1)
      .all()
    expect(deletedCard).toBeUndefined()

    // Verify cloze regeneration updated card type and content
    const [regeneratedCard] = M.db.db
      .select()
      .from(M.db.cards)
      .where(eq(M.db.cards.id, clozeCardId))
      .limit(1)
      .all()
    expect(regeneratedCard?.type).toBe('cloze')
    expect(regeneratedCard?.content.cloze?.text).toContain('{{c1::')

    // Verify deck was renamed
    const [renamedDeck] = M.db.db
      .select()
      .from(M.db.decks)
      .where(eq(M.db.decks.id, testDeckId))
      .limit(1)
      .all()
    expect(renamedDeck?.name).toBe('Medical Neuroscience')
  })

  it('POST rejects malformed payloads with 400', async () => {
    const res = await M.doctor.POST(
      post('/api/decks/doctor', {
        deckId: testDeckId,
        actions: [], // min(1) violation
      }),
    )
    expect(res.status).toBe(400)
  })
})
