/**
 * Search palette — logic-level contracts only (node env, NO DOM rendering;
 * written here, executed in CI — owner rule 17).
 *
 * Three seams:
 *  1. recent-searches pure helper (dedupe → front → cap) plus its
 *     window-guarded storage functions (in node they return [] / no-op —
 *     the palette must never crash without localStorage).
 *  2. Kind labels + SearchHit contract for all 17 kinds /api/search can
 *     return (palette and /search page render every one of them).
 *  3. DB-backed regression for the card-title fix: a card whose only
 *     content is a typein question used to render the bare fallback title
 *     ("card") when the hit landed on the question — the title coalesce now
 *     mirrors the migration-003 corpus and surfaces the question itself.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  clearRecentSearches,
  getRecentSearches,
  pushRecentSearch,
  rememberSearch,
  RECENT_SEARCH_LIMIT,
  saveRecentSearches,
} from '@/lib/recent-searches'
import { SEARCH_KIND_LABELS } from '@/lib/search-kinds'

// Isolated temp DB — must be set before any @learning-hub/db / '@/lib/db' import resolves.
process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-search-palette-')), 'api.db')

interface ApiHit {
  kind: string
  id: number
  title: string
  snippet: string
  href: string
}
interface ApiSearchResponse {
  ok: boolean
  hits: ApiHit[]
  mode: 'fts5' | 'like'
}

let getSearch: (req: Request) => Promise<Response>
let SEARCH_KINDS: readonly string[] = []

beforeAll(async () => {
  getSearch = (await import('@/server/handlers/search/route')).GET
  const { db, cards, decks, SEARCH_KINDS: kinds } = await import('@learning-hub/db')
  SEARCH_KINDS = kinds
  // One deck + one card whose ONLY searchable surface is the typein question
  // (cards.deckId is a required FK to decks; content is json; type: 'typein').
  db.insert(decks).values({ id: 1, name: 'Search Palette Deck' }).onConflictDoNothing().run()
  db.insert(cards)
    .values({
      id: 42,
      deckId: 1,
      type: 'typein',
      content: {
        typein: {
          question: 'What does FSRS stand for?',
          acceptedAnswers: ['Free Spaced Repetition Scheduler'],
        },
      },
      tags: [],
      state: 2,
      due: new Date().toISOString(),
      stability: 2,
      difficulty: 6,
    })
    .onConflictDoNothing()
    .run()
})

describe('recent-searches pure helper', () => {
  it('pushes newest first and caps the list at RECENT_SEARCH_LIMIT', () => {
    expect(pushRecentSearch([], 'fsrs weights')).toEqual(['fsrs weights'])
    const full = ['a1', 'b2', 'c3', 'd4', 'e5']
    expect(pushRecentSearch(full, 'f6')).toEqual(['f6', 'a1', 'b2', 'c3', 'd4'])
    expect(pushRecentSearch(full, 'f6')).toHaveLength(RECENT_SEARCH_LIMIT)
    expect(RECENT_SEARCH_LIMIT).toBe(5)
  })

  it('dedupes case-insensitively and moves the repeat to the front', () => {
    expect(pushRecentSearch(['FSRS review', 'cloze text'], 'fsrs REVIEW')).toEqual([
      'fsrs REVIEW',
      'cloze text',
    ])
    expect(pushRecentSearch(['FSRS review'], 'fsrs review')).toEqual(['fsrs review'])
  })

  it('trims the query and ignores sub-2-char or blank queries', () => {
    expect(pushRecentSearch([], '  fsrs  ')).toEqual(['fsrs'])
    expect(pushRecentSearch(['kept'], 'x')).toEqual(['kept'])
    expect(pushRecentSearch(['kept'], '   ')).toEqual(['kept'])
  })

  it('is pure — never mutates the input list', () => {
    const list = ['one two']
    pushRecentSearch(list, 'three four')
    expect(list).toEqual(['one two'])
  })
})

describe('recent-searches storage (window-guarded — node = [] / no-op)', () => {
  it('reads recents as [] without a window', () => {
    expect(getRecentSearches()).toEqual([])
  })

  it('save and clear are silent no-ops without a window', () => {
    expect(() => saveRecentSearches(['alpha beta'])).not.toThrow()
    expect(() => clearRecentSearches()).not.toThrow()
    expect(getRecentSearches()).toEqual([])
  })

  it('rememberSearch computes over empty storage but persists nothing in node', () => {
    // Pure part still computes (the palette contract), storage part degrades.
    expect(rememberSearch('alpha beta')).toEqual(['alpha beta'])
    expect(getRecentSearches()).toEqual([]) // device-local only — nothing stored
  })
})

describe('search kinds & labels', () => {
  it('labels exist for all kinds /api/search can return', () => {
    expect(SEARCH_KINDS).toHaveLength(17)
    expect(SEARCH_KINDS).toContain('note')
    expect(SEARCH_KINDS).toContain('card')
    for (const kind of SEARCH_KINDS) {
      expect(SEARCH_KIND_LABELS[kind], `missing label for kind "${kind}"`).toBeTruthy()
    }
  })
})

describe('/api/search — card titles mirror the FTS corpus (DB-backed, CI)', () => {
  it('surfaces a typein-only card by its question, not the fallback title', async () => {
    const res = await getSearch(
      new Request(
        `http://localhost/api/search?q=${encodeURIComponent('What does FSRS stand for?')}`,
      ),
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as ApiSearchResponse
    expect(data.ok).toBe(true)
    expect(['fts5', 'like']).toContain(data.mode)

    const hit = data.hits.find((h) => h.kind === 'card')
    expect(hit).toBeDefined()
    // SearchHit contract: kind ∈ known kinds, numeric id, non-empty title,
    // string snippet + deep link.
    expect(SEARCH_KINDS).toContain(hit!.kind)
    expect(typeof hit!.id).toBe('number')
    expect(typeof hit!.snippet).toBe('string')
    expect(typeof hit!.href).toBe('string')
    // The fix: the title is the typein question — never empty, never 'Card'.
    expect(hit!.title.trim().length).toBeGreaterThan(0)
    expect(hit!.title).toContain('What does FSRS stand for?')
  })
})
