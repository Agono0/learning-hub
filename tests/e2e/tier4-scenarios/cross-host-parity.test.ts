/**
 * Tier 4: Cross-Host Parity — the same learner history must yield the same
 * derived answers on every host (docs/adr/0004, docs/contracts.md C3).
 *
 * The drift class this guards against: web handler, headless REST server and
 * MCP tool each derived "trials"/"stats" from revlog independently and the
 * copies had drifted (only web excluded undone reviews; deck-listing response
 * shapes diverged). All three surfaces now read the same repos
 * (packages/db/src/repos) — this suite proves it end-to-end through each
 * host's real transport: Next.js route modules (Request/Response), the
 * headless server's node:http dispatch, and the MCP stdio subprocess.
 *
 * Assertions are DELTA-based (baseline read before seeding, delta asserted
 * after) so a pre-seeded developer database can never produce false parity
 * failures. The seeded history deliberately stays below the smallest sampling
 * window (100 rows) so the per-host `limit` contracts (TD-03: per-surface
 * windows, documented in ADR-0004) cannot mask a divergence.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { callRoute } from '../helpers/api-client'
import { McpTestClient } from '../helpers/mcp-client'
import { getActiveDbPath } from '../helpers/setup'
import { dispatch } from '../../../apps/server/src/routes'
import * as decksRoute from '../../../apps/web/app/api/decks/route'
import * as cardsRoute from '../../../apps/web/app/api/cards/route'
import * as reviewRoute from '../../../apps/web/app/api/review/route'
import * as reviewUndoRoute from '../../../apps/web/app/api/review/undo/route'
import * as hypercorrectionRoute from '../../../apps/web/app/api/cognitive/hypercorrection/route'
import * as metacognitionRoute from '../../../apps/web/app/api/cognitive/metacognition/route'
import * as statsRoute from '../../../apps/web/app/api/review/stats/route'

/** Subset of the web POST /api/review response the parity setup consumes. */
interface ReviewResponse {
  ok: boolean
  card: { id: number; due: string; suspended: number }
  preReview: Record<string, unknown>
  revlogId: number
}

interface HypercorrectionSnapshot {
  sampleSize: number
  report: Record<string, unknown>
  queueCardIds: number[]
}

interface StatsSnapshot {
  trueRetention: Record<string, unknown>
  todayReviews: number
  todayCorrect: number
  forecast: { date: string; due: number }[]
}

interface DeckRow {
  id: number
  name: string
  total: number
  due: number
  newCards: number
}

