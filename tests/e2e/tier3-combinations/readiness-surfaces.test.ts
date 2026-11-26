import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { cards, db, decks, examDates } from '@learning-hub/db'
import { callRoute } from '../helpers/api-client'
import { runCli } from '../helpers/cli-runner'
import { McpTestClient } from '../helpers/mcp-client'
import { getActiveDbPath } from '../helpers/setup'
import * as readinessRoute from '../../../apps/web/app/api/readiness/route'

interface Body {
  ok: boolean
  error?: string
  report?: {
    assumptions: string[]
    overall: { cards: number; unseen: number; baselineRecall: number; plannedRecall: number }
    expired: boolean
  }
  review?: { assumptions: string[]; top: unknown[]; reviewsNeededForTarget: number | null }
  exams?: Array<{ id: number; title: string }>
}

const day = 86_400_000

describe('Tier 3 E2E: exam readiness through API, CLI and MCP', () => {
  let deckId: number
  let examId: number
  let client: McpTestClient
  const examDate = new Date(Date.now() + 30 * day).toISOString().slice(0, 10)

  beforeAll(async () => {
    const [deck] = await db.insert(decks).values({ name: 'Readiness E2E Deck' }).returning()
    deckId = deck!.id
    const now = Date.now()
    for (let i = 0; i < 15; i++) {
      await db.insert(cards).values({
        deckId,
        type: 'basic',
        content: { basic: { front: `Q${i}`, back: `A${i}` } },
        due: new Date(now + (i - 5) * day).toISOString(),
        lastReview: new Date(now - (10 + i) * day).toISOString(),
        stability: 6 + i,
        difficulty: 5,
        state: 2,
        reps: 4,
        lapses: 0,
        scheduledDays: 10,
      })
    }
    // Three never-studied cards must not be counted as forgotten.
    for (let i = 0; i < 3; i++) {
      await db.insert(cards).values({
        deckId,
        type: 'basic',
        content: { basic: { front: `New${i}`, back: `N${i}` } },
        due: new Date(now).toISOString(),
        state: 0,
      })
    }
    const [exam] = await db
      .insert(examDates)
      .values({ title: 'Readiness E2E Exam', date: examDate })
      .returning()
    examId = exam!.id
    client = new McpTestClient(getActiveDbPath())
    await client.start()
  }, 30000)

  afterAll(() => {
    client?.stop()
  })

  it('lists the saved exam over the API', async () => {
    const res = await callRoute<Body>(readinessRoute.GET, { method: 'GET' })
    expect(res.status).toBe(200)
    expect(res.data.exams?.map((e) => e.id)).toContain(examId)
  })

  it('returns the same report from the API, the CLI and the MCP tool, each with assumptions', async () => {
    const api = await callRoute<Body>(readinessRoute.GET, {
      method: 'GET',
      query: { examId, deckIds: String(deckId), plan: 'on-schedule', budget: 5 },
    })
    expect(api.status).toBe(200)

    const cli = await runCli(
      [
        'readiness',
        'report',
        '--exam',
        String(examId),
        '--decks',
        String(deckId),
        '--budget',
        '5',
        '--json',
      ],
      getActiveDbPath(),
    )
    expect(cli.exitCode).toBe(0)
    const cliBody = JSON.parse(cli.stdout) as Body

    const mcpBody = await client.callTool<Body>('readiness_report', {
      examId,
      deckIds: [deckId],
      budget: 5,
    })

    for (const b of [api.data, cliBody, mcpBody]) {
      expect(b.ok).toBe(true)
      expect(b.report!.overall.cards).toBe(18)
      expect(b.report!.overall.unseen).toBe(3)
      expect(b.report!.assumptions.length).toBeGreaterThan(0)
      expect(b.review!.assumptions).toEqual(b.report!.assumptions)
      expect(b.review!.top.length).toBeLessThanOrEqual(5)
      // The planned scenario is never reported below the no-review baseline.
      expect(b.report!.overall.plannedRecall).toBeGreaterThanOrEqual(
        b.report!.overall.baselineRecall,
      )
    }
    expect(cliBody.report!.overall.baselineRecall).toBeCloseTo(
      api.data.report!.overall.baselineRecall,
      3,
    )
    expect(mcpBody.report!.overall.plannedRecall).toBeCloseTo(
      api.data.report!.overall.plannedRecall,
      3,
    )
    expect(mcpBody.report!.assumptions).toEqual(api.data.report!.assumptions)
  })

  it('prints a readable CLI report with the assumptions under the numbers', async () => {
    const cli = await runCli(
      ['readiness', 'report', '--date', examDate, '--decks', String(deckId)],
      getActiveDbPath(),
    )
    expect(cli.exitCode).toBe(0)
    expect(cli.stdout).toContain('If you stop reviewing today')
    expect(cli.stdout).toContain('With the review scenario')
    expect(cli.stdout).toContain('How to read these numbers')
    expect(cli.stdout).toMatch(/estimates, not validated exam scores/)
  })

  it('rejects bad input the same way everywhere and writes nothing', async () => {
    const before = await db.select().from(cards).where(eq(cards.deckId, deckId))

    const api = await callRoute<Body>(readinessRoute.GET, {
      method: 'GET',
      query: { date: 'tomorrow-ish' },
    })
    expect(api.status).toBe(400)
    const missing = await callRoute<Body>(readinessRoute.GET, {
      method: 'GET',
      query: { examId: 999999 },
    })
    expect(missing.status).toBe(404)

    const cli = await runCli(
      ['readiness', 'report', '--date', examDate, '--target', '2'],
      getActiveDbPath(),
    )
    expect(cli.exitCode).not.toBe(0)
    expect(cli.stderr).toContain('--target')

    const mcp = await client.callTool<Body>('readiness_report', { date: 'tomorrow-ish' })
    expect(mcp.ok).toBe(false)

    const after = await db.select().from(cards).where(eq(cards.deckId, deckId))
    expect(after).toEqual(before)
  })

  it('treats a past exam date as expired with no review benefit claimed', async () => {
    const past = new Date(Date.now() - 3 * day).toISOString().slice(0, 10)
    const res = await callRoute<Body>(readinessRoute.GET, {
      method: 'GET',
      query: { date: past, deckIds: String(deckId) },
    })
    expect(res.status).toBe(200)
    expect(res.data.report!.expired).toBe(true)
    expect(res.data.report!.assumptions.length).toBeGreaterThan(0)
  })
})
