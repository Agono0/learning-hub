import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { cards, db, decks, examDates, revlog } from '@learning-hub/db'
import { callRoute } from '../helpers/api-client'
import { runCli } from '../helpers/cli-runner'
import { McpTestClient } from '../helpers/mcp-client'
import { getActiveDbPath } from '../helpers/setup'
import * as examPrepRoute from '../../../apps/web/app/api/exam-prep/route'
import * as reviewRoute from '../../../apps/web/app/api/review/route'

interface Day {
  date: string
  rest: boolean
  reviews: { cardId: number; label: string }[]
}
interface Body {
  ok: boolean
  error?: string
  note?: string
  plan?: {
    assumptions: string[]
    days: Day[]
    summary: { baseline: number; planned: number; plannedReviews: number; unseenCards: number }
  }
}
interface ReviewBody {
  ok: boolean
  explicit?: boolean
  cards?: { id: number }[]
  error?: string
  cardIds?: number[]
}

const day = 86_400_000

describe('Tier 3 E2E: exam prep through API, CLI, MCP and the review queue', () => {
  let deckId: number
  let examId: number
  let client: McpTestClient
  const examDate = new Date(Date.now() + 12 * day).toISOString().slice(0, 10)

  beforeAll(async () => {
    const [deck] = await db.insert(decks).values({ name: 'Prep E2E Deck' }).returning()
    deckId = deck!.id
    const now = Date.now()
    for (let i = 0; i < 20; i++) {
      await db.insert(cards).values({
        deckId,
        type: 'basic',
        content: { basic: { front: `PQ${i}`, back: `PA${i}` } },
        due: new Date(now + (i - 4) * day).toISOString(),
        lastReview: new Date(now - (6 + i) * day).toISOString(),
        stability: 4 + i,
        difficulty: 5,
        state: 2,
        reps: 4,
        lapses: 0,
        scheduledDays: 8,
      })
    }
    for (let i = 0; i < 2; i++) {
      await db.insert(cards).values({
        deckId,
        type: 'basic',
        content: { basic: { front: `PNew${i}`, back: 'x' } },
        due: new Date(now).toISOString(),
        state: 0,
      })
    }
    const [exam] = await db
      .insert(examDates)
      .values({ title: 'Prep E2E Exam', date: examDate })
      .returning()
    examId = exam!.id
    client = new McpTestClient(getActiveDbPath())
    await client.start()
  }, 30000)

  afterAll(() => {
    client?.stop()
  })

  it('returns the same plan from the API, the CLI and the MCP tool, each with assumptions', async () => {
    const api = await callRoute<Body>(examPrepRoute.GET, {
      method: 'GET',
      query: { examId, deckIds: String(deckId), perDay: 5 },
    })
    expect(api.status).toBe(200)
    const cli = await runCli(
      [
        'exam-prep',
        'plan',
        '--exam',
        String(examId),
        '--decks',
        String(deckId),
        '--per-day',
        '5',
        '--json',
      ],
      getActiveDbPath(),
    )
    expect(cli.exitCode).toBe(0)
    const cliBody = JSON.parse(cli.stdout) as Body
    const mcpBody = await client.callTool<Body>('exam_prep_plan', {
      examId,
      deckIds: [deckId],
      perDay: 5,
    })
    for (const b of [api.data, cliBody, mcpBody]) {
      expect(b.ok).toBe(true)
      expect(b.plan!.summary.unseenCards).toBe(2)
      expect(b.plan!.assumptions.length).toBeGreaterThan(0)
      expect(b.note).toMatch(/Nothing is scheduled or reviewed for you/)
      expect(b.plan!.summary.planned).toBeGreaterThanOrEqual(b.plan!.summary.baseline)
      for (const d of b.plan!.days) expect(d.reviews.length).toBeLessThanOrEqual(5)
    }
    expect(cliBody.plan!.summary.baseline).toBeCloseTo(api.data.plan!.summary.baseline, 3)
    expect(mcpBody.plan!.summary.planned).toBeCloseTo(api.data.plan!.summary.planned, 3)
    expect(mcpBody.plan!.assumptions).toEqual(api.data.plan!.assumptions)
    expect(cliBody.plan!.days.map((d) => d.reviews.map((r) => r.cardId))).toEqual(
      api.data.plan!.days.map((d) => d.reviews.map((r) => r.cardId)),
    )
  })

  it('prints a readable CLI plan with the assumptions under the numbers', async () => {
    const cli = await runCli(
      ['exam-prep', 'plan', '--date', examDate, '--decks', String(deckId), '--rest', '0,6'],
      getActiveDbPath(),
    )
    expect(cli.exitCode).toBe(0)
    expect(cli.stdout).toContain('The model estimates, as of')
    expect(cli.stdout).toContain('if you review nothing more')
    expect(cli.stdout).toContain('How to read these numbers')
    expect(cli.stdout).toMatch(/not validated exam scores/)
  })

  it('a planned day opens in the review queue as exactly those cards, in order, and writes nothing', async () => {
    const before = (await db.select().from(cards).where(eq(cards.deckId, deckId))).length
    const plan = await callRoute<Body>(examPrepRoute.GET, {
      method: 'GET',
      query: { examId, deckIds: String(deckId), perDay: 6 },
    })
    const first = plan.data.plan!.days.find((d) => d.reviews.length > 0)!
    const ids = first.reviews.map((r) => r.cardId)
    const q = await callRoute<ReviewBody>(reviewRoute.GET, {
      method: 'GET',
      query: { cardIds: ids.join(',') },
    })
    expect(q.status).toBe(200)
    expect(q.data.explicit).toBe(true)
    expect(q.data.cards!.map((c) => c.id)).toEqual(ids)
    expect(await db.select().from(revlog)).toHaveLength(0)
    expect(await db.select().from(cards).where(eq(cards.deckId, deckId))).toHaveLength(before)
  })

  it('answering an opened card goes through the ordinary review and moves the plan', async () => {
    const plan1 = await callRoute<Body>(examPrepRoute.GET, {
      method: 'GET',
      query: { examId, deckIds: String(deckId), perDay: 6 },
    })
    const cardId = plan1.data.plan!.days.find((d) => d.reviews.length > 0)!.reviews[0]!.cardId
    const post = await callRoute<{ ok: boolean }>(reviewRoute.POST, {
      method: 'POST',
      body: { cardId, grade: 3, confidence: 1 },
    })
    expect(post.status).toBe(200)
    expect(await db.select().from(revlog).where(eq(revlog.cardId, cardId))).toHaveLength(1)
    const plan2 = await callRoute<Body>(examPrepRoute.GET, {
      method: 'GET',
      query: { examId, deckIds: String(deckId), perDay: 6 },
    })
    expect(plan2.data.plan!.summary.baseline).toBeGreaterThan(plan1.data.plan!.summary.baseline)
  })

  it('rejects bad input the same way everywhere and an unsafe card list outright', async () => {
    const api = await callRoute<Body>(examPrepRoute.GET, { method: 'GET', query: { date: 'soon' } })
    expect(api.status).toBe(400)
    const cli = await runCli(
      ['exam-prep', 'plan', '--date', examDate, '--per-day', '101'],
      getActiveDbPath(),
    )
    expect(cli.exitCode).not.toBe(0)
    const mcp = await client.callTool<Body>('exam_prep_plan', { date: 'soon' })
    expect(mcp.ok).toBe(false)

    const [c] = await db.select().from(cards).where(eq(cards.deckId, deckId)).limit(1)
    await db.update(cards).set({ suspended: true }).where(eq(cards.id, c!.id))
    const bad = await callRoute<ReviewBody>(reviewRoute.GET, {
      method: 'GET',
      query: { cardIds: `${c!.id},987654` },
    })
    expect(bad.status).toBe(400)
    expect(new Set(bad.data.cardIds)).toEqual(new Set([c!.id, 987654]))
    const dup = await callRoute<ReviewBody>(reviewRoute.GET, {
      method: 'GET',
      query: { cardIds: '1,1' },
    })
    expect(dup.status).toBe(400)
  })
})
