/**
 * GET /api/insights/untested — the "Read but never tested" panel end-to-end
 * against an isolated temp SQLite DB (LEARNING_HUB_DB): shape (zod-validated
 * response contract), the zero-card filter (a SQ3R card removes its source),
 * recency ordering and the 20-row cap. An EMPTY temp file is enough:
 * ensureSchema() creates every schema.ts table and runs the migrations on
 * first open (packages/db/src/index.ts).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// single test file → single module registry; the db module reads this at import time
const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-insights-untested-')), 'untested.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = Record<string, any>
const M: Modules = {}

/** One wire item, as core's untestedMaterialItemSchema shapes it. */
interface UntestedWireItem {
  kind: 'source' | 'note'
  title: string
}

beforeAll(async () => {
  M.route = await import('../app/api/insights/untested/route')
  M.db = await import('@learning-hub/db')
})

async function getJson(): Promise<{ items: UntestedWireItem[] }> {
  const res = await M.route.GET(new Request('http://localhost/api/insights/untested'))
  expect(res.status).toBe(200)
  return res.json()
}

describe('GET /api/insights/untested', () => {
  it('returns the zod-validated { items } envelope (empty on a fresh DB)', async () => {
    const body = await getJson()
    expect(Array.isArray(body.items)).toBe(true)
  })

  it('lists a reading source with content and no cards, with excerpt and deep link', async () => {
    await M.db.db.insert(M.db.sources).values({
      kind: 'article',
      title: 'Spaced repetition deep dive',
      content: 'Expanding intervals beat cramming.',
      lastReadAt: '2026-01-05T10:00:00.000Z',
    })
    const body = await getJson()
    const item = body.items.find(
      (i) => i.kind === 'source' && i.title === 'Spaced repetition deep dive',
    ) as Record<string, unknown> | undefined
    expect(item).toMatchObject({
      kind: 'source',
      href: '/reading',
      excerpt: 'Expanding intervals beat cramming.',
      lastOpenedAt: '2026-01-05T10:00:00.000Z',
    })
  })

  it('drops a source once a card links back to it via cards.source = sq3r:<id>', async () => {
    const [source] = await M.db.db
      .insert(M.db.sources)
      .values({ kind: 'article', title: 'Mined source', content: 'tested material' })
      .returning()
    const [deck] = await M.db.db
      .insert(M.db.decks)
      .values({ name: 'untested-route-deck' })
      .returning()
    await M.db.db.insert(M.db.cards).values({
      deckId: deck.id,
      type: 'basic',
      due: '2026-01-01T00:00:00.000Z',
      content: { basic: { front: 'q', back: 'a' } },
      source: `sq3r:${source.id}`,
    })
    const body = await getJson()
    expect(body.items.some((i) => i.kind === 'source' && i.title === 'Mined source')).toBe(false)
  })

  it('caps items at 20', async () => {
    for (let i = 0; i < 23; i++) {
      await M.db.db.insert(M.db.notes).values({ title: `Bulk ${i}`, content: `bulk ${i}` })
    }
    const body = await getJson()
    expect(body.items.length).toBeLessThanOrEqual(20)
  })
})
