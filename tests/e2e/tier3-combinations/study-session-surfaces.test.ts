import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { cards, db, decks, revlog } from '@learning-hub/db'
import { callRoute } from '../helpers/api-client'
import { runCli } from '../helpers/cli-runner'
import { McpTestClient } from '../helpers/mcp-client'
import { getActiveDbPath } from '../helpers/setup'
import * as previewRoute from '../../../apps/web/app/api/study-session/preview/route'
import * as reviewRoute from '../../../apps/web/app/api/review/route'

interface Body {
  ok: boolean
  error?: string
  note?: string
  matched: number
  selected: number
  truncated: boolean
  fingerprint: string
  startHref: string
  assumptions: string[]
  cards: { id: number; label: string; lapses: number }[]
}
interface ReviewBody {
  ok: boolean
  explicit?: boolean
  cards?: { id: number }[]
  error?: string
  cardIds?: number[]
}

const day = 86_400_000

describe('Tier 3 E2E: study sessions through API, CLI, MCP and the review queue', () => {
  let deckId: number
  let oldDeckId: number
  let client: McpTestClient

  beforeAll(async () => {
    const [deck] = await db.insert(decks).values({ name: 'Session E2E Deck' }).returning()
    deckId = deck!.id
    const [old] = await db.insert(decks).values({ name: 'Session Old Deck' }).returning()
    oldDeckId = old!.id
    const now = Date.now()
    for (let i = 0; i < 130; i++) {
      await db.insert(cards).values({
        deckId,
        type: 'basic',
        content: { basic: { front: `SQ${i}`, back: `SA${i}` } },
        tags: i % 2 === 0 ? ['weak'] : [],
        due: new Date(now + (i - 60) * day).toISOString(),
        lastReview: new Date(now - (6 + (i % 30)) * day).toISOString(),
        stability: 4 + (i % 12),
        difficulty: 5,
        state: 2,
        reps: 4,
        lapses: i % 7,
        scheduledDays: 8,
      })
    }
    // Tagged cards far older than the rest: the selector scans every card, so no
    // creation-order cutoff can hide them.
    for (let i = 0; i < 6; i++) {
      await db.insert(cards).values({
        deckId: oldDeckId,
        type: 'basic',
        content: { basic: { front: `Old${i}`, back: 'x' } },
        tags: ['ancient'],
        createdAt: '2020-01-01T00:00:00.000Z',
        due: new Date(now - 2 * day).toISOString(),
        lastReview: new Date(now - 30 * day).toISOString(),
        stability: 5,
        difficulty: 5,
        state: 2,
        reps: 3,
      })
    }
    client = new McpTestClient(getActiveDbPath())
    await client.start()
  }, 60000)

  afterAll(() => {
    client?.stop()
  })

  it('returns the same session from the API, the CLI and the MCP tool, each with assumptions', async () => {
    const api = await callRoute<Body>(previewRoute.GET, {
      method: 'GET',
      query: {
        deckIds: String(deckId),
        tags: 'weak',
        minLapses: 2,
        sort: 'most-lapses',
        limit: 15,
      },
    })
    expect(api.status).toBe(200)
    const cli = await runCli(
      [
        'study-session',
        'preview',
        '--decks',
        String(deckId),
        '--tags',
        'weak',
        '--min-lapses',
        '2',
        '--sort',
        'most-lapses',
        '--limit',
        '15',
        '--json',
      ],
      getActiveDbPath(),
    )
    expect(cli.exitCode).toBe(0)
    const cliBody = JSON.parse(cli.stdout) as Body
    const mcpBody = await client.callTool<Body>('study_session_preview', {
      deckIds: [deckId],
      tags: ['weak'],
      minLapses: 2,
      sort: 'most-lapses',
      limit: 15,
    })
    for (const b of [api.data, cliBody, mcpBody]) {
      expect(b.ok).toBe(true)
      expect(b.selected).toBe(15)
      expect(b.truncated).toBe(true)
      expect(b.assumptions.length).toBeGreaterThan(0)
      expect(b.note).toMatch(/Nothing here is scheduled or reviewed for you/)
      expect(b.cards[0]!.lapses).toBeGreaterThanOrEqual(b.cards[14]!.lapses)
    }
    expect(cliBody.cards.map((c) => c.id)).toEqual(api.data.cards.map((c) => c.id))
    expect(mcpBody.cards.map((c) => c.id)).toEqual(api.data.cards.map((c) => c.id))
    expect(mcpBody.fingerprint).toBe(api.data.fingerprint)
  })

  it('prints a readable CLI session with the review link and assumptions', async () => {
    const cli = await runCli(
      ['study-session', 'preview', '--decks', String(deckId), '--limit', '5'],
      getActiveDbPath(),
    )
    expect(cli.exitCode).toBe(0)
    expect(cli.stdout).toContain('5 cards picked of')
    expect(cli.stdout).toContain('Open in the review queue: /review?cardIds=')
    expect(cli.stdout).toContain('How to read this')
    expect(cli.stdout).toMatch(/not a validated prediction/)
  })

  it('finds old tagged cards the newest-first browser limit would miss', async () => {
    const api = await callRoute<Body>(previewRoute.GET, {
      method: 'GET',
      query: { tags: 'ancient', limit: 100 },
    })
    expect(api.data.matched).toBe(6)
    expect(api.data.cards.map((c) => c.label).sort()).toEqual(
      ['Old0', 'Old1', 'Old2', 'Old3', 'Old4', 'Old5'].sort(),
    )
  })

  it('a full 100-card session opens in the review queue as exactly those cards, in order, and writes nothing', async () => {
    const before = (await db.select().from(cards)).length
    const api = await callRoute<Body>(previewRoute.GET, {
      method: 'GET',
      query: { deckIds: String(deckId), limit: 100 },
    })
    expect(api.data.selected).toBe(100)
    expect(api.data.truncated).toBe(true)
    const ids = api.data.cards.map((c) => c.id)
    expect(api.data.startHref).toBe(`/review?cardIds=${ids.join(',')}`)
    const q = await callRoute<ReviewBody>(reviewRoute.GET, {
      method: 'GET',
      query: { cardIds: ids.join(',') },
    })
    expect(q.status).toBe(200)
    expect(q.data.explicit).toBe(true)
    expect(q.data.cards!.map((c) => c.id)).toEqual(ids)
    expect(await db.select().from(revlog)).toHaveLength(0)
    expect(await db.select().from(cards)).toHaveLength(before)
  })

  it('a card changed after the preview is refused by the queue and changes the fingerprint', async () => {
    const first = await callRoute<Body>(previewRoute.GET, {
      method: 'GET',
      query: { deckIds: String(deckId), limit: 10 },
    })
    const ids = first.data.cards.map((c) => c.id)
    await db.update(cards).set({ suspended: true }).where(eq(cards.id, ids[3]!))
    const stale = await callRoute<ReviewBody>(reviewRoute.GET, {
      method: 'GET',
      query: { cardIds: ids.join(',') },
    })
    expect(stale.status).toBe(400)
    expect(stale.data.cardIds).toEqual([ids[3]])
    const again = await callRoute<Body>(previewRoute.GET, {
      method: 'GET',
      query: { deckIds: String(deckId), limit: 10 },
    })
    expect(again.data.fingerprint).not.toBe(first.data.fingerprint)
    expect(again.data.cards.map((c) => c.id)).not.toContain(ids[3])
    const fresh = await callRoute<ReviewBody>(reviewRoute.GET, {
      method: 'GET',
      query: { cardIds: again.data.cards.map((c) => c.id).join(',') },
    })
    expect(fresh.status).toBe(200)
    await db.update(cards).set({ suspended: false }).where(eq(cards.id, ids[3]!))
  })

  it('answering a card from a session goes through the ordinary review', async () => {
    const api = await callRoute<Body>(previewRoute.GET, {
      method: 'GET',
      query: { deckIds: String(deckId), limit: 5 },
    })
    const cardId = api.data.cards[0]!.id
    const post = await callRoute<{ ok: boolean }>(reviewRoute.POST, {
      method: 'POST',
      body: { cardId, grade: 3, confidence: 1 },
    })
    expect(post.status).toBe(200)
    expect(await db.select().from(revlog).where(eq(revlog.cardId, cardId))).toHaveLength(1)
  })

  it('rejects bad input the same way everywhere', async () => {
    const api = await callRoute<Body>(previewRoute.GET, { method: 'GET', query: { limit: 101 } })
    expect(api.status).toBe(400)
    const cli = await runCli(['study-session', 'preview', '--limit', '101'], getActiveDbPath())
    expect(cli.exitCode).not.toBe(0)
    const mcp = await client.callTool<Body>('study_session_preview', {
      limit: 100,
      recallBelow: 0.5,
    })
    expect(mcp.ok).toBe(true)
  })
})
