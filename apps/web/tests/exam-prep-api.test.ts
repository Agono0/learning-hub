/**
 * Exam prep API: a read-only day-by-day plan toward an exam date.
 * Checks validation, rest days, caps, labels, assumptions, separation of the
 * no-review baseline, and that nothing is written.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-exam-prep-api-')), 'p.db')

type Mods = {
  route: typeof import('../src/server/handlers/exam-prep/route')
  db: typeof import('@learning-hub/db')
}
let M: Mods
let deckId: number
let examId: number

const day = 86_400_000
const iso = (d: number) => new Date(Date.now() + d * day).toISOString()
const futureDate = (d: number) => iso(d).slice(0, 10)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function get(qs = ''): Promise<{ status: number; body: any }> {
  const res = await M.route.GET(new Request(`http://localhost/api/exam-prep${qs}`))
  return { status: res.status, body: await res.json() }
}

beforeAll(async () => {
  const db = await import('@learning-hub/db')
  const route = await import('../src/server/handlers/exam-prep/route')
  M = { route, db }
  const [deck] = db.db.insert(db.decks).values({ name: 'Anatomy' }).returning().all()
  deckId = deck!.id
  for (let i = 0; i < 30; i++) {
    db.db
      .insert(db.cards)
      .values({
        deckId,
        type: 'basic',
        content: { basic: { front: `Q${i}`, back: `A${i}` } } as never,
        state: i < 24 ? 2 : 0,
        stability: i < 24 ? 3 + (i % 8) * 4 : 0,
        difficulty: 5,
        reps: i < 24 ? 3 : 0,
        scheduledDays: 5,
        lastReview: i < 24 ? iso(-4 - (i % 5)) : null,
        due: iso(i % 6 === 0 ? -2 : 3),
      })
      .run()
  }
  const [exam] = db.db
    .insert(db.examDates)
    .values({ title: 'Anatomy final', date: futureDate(14) })
    .returning()
    .all()
  examId = exam!.id
})

describe('GET /api/exam-prep', () => {
  it('builds a plan for a saved exam with a day list and a summary', async () => {
    const { status, body } = await get(`?examId=${examId}`)
    expect(status).toBe(200)
    expect(body.title).toBe('Anatomy final')
    expect(body.plan.days.length).toBeGreaterThanOrEqual(14)
    expect(body.plan.summary.seenCards).toBe(24)
    expect(body.plan.summary.unseenCards).toBe(6)
    expect(body.plan.summary.planned).toBeGreaterThanOrEqual(body.plan.summary.baseline)
  })

  it('labels reviews with the card front and its deck', async () => {
    const { body } = await get(`?examId=${examId}`)
    const first = body.plan.days.flatMap((d: { reviews: unknown[] }) => d.reviews)[0]
    expect(first.label).toMatch(/^Q\d+$/)
    expect(first.deck).toBe('Anatomy')
  })

  it('carries the assumptions and the read-only note', async () => {
    const { body } = await get(`?examId=${examId}`)
    expect(body.plan.assumptions.join(' ')).toMatch(/not validated exam scores/)
    expect(body.plan.assumptions.join(' ')).toMatch(/greedily/)
    expect(body.note).toMatch(/Nothing is scheduled or reviewed for you/)
  })

  it('honors perDay, rest weekdays and the per-card cap', async () => {
    const { body } = await get(`?examId=${examId}&perDay=4&rest=0,6&maxReviewsPerCard=1`)
    const days = body.plan.days as { date: string; rest: boolean; reviews: { cardId: number }[] }[]
    const seen = new Set<number>()
    for (const d of days) {
      expect(d.reviews.length).toBeLessThanOrEqual(4)
      if (d.rest) expect(d.reviews).toEqual([])
      for (const r of d.reviews) {
        expect(seen.has(r.cardId)).toBe(false)
        seen.add(r.cardId)
      }
    }
    expect(days.some((d) => d.rest)).toBe(true)
  })

  it('accepts an ad-hoc date and restricts to chosen decks', async () => {
    const a = await get(`?date=${futureDate(7)}&title=Quiz&deckIds=${deckId}`)
    expect(a.status).toBe(200)
    expect(a.body.title).toBe('Quiz')
    const none = await get(`?date=${futureDate(7)}&deckIds=9999`)
    expect(none.body.plan.summary.seenCards).toBe(0)
    expect(none.body.plan.days).toEqual([])
  })

  it('returns an empty expired plan for a past exam', async () => {
    const { body } = await get(`?date=${futureDate(-3)}`)
    expect(body.plan.expired).toBe(true)
    expect(body.plan.days).toEqual([])
  })

  it('rejects bad input with 400 or 404', async () => {
    expect((await get('')).status).toBe(400)
    expect((await get('?examId=0')).status).toBe(400)
    expect((await get('?date=not-a-date')).status).toBe(400)
    expect((await get('?date=2026-12-01&perDay=101')).status).toBe(400)
    expect((await get('?date=2026-12-01&rest=7')).status).toBe(400)
    expect((await get('?date=2026-12-01&minGain=0.9')).status).toBe(400)
    expect((await get('?date=2026-12-01&deckIds=1,x')).status).toBe(400)
    expect((await get('?examId=987654')).status).toBe(404)
  })

  it('never writes: cards, exams and the review log are unchanged after several reads', async () => {
    const snapshot = () =>
      JSON.stringify([
        M.db.db.select().from(M.db.cards).all(),
        M.db.db.select().from(M.db.examDates).all(),
        M.db.db.select().from(M.db.revlog).all(),
      ])
    const before = snapshot()
    await get(`?examId=${examId}`)
    await get(`?date=${futureDate(5)}&perDay=2`)
    expect(snapshot()).toBe(before)
  })
})
