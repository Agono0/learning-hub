/**
 * Repository list functions must never turn an unvalidated limit into a full-table read:
 * SQLite treats LIMIT -1 (and a NULL-bound NaN) as unlimited.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_ROW_LIMIT, rowLimit } from '../../../packages/db/src/limits'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-rowlimit-')), 'r.db')

describe('rowLimit', () => {
  it('passes valid values through, floored', () => {
    expect(rowLimit(7)).toBe(7)
    expect(rowLimit(7.9)).toBe(7)
    expect(rowLimit(0)).toBe(0)
  })
  it('caps at the maximum', () => {
    expect(rowLimit(1e9)).toBe(MAX_ROW_LIMIT)
    expect(rowLimit(Infinity)).toBe(50)
  })
  it.each([-1, -100, NaN, -Infinity])('%s falls back to the default', (v) => {
    expect(rowLimit(v)).toBe(50)
    expect(rowLimit(v, 20)).toBe(20)
  })
  it('a default above the max is clamped too', () =>
    expect(rowLimit(NaN, 99_999)).toBe(MAX_ROW_LIMIT))
})

describe('repo list functions with a hostile limit', () => {
  let D: typeof import('@learning-hub/db')
  beforeAll(async () => {
    D = await import('@learning-hub/db')
    for (let i = 0; i < 120; i++)
      D.db
        .insert(D.notes)
        .values({ title: `n${i}`, content: 'x' })
        .run()
  })
  it.each([-1, NaN, -50])('listNotes(%s) stays bounded', (limit) => {
    const rows = D.listNotes({ limit })
    expect(rows.length).toBeLessThanOrEqual(50)
    expect(rows.length).toBeGreaterThan(0)
  })
  it('a valid limit is honoured', () => expect(D.listNotes({ limit: 5 })).toHaveLength(5))
})
