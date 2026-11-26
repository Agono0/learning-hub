/**
 * /api/review/undo — stale / replayed / cross-card undo returns 409 and leaves
 * the card untouched; the normal "undo my last grade" path is unchanged.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-undo-test-')), 'undo.db')

type Db = typeof import('@learning-hub/db')
let D: Db
let undo: typeof import('../src/server/handlers/review/undo/route')
let deckId: number

beforeAll(async () => {
  D = await import('@learning-hub/db')
  undo = await import('../src/server/handlers/review/undo/route')
  const [deck] = D.db.insert(D.decks).values({ name: 'Undo Test' }).returning().all()
  deckId = deck!.id
})

function newCard(): number {
  const [c] = D.db
    .insert(D.cards)
    .values({
      deckId,
      type: 'basic',
      content: { basic: { front: 'Q', back: 'A' } },
      due: '2026-06-01T00:00:00.000Z',
    })
    .returning()
    .all()
  return c!.id
}

function post(body: unknown) {
  return undo.POST(
    new Request('http://localhost/api/review/undo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

const cardRow = (id: number) => D.db.select().from(D.cards).where(eq(D.cards.id, id)).get()!

describe('POST /api/review/undo guard', () => {
  it('undoes the latest review (200)', async () => {
    const id = newCard()
    const r = await D.executeReview(
      { cardId: id, grade: 3 },
      { now: new Date('2026-06-01T10:00:00Z') },
    )
    const res = await post({ cardId: id, revlogId: r.revlog.id, preReview: r.preReview })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { revlogUndone: boolean }).revlogUndone).toBe(true)
    expect(cardRow(id).reps).toBe(0)
  })

  it('returns 409 for a stale undo and does not change the card', async () => {
    const id = newCard()
    const r1 = await D.executeReview(
      { cardId: id, grade: 3 },
      { now: new Date('2026-06-01T10:00:00Z') },
    )
    await D.executeReview({ cardId: id, grade: 3 }, { now: new Date('2026-06-04T10:00:00Z') })
    const before = cardRow(id)
    const res = await post({ cardId: id, revlogId: r1.revlog.id, preReview: r1.preReview })
    expect(res.status).toBe(409)
    expect(cardRow(id)).toEqual(before)
  })

  it('returns 409 for a replayed undo after a newer review', async () => {
    const id = newCard()
    const r1 = await D.executeReview(
      { cardId: id, grade: 3 },
      { now: new Date('2026-06-01T10:00:00Z') },
    )
    const body = { cardId: id, revlogId: r1.revlog.id, preReview: r1.preReview }
    expect((await post(body)).status).toBe(200)
    await D.executeReview({ cardId: id, grade: 3 }, { now: new Date('2026-06-04T10:00:00Z') })
    const before = cardRow(id)
    expect((await post(body)).status).toBe(409)
    expect(cardRow(id)).toEqual(before)
  })

  it("returns 409 for another card's revlogId", async () => {
    const a = newCard()
    const b = newCard()
    const ra = await D.executeReview(
      { cardId: a, grade: 3 },
      { now: new Date('2026-06-01T10:00:00Z') },
    )
    const rb = await D.executeReview(
      { cardId: b, grade: 3 },
      { now: new Date('2026-06-02T10:00:00Z') },
    )
    const before = cardRow(a)
    const res = await post({ cardId: a, revlogId: rb.revlog.id, preReview: ra.preReview })
    expect(res.status).toBe(409)
    expect(cardRow(a)).toEqual(before)
  })
})
