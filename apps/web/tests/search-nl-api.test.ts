/**
 * Search & Natural Language Search API handler integration tests (F-16)
 *
 * Verifies global search (GET /api/search) across knowledge surfaces,
 * natural language search (POST /api/search/nl) in manual mode,
 * and graceful fallback when AI is unavailable (Rule 9: every AI feature has a manual mode).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-search-test-')), 'search.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = {
  search: typeof import('../src/server/handlers/search/route')
  searchNl: typeof import('../src/server/handlers/search/nl/route')
  db: typeof import('@learning-hub/db')
}

let M: Modules

beforeAll(async () => {
  const dbMod = await import('@learning-hub/db')
  const searchMod = await import('../src/server/handlers/search/route')
  const searchNlMod = await import('../src/server/handlers/search/nl/route')
  M = { search: searchMod, searchNl: searchNlMod, db: dbMod }

  // Seed sample note and deck for search
  M.db.db
    .insert(M.db.notes)
    .values({
      title: 'Neuroscience and Synaptic Plasticity',
      content: 'Long term potentiation (LTP) is a persistent strengthening of synapses.',
    })
    .run()

  const [deck] = M.db.db
    .insert(M.db.decks)
    .values({ name: 'Cellular Biology Deck' })
    .returning()
    .all()

  M.db.db
    .insert(M.db.cards)
    .values({
      deckId: deck!.id,
      type: 'basic',
      content: { basic: { front: 'What is LTP?', back: 'Long term potentiation' } },
      due: new Date().toISOString(),
    })
    .run()
})

describe('Search & NL Search Handlers (/api/search, /api/search/nl)', () => {
  it('GET /api/search returns hits across notes and cards', async () => {
    const req = new Request('http://localhost/api/search?q=plasticity')
    const res = await M.search.GET(req)
    expect(res.status).toBe(200)

    const data = (await res.json()) as {
      ok: boolean
      hits: Array<{ kind: string; title: string }>
      mode: string
    }
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.hits)).toBe(true)
    expect(data.hits.some((h) => h.title.includes('Neuroscience'))).toBe(true)
  })

  it('GET /api/search handles empty query gracefully', async () => {
    const req = new Request('http://localhost/api/search?q=')
    const res = await M.search.GET(req)
    expect(res.status).toBe(200)
    const data = (await res.json()) as { ok: boolean; hits: unknown[] }
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.hits)).toBe(true)
  })

  it('POST /api/search/nl in mode="manual" executes deterministic keyword search plan', async () => {
    const req = new Request('http://localhost/api/search/nl', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question: 'synaptic potentiation',
        mode: 'manual',
      }),
    })

    const res = await M.searchNl.POST(req)
    expect(res.status).toBe(200)

    const data = (await res.json()) as {
      ok: boolean
      usedAI: boolean
      needsSetup: boolean
      plan: { queries: string[]; kinds: string[] }
      hits: unknown[]
    }
    expect(data.ok).toBe(true)
    expect(data.usedAI).toBe(false)
    expect(data.needsSetup).toBe(false)
    expect(data.plan.queries).toContain('synaptic potentiation')
    expect(Array.isArray(data.hits)).toBe(true)
  })

  it('POST /api/search/nl in mode="ai" falls back to manual plan when AI provider is not configured (Rule 9)', async () => {
    const req = new Request('http://localhost/api/search/nl', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question: 'How does LTP work in synapses?',
        mode: 'ai',
      }),
    })

    const res = await M.searchNl.POST(req)
    expect(res.status).toBe(200)

    const data = (await res.json()) as {
      ok: boolean
      usedAI: boolean
      needsSetup: boolean
      plan: { queries: string[] }
      hits: unknown[]
    }
    expect(data.ok).toBe(true)
    expect(data.usedAI).toBe(false)
    expect(data.needsSetup).toBe(true)
    expect(data.plan.queries).toContain('How does LTP work in synapses?')
    expect(Array.isArray(data.hits)).toBe(true)
  })
})