describe('Tier 4: Cross-Host Parity (web handler == headless server == MCP)', () => {
  let server: Server
  let baseUrl: string
  let mcp: McpTestClient
  let deckId: number
  const cardIds: number[] = []

  // Baselines (before seeding) and snapshots (after) from the web surface.
  let baseHyper: HypercorrectionSnapshot
  let baseMetaCount: number
  let baseStats: StatsSnapshot
  let webHyper: HypercorrectionSnapshot
  let webMetaCount: number
  let webStats: StatsSnapshot
  let webDecks: DeckRow[]

  async function readHypercorrectionWeb(): Promise<HypercorrectionSnapshot> {
    const res = await callRoute<{
      report: Record<string, unknown>
      queue: { cardId: number }[]
      sampleSize: number
    }>(hypercorrectionRoute.GET)
    expect(res.status).toBe(200)
    return {
      sampleSize: res.data.sampleSize,
      report: res.data.report,
      queueCardIds: res.data.queue.map((q) => q.cardId),
    }
  }

  async function readMetacognitionWeb(): Promise<number> {
    const res = await callRoute<{ sampleSize: number }>(metacognitionRoute.GET)
    expect(res.status).toBe(200)
    return res.data.sampleSize
  }

  async function readStatsWeb(): Promise<StatsSnapshot> {
    const res = await callRoute<{
      trueRetention: Record<string, unknown>
      today: { reviews: number; correct: number }
      forecast: { date: string; due: number }[]
    }>(statsRoute.GET)
    expect(res.status).toBe(200)
    return {
      trueRetention: res.data.trueRetention,
      todayReviews: res.data.today.reviews,
      todayCorrect: res.data.today.correct,
      forecast: res.data.forecast,
    }
  }

  async function readDecksWeb(): Promise<DeckRow[]> {
    const res = await callRoute<{ decks: DeckRow[] }>(decksRoute.GET)
    expect(res.status).toBe(200)
    return res.data.decks
  }

  beforeAll(async () => {
    // Headless server over its real node:http dispatch.
    server = createServer((req, res) => {
      dispatch(req, res).catch((err) => {
        if (!res.writableEnded) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const addr = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${addr.port}`

    // MCP server over its real stdio transport, same per-file DB clone.
    mcp = new McpTestClient(getActiveDbPath())
    await mcp.start()

    // Baselines from the cloned database, before this suite seeds anything.
    baseHyper = await readHypercorrectionWeb()
    baseMetaCount = await readMetacognitionWeb()
    baseStats = await readStatsWeb()

    // ── Seed ONE history through the canonical web pipeline ──────────────
    const deckRes = await callRoute<{ deck: { id: number } }>(decksRoute.POST, {
      method: 'POST',
      body: { name: 'E2E Parity Deck' },
    })
    deckId = deckRes.data.deck.id

    for (let i = 0; i < 4; i++) {
      const res = await callRoute<{ card: { id: number } }>(cardsRoute.POST, {
        method: 'POST',
        body: {
          deckId,
          type: 'basic',
          content: { front: `Parity front ${i}`, back: `Parity back ${i}` },
          due: new Date(Date.now() - 60_000).toISOString(), // due in the past
        },
      })
      expect(res.status).toBe(200)
      cardIds.push(res.data.card.id)
    }

    // Review script (confidence: 1 = sure, 0 = unsure):
    //  card1: confident miss → later success   (correction #1)
    //  card2: confident miss, still armed      (queue seed)
    //  card3: success — then UNDONE            (must vanish everywhere)
    //  card4: unsure miss → success            (correction #2)
    const script: { cardIndex: number; grade: number; confidence: 0 | 1; undo?: boolean }[] = [
      { cardIndex: 0, grade: 1, confidence: 1 },
      { cardIndex: 0, grade: 3, confidence: 0 },
      { cardIndex: 1, grade: 1, confidence: 1 },
      { cardIndex: 2, grade: 3, confidence: 0, undo: true },
      { cardIndex: 3, grade: 2, confidence: 0 },
      { cardIndex: 3, grade: 3, confidence: 0 },
    ]
    for (const step of script) {
      const res = await callRoute<ReviewResponse>(reviewRoute.POST, {
        method: 'POST',
        body: {
          cardId: cardIds[step.cardIndex]!,
          grade: step.grade,
          confidence: step.confidence,
          timeMs: 1500,
        },
      })
      expect(res.status).toBe(200)
      if (step.undo) {
        const undo = await callRoute<{ ok: boolean; revlogUndone: boolean }>(reviewUndoRoute.POST, {
          method: 'POST',
          body: {
            cardId: cardIds[step.cardIndex]!,
            revlogId: res.data.revlogId,
            preReview: res.data.preReview,
          },
        })
        expect(undo.status).toBe(200)
        expect(undo.data.revlogUndone).toBe(true)
      }
    }

    // ── Post-seed snapshots from the web surface ─────────────────────────
    webHyper = await readHypercorrectionWeb()
    webMetaCount = await readMetacognitionWeb()
    webStats = await readStatsWeb()
    webDecks = (await readDecksWeb()).filter((d) => d.name === 'E2E Parity Deck')
    expect(webDecks.length).toBe(1)
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    mcp.stop()
  })

  it('hypercorrection: identical corrections count, crucible report and queue on all three hosts', async () => {
    const serverRes = await fetch(`${baseUrl}/cognitive/metacognition/hypercorrection`)
    expect(serverRes.status).toBe(200)
    const serverJson = (await serverRes.json()) as {
      correctionsCount: number
      report: Record<string, unknown>
      queue: { cardId: number }[]
    }

    const mcpRes = await mcp.callTool<{
      correctionsCount: number
      crucible: Record<string, unknown>
      relearningQueue: { cardId: number }[]
    }>('metacognition_hypercorrection', { limit: 200 })

    // Delta: exactly 2 new corrections (the two miss→success pairs); the
    // undone review must not have counted anywhere.
    expect(webHyper.sampleSize).toBe(baseHyper.sampleSize + 2)
    expect(serverJson.correctionsCount).toBe(webHyper.sampleSize)
    expect(mcpRes.correctionsCount).toBe(webHyper.sampleSize)

    // The crucible report is core's evaluateHypercorrection output — one
    // function, so all three hosts must return the identical object.
    expect(serverJson.report).toEqual(webHyper.report)
    expect(mcpRes.crucible).toEqual(webHyper.report)

    // The relearning queue grows by exactly the armed confident miss (card2).
    expect(webHyper.queueCardIds).toContain(cardIds[1]!)
    expect(webHyper.queueCardIds.length).toBe(baseHyper.queueCardIds.length + 1)
    expect(serverJson.queue.map((q) => q.cardId)).toEqual(webHyper.queueCardIds)
    expect(mcpRes.relearningQueue.map((q) => q.cardId)).toEqual(webHyper.queueCardIds)
  })

  it('metacognition: identical trial counts — undone reviews excluded everywhere', async () => {
    const serverRes = await fetch(`${baseUrl}/cognitive/metacognition`)
    expect(serverRes.status).toBe(200)
    const serverJson = (await serverRes.json()) as { trialsCount: number }

    const mcpRes = await mcp.callTool<{ trialsCount: number }>('metacognition_eval', {
      limit: 100,
    })

    // Delta: 6 committed reviews, 1 undone → exactly +5 trials on every host.
    expect(webMetaCount).toBe(baseMetaCount + 5)
    expect(serverJson.trialsCount).toBe(webMetaCount)
    expect(mcpRes.trialsCount).toBe(webMetaCount)
  })

  it('stats: identical true retention, today tallies, forecast and due count', async () => {
    const serverRes = await fetch(`${baseUrl}/stats`)
    expect(serverRes.status).toBe(200)
    const serverJson = (await serverRes.json()) as {
      trueRetention: Record<string, unknown>
      today: { reviews: number; correct: number }
      forecast: { date: string; due: number }[]
    }
    const todayRes = await fetch(`${baseUrl}/today`)
    expect(todayRes.status).toBe(200)
    const todayJson = (await todayRes.json()) as {
      due: number
      reviews: { count: number; correct: number }
    }

    const mcpRes = await mcp.callTool<{
      trueRetention: Record<string, unknown>
      dueCount: number
    }>('review_stats', {})

    expect(serverJson.trueRetention).toEqual(webStats.trueRetention)
    expect(mcpRes.trueRetention).toEqual(webStats.trueRetention)

    // Delta: +5 effective reviews today, +2 correct (rating > 1) — undo excluded.
    expect(webStats.todayReviews).toBe(baseStats.todayReviews + 5)
    expect(webStats.todayCorrect).toBe(baseStats.todayCorrect + 2)
    expect(serverJson.today.reviews).toBe(webStats.todayReviews)
    expect(serverJson.today.correct).toBe(webStats.todayCorrect)
    expect(todayJson.reviews.count).toBe(webStats.todayReviews)
    expect(todayJson.reviews.correct).toBe(webStats.todayCorrect)

    expect(serverJson.forecast).toEqual(webStats.forecast)
    expect(mcpRes.dueCount).toBe(todayJson.due)
  })

  it('decks: identical counts for the parity deck on both hosts', async () => {
    const serverRes = await fetch(`${baseUrl}/decks`)
    expect(serverRes.status).toBe(200)
    const serverJson = (await serverRes.json()) as { decks: DeckRow[] }

    const webRow = webDecks[0]!
    const serverRow = serverJson.decks.find((d) => d.id === deckId)
    expect(serverRow).toBeDefined()

    // 4 cards total, none new after the review script; due counts must match
    // across hosts regardless of how FSRS rescheduled the missed card.
    expect(webRow.total).toBe(4)
    expect(webRow.newCards).toBe(0)
    expect(serverRow!.total).toBe(webRow.total)
    expect(serverRow!.due).toBe(webRow.due)
    expect(serverRow!.newCards).toBe(webRow.newCards)
  })
})
