/**
 * Exam readiness API: read-only forecast of card recall on an exam date.
 * Checks query validation, the two ways to name an exam, that baseline and
 * scenario are reported apart, that assumptions travel with every report, and
 * that the endpoint never writes.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-readiness-api-')), 'r.db')

type Mods = {
  route: typeof import('../src/server/handlers/readiness/route')
  db: typeof import('@learning-hub/db')
}
let M: Mods
let deckId: number
let examId: number

const day = 86_400_000
const iso = (d: number) => new Date(Date.now() + d * day).toISOString()
const futureDate = (d: number) => iso(d).slice(0, 10)

async function get(qs = ''): Promise<{ status: number; body: any }> {
  const res = await M.route.GET(new Request(`http://localhost/api/readiness${qs}`))
  return { status: res.status, body: await res.json() }
}

beforeAll(async () => {
  const db = await import('@learning-hub/db')
  const route = await import('../src/server/handlers/readiness/route')
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
    .values({ title: 'Anatomy final', date: futureDate(21) })
    .returning()
    .all()
  examId = exam!.id
})

describe('GET /api/readiness', () => {
  it('lists the exam anchors when no exam is chosen', async () => {
    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.exams.map((e: { title: string }) => e.title)).toContain('Anatomy final')
  })

  it('builds a report for a saved exam with the baseline and the scenario apart', async () => {
    const { status, body } = await get(`?examId=${examId}`)
    expect(status).toBe(200)
    const r = body.report
    expect(r.target.title).toBe('Anatomy final')
    expect(r.overall.cards).toBe(30)
    expect(r.overall.unseen).toBe(6)
    expect(r.plan).toEqual({ kind: 'on-schedule' })
    expect(r.overall.plannedRecall).toBeGreaterThanOrEqual(r.overall.baselineRecall)
    expect(r.decks[0].label).toBe('Anatomy')
    expect(r.confidence.level).toBe('moderate')
  })

  it('puts the assumptions in the report and in the review block', async () => {
    const { body } = await get(`?examId=${examId}`)
    expect(body.report.assumptions.join(' ')).toMatch(/not validated exam scores/)
    expect(body.review.assumptions).toEqual(body.report.assumptions)
  })

  it('the none plan makes the scenario equal the baseline', async () => {
    const { body } = await get(`?examId=${examId}&plan=none`)
    expect(body.report.overall.plannedRecall).toBe(body.report.overall.baselineRecall)
  })

  it('accepts an ad-hoc date and title, and a capacity plan', async () => {
    const { status, body } = await get(`?date=${futureDate(10)}&title=Quiz&plan=capacity&perDay=3`)
    expect(status).toBe(200)
    expect(body.report.target.title).toBe('Quiz')
    expect(body.report.plan).toEqual({ kind: 'capacity', perDay: 3 })
    expect(body.report.daysLeft).toBeGreaterThanOrEqual(10)
  })

  it('restricts to chosen decks', async () => {
    const empty = await get(`?examId=${examId}&deckIds=9999`)
    expect(empty.body.report.overall.cards).toBe(0)
    const one = await get(`?examId=${examId}&deckIds=${deckId}`)
    expect(one.body.report.overall.cards).toBe(30)
  })

  it('ranks review gains within the budget, capped and sorted', async () => {
    const { body } = await get(`?examId=${examId}&budget=5`)
    const top = body.review.top as { gain: number }[]
    expect(top.length).toBeLessThanOrEqual(5)
    for (let i = 1; i < top.length; i++)
      expect(top[i - 1]!.gain).toBeGreaterThanOrEqual(top[i]!.gain)
    expect(body.review.meanRecallAfter).toBeGreaterThanOrEqual(body.review.meanRecallBefore)
  })

  it('marks a past exam as expired', async () => {
    const { body } = await get(`?date=${futureDate(-5)}`)
    expect(body.report.expired).toBe(true)
    expect(body.report.daysLeft).toBe(0)
    expect(body.review.top).toEqual([])
  })

  it('rejects bad input with 400 or 404', async () => {
    expect((await get('?examId=0')).status).toBe(400)
    expect((await get('?examId=abc')).status).toBe(400)
    expect((await get('?date=not-a-date')).status).toBe(400)
    expect((await get('?date=2026-12-01&plan=sometimes')).status).toBe(400)
    expect((await get('?date=2026-12-01&target=2')).status).toBe(400)
    expect((await get('?date=2026-12-01&deckIds=1,x')).status).toBe(400)
    expect((await get('?examId=987654')).status).toBe(404)
  })

  it('never writes: card and exam rows are unchanged after several reads', async () => {
    const snapshot = () =>
      JSON.stringify([
        M.db.db.select().from(M.db.cards).all(),
        M.db.db.select().from(M.db.examDates).all(),
      ])
    const before = snapshot()
    await get(`?examId=${examId}`)
    await get(`?examId=${examId}&plan=capacity&perDay=2&budget=40`)
    expect(snapshot()).toBe(before)
  })
})
