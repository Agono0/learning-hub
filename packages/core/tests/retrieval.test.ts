/**
 * Retrieval-coverage ranking (the "Read but never tested" panel): pure policy
 * — most-recently-opened first, never-tracked rows last, deterministic
 * tie-breaks, capped output. No DB involved; the repo supplies the rows.
 */
import { describe, expect, it } from 'vitest'
import {
  rankUntestedMaterial,
  untestedMaterialItemSchema,
  untestedMaterialResponseSchema,
  type UntestedMaterialRow,
} from '../src/retrieval'

const row = (over: Partial<UntestedMaterialRow>): UntestedMaterialRow => ({
  kind: 'source',
  id: 1,
  title: 'A source',
  lastOpenedAt: null,
  ...over,
})

describe('rankUntestedMaterial', () => {
  it('orders most-recently-opened first regardless of input order', () => {
    const ranked = rankUntestedMaterial([
      row({ id: 1, lastOpenedAt: '2026-01-01T00:00:00.000Z' }),
      row({ id: 2, lastOpenedAt: '2026-03-01T00:00:00.000Z' }),
      row({ id: 3, lastOpenedAt: '2026-02-01T00:00:00.000Z' }),
    ])
    expect(ranked.map((r) => r.id)).toEqual([2, 3, 1])
  })

  it('ranks never-tracked rows after dated ones, deterministically', () => {
    const ranked = rankUntestedMaterial([
      row({ kind: 'note', id: 7, lastOpenedAt: null }),
      row({ kind: 'source', id: 9, lastOpenedAt: null }),
      row({ id: 1, lastOpenedAt: '2020-01-01T00:00:00.000Z' }),
    ])
    // dated first; the null rows fall back to kind-then-id order
    expect(ranked.map((r) => r.id)).toEqual([1, 7, 9])
  })

  it('treats unparseable timestamps like missing ones (nulls last)', () => {
    const ranked = rankUntestedMaterial([
      row({ id: 1, lastOpenedAt: 'not-a-date' }),
      row({ id: 2, lastOpenedAt: '2026-01-01T00:00:00.000Z' }),
    ])
    expect(ranked.map((r) => r.id)).toEqual([2, 1])
  })

  it('breaks recency ties by kind then id (stable across renders)', () => {
    const tie = '2026-05-01T00:00:00.000Z'
    const ranked = rankUntestedMaterial([
      row({ kind: 'source', id: 2, lastOpenedAt: tie }),
      row({ kind: 'note', id: 3, lastOpenedAt: tie }),
      row({ kind: 'note', id: 1, lastOpenedAt: tie }),
    ])
    expect(ranked.map((r) => `${r.kind}:${r.id}`)).toEqual(['note:1', 'note:3', 'source:2'])
  })

  it('caps at the limit (default 20) and keeps the top of the ranking', () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      row({ id: i + 1, lastOpenedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString() }),
    )
    expect(rankUntestedMaterial(rows)).toHaveLength(20)
    // newest day (Jan 30) first
    expect(rankUntestedMaterial(rows)[0]!.id).toBe(30)
    expect(rankUntestedMaterial(rows, 3)).toHaveLength(3)
    expect(rankUntestedMaterial(rows, 0)).toEqual([])
  })

  it('does not mutate the input array and preserves extra columns', () => {
    const rows = [
      {
        ...row({ id: 1, lastOpenedAt: '2026-01-01T00:00:00.000Z' }),
        excerpt: 'hello',
        href: '/reading',
      },
      {
        ...row({ id: 2, lastOpenedAt: '2026-02-01T00:00:00.000Z' }),
        excerpt: 'hi',
        href: '/notes',
      },
    ]
    const copy = [...rows]
    const ranked = rankUntestedMaterial(rows)
    expect(rows).toEqual(copy)
    expect(ranked[0]!.excerpt).toBe('hi')
    expect(ranked[0]!.href).toBe('/notes')
  })

  it('returns an empty list for no candidates', () => {
    expect(rankUntestedMaterial([])).toEqual([])
  })
})

describe('wire schemas', () => {
  const item = {
    kind: 'source',
    id: 3,
    title: 'Spaced repetition deep dive',
    lastOpenedAt: '2026-01-05T10:00:00.000Z',
    excerpt: 'Expanding intervals beat cramming.',
    href: '/reading',
  }

  it('accepts a well-formed response', () => {
    const parsed = untestedMaterialResponseSchema.parse({ items: [item] })
    expect(parsed.items).toHaveLength(1)
  })

  it('allows a null lastOpenedAt but rejects unknown kinds and missing hrefs', () => {
    expect(() => untestedMaterialItemSchema.parse({ ...item, lastOpenedAt: null })).not.toThrow()
    expect(() => untestedMaterialItemSchema.parse({ ...item, kind: 'lesson' })).toThrow()
    expect(() => untestedMaterialItemSchema.parse({ ...item, href: '' })).toThrow()
    expect(() => untestedMaterialItemSchema.parse({ ...item, id: 0 })).toThrow()
  })
})
