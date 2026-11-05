/**
 * Global search (M5): FTS5 across notes, cards, lessons, highlights and ideas
 * with a graceful LIKE fallback when FTS5 is unavailable (e.g. a wasm build
 * compiled without it). Read-only — the shadow tables are maintained by the
 * migration's triggers (003-fts-search).
 */
import { sql } from 'drizzle-orm'
import type { LearningHubDB } from '../index'

export type SearchKind = 'note' | 'card' | 'lesson' | 'highlight' | 'idea'

export interface SearchHit {
  kind: SearchKind
  id: number
  title: string
  snippet: string
  /** deep link for the palette (query params included; static-export safe) */
  href: string
}

export interface SearchResult {
  hits: SearchHit[]
  /** which engine answered — surfaced in the UI for honesty */
  mode: 'fts5' | 'like'
}

const PER_KIND = 8

/** Build an OR-of-prefix-terms MATCH expression; empty for no tokens. */
export function ftsExpression(query: string): string {
  const tokens = query
    .split(/\s+/)
    .map((t) => t.replace(/["*()]/g, '').trim())
    .filter((t) => t.length > 0)
    .slice(0, 6)
  return tokens.map((t) => `"${t}"*`).join(' OR ')
}

export function searchAll(db: LearningHubDB, query: string, limit = 24): SearchResult {
  const q = query.trim()
  if (!q) return { hits: [], mode: 'fts5' }

  // FTS5 first; fall back to LIKE when the shadow tables are missing
  let ftsAvailable = false
  try {
    const probe = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fts_notes'`,
    )
    ftsAvailable = probe.length > 0
  } catch {
    ftsAvailable = false
  }

  if (ftsAvailable) {
    const match = ftsExpression(q)
    if (!match) return { hits: [], mode: 'fts5' }
    const hits: SearchHit[] = []
    const collect = (kind: SearchKind, ftsTable: string, joinSql: ReturnType<typeof sql>): void => {
      const rows = db.all<{ id: number; title: string; snippet: string }>(
        sql`SELECT s.id AS id, s.title AS title,
              snippet(${sql.raw(ftsTable)}, 1, '', '', '…', 12) AS snippet
            FROM ${sql.raw(ftsTable)} f
            JOIN (${joinSql}) s ON s.id = f.ref
            WHERE ${sql.raw(ftsTable)} MATCH ${match}
            LIMIT ${PER_KIND}`,
      )
      for (const r of rows)
        hits.push({ kind, id: r.id, title: r.title, snippet: r.snippet, href: hrefFor(kind, r.id) })
    }
    collect('note', 'fts_notes', sql`SELECT id, title FROM notes`)
    collect(
      'card',
      'fts_cards',
      sql`SELECT id, substr(coalesce(json_extract(content, '$.basic.front'),
            coalesce(json_extract(content, '$.mcq.question'),
            coalesce(json_extract(content, '$.cloze.text'), 'card'))), 1, 80) AS title FROM cards`,
    )
    collect('lesson', 'fts_lessons', sql`SELECT id, title FROM lessons`)
    collect(
      'highlight',
      'fts_highlights',
      sql`SELECT id, substr(coalesce(text, ''), 1, 80) AS title FROM highlights`,
    )
    collect('idea', 'fts_ideas', sql`SELECT id, title FROM ideas`)
    return { hits: hits.slice(0, limit), mode: 'fts5' }
  }

  // LIKE fallback — substring match, same surfaces
  const like = `%${q.replace(/[%_]/g, '')}%`
  const hits: SearchHit[] = []
  const push = (kind: SearchKind, rows: { id: number; title: string }[]) => {
    for (const r of rows)
      hits.push({ kind, id: r.id, title: r.title, snippet: r.title, href: hrefFor(kind, r.id) })
  }
  push(
    'note',
    db.all<{ id: number; title: string }>(
      sql`SELECT id, title FROM notes WHERE title LIKE ${like} OR content LIKE ${like} LIMIT ${PER_KIND}`,
    ),
  )
  push(
    'card',
    db.all<{ id: number; title: string }>(
      sql`SELECT id, substr(coalesce(json_extract(content, '$.basic.front'), coalesce(json_extract(content, '$.mcq.question'), coalesce(json_extract(content, '$.cloze.text'), '?'))), 1, 80) AS title FROM cards WHERE content LIKE ${like} OR coalesce(tags, '') LIKE ${like} LIMIT ${PER_KIND}`,
    ),
  )
  push(
    'lesson',
    db.all<{ id: number; title: string }>(
      sql`SELECT id, title FROM lessons WHERE title LIKE ${like} OR content LIKE ${like} LIMIT ${PER_KIND}`,
    ),
  )
  push(
    'highlight',
    db.all<{ id: number; title: string }>(
      sql`SELECT id, substr(coalesce(text, ''), 1, 80) AS title FROM highlights WHERE text LIKE ${like} OR note LIKE ${like} LIMIT ${PER_KIND}`,
    ),
  )
  push(
    'idea',
    db.all<{ id: number; title: string }>(
      sql`SELECT id, title FROM ideas WHERE title LIKE ${like} OR content LIKE ${like} LIMIT ${PER_KIND}`,
    ),
  )
  return { hits: hits.slice(0, limit), mode: 'like' }
}

/** Palette deep links per hit kind. */
function hrefFor(kind: SearchKind, id: number): string {
  switch (kind) {
    case 'note':
      return '/notes'
    case 'card':
      return '/decks'
    case 'lesson':
      return `/courses/lesson?id=${id}`
    case 'highlight':
      return '/reading'
    case 'idea':
      return '/ideas'
  }
}
