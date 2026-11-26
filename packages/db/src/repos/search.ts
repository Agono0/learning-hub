/**
 * Global search: FTS5 across the whole knowledge base — notes, cards, lessons,
 * highlights, ideas (migration 003) plus journal entries, quotes, reading
 * sources, projects, mindmaps, canvases, memory palaces, WOOP goals, habits,
 * quick captures, SQ3R sessions and tutor/feynman chats (migration 018) — with
 * a graceful LIKE fallback when FTS5 is unavailable (e.g. a wasm build compiled
 * without it). Read-only — the shadow tables are maintained by migrations.
 */
import { sql } from 'drizzle-orm'
import type { LearningHubDB } from '../index'

export type SearchKind =
  | 'note'
  | 'card'
  | 'lesson'
  | 'highlight'
  | 'idea'
  | 'journal'
  | 'quote'
  | 'source'
  | 'project'
  | 'mindmap'
  | 'canvas'
  | 'palace'
  | 'goal'
  | 'habit'
  | 'capture'
  | 'sq3r'
  | 'chat'

export const SEARCH_KINDS: readonly SearchKind[] = [
  'note',
  'card',
  'lesson',
  'highlight',
  'idea',
  'journal',
  'quote',
  'source',
  'project',
  'mindmap',
  'canvas',
  'palace',
  'goal',
  'habit',
  'capture',
  'sq3r',
  'chat',
]

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

// FTS candidates of one kind are ordered by SQLite's bm25(), where a LOWER value is a better
// match (the scores are negative), with the FTS rowid as a stable tie break. bm25 scores are
// only compared inside one kind's table, never across kinds: hits stay grouped in SPECS order.

/** Per-kind source query (id + title), FTS join and LIKE fallback, deep link. */
interface KindSpec {
  kind: SearchKind
  fts: string
  /** title + WHERE columns for the LIKE fallback */
  like: (like: string) => ReturnType<typeof sql>
  title: ReturnType<typeof sql>
  href: (id: number) => string
}

const SPECS: KindSpec[] = [
  {
    kind: 'note',
    fts: 'fts_notes',
    like: (like) =>
      sql`SELECT id, title FROM notes WHERE title LIKE ${like} OR content LIKE ${like}`,
    title: sql`SELECT id, title FROM notes`,
    href: () => '/notes',
  },
  {
    kind: 'card',
    // Title coalesce mirrors the migration-003 FTS corpus (front → cloze →
    // mcq → typein → grammar) so a hit on an answer/question surfaces the text
    // that matched instead of a bare fallback.
    fts: 'fts_cards',
    like: (like) =>
      sql`SELECT id, substr(coalesce(json_extract(content, '$.basic.front'), coalesce(json_extract(content, '$.cloze.text'), coalesce(json_extract(content, '$.mcq.question'), coalesce(json_extract(content, '$.typein.question'), coalesce(json_extract(content, '$.grammar.sentence'), 'Card'))))), 1, 80) AS title FROM cards WHERE content LIKE ${like} OR coalesce(tags, '') LIKE ${like}`,
    title: sql`SELECT id, substr(coalesce(json_extract(content, '$.basic.front'),
          coalesce(json_extract(content, '$.cloze.text'),
          coalesce(json_extract(content, '$.mcq.question'),
          coalesce(json_extract(content, '$.typein.question'),
          coalesce(json_extract(content, '$.grammar.sentence'), 'Card'))))), 1, 80) AS title FROM cards`,
    href: () => '/decks',
  },
  {
    kind: 'lesson',
    fts: 'fts_lessons',
    like: (like) =>
      sql`SELECT id, title FROM lessons WHERE title LIKE ${like} OR content LIKE ${like}`,
    title: sql`SELECT id, title FROM lessons`,
    href: (id) => `/courses/lesson?id=${id}`,
  },
  {
    kind: 'highlight',
    fts: 'fts_highlights',
    like: (like) =>
      sql`SELECT id, substr(coalesce(text, ''), 1, 80) AS title FROM highlights WHERE text LIKE ${like} OR note LIKE ${like}`,
    title: sql`SELECT id, substr(coalesce(text, ''), 1, 80) AS title FROM highlights`,
    href: () => '/reading',
  },
  {
    kind: 'idea',
    fts: 'fts_ideas',
    like: (like) =>
      sql`SELECT id, title FROM ideas WHERE title LIKE ${like} OR content LIKE ${like}`,
    title: sql`SELECT id, title FROM ideas`,
    href: () => '/ideas',
  },
  {
    kind: 'journal',
    fts: 'fts_journal',
    like: (like) =>
      sql`SELECT id, 'Journal — ' || date AS title FROM journal_entries WHERE coalesce(small_wins, '') || ' ' || coalesce(gratitude, '') || ' ' || coalesce(worry_dump, '') LIKE ${like}`,
    title: sql`SELECT id, 'Journal — ' || date AS title FROM journal_entries`,
    href: () => '/journal',
  },
  {
    kind: 'quote',
    fts: 'fts_quotes',
    like: (like) =>
      sql`SELECT id, substr(coalesce(text, ''), 1, 80) AS title FROM quotes WHERE text LIKE ${like} OR author LIKE ${like} OR coalesce(context, '') LIKE ${like}`,
    title: sql`SELECT id, substr(coalesce(text, ''), 1, 80) AS title FROM quotes`,
    href: () => '/quotes',
  },
  {
    kind: 'source',
    fts: 'fts_sources',
    like: (like) =>
      sql`SELECT id, title FROM sources WHERE title LIKE ${like} OR content LIKE ${like}`,
    title: sql`SELECT id, title FROM sources`,
    href: () => '/reading',
  },
  {
    kind: 'project',
    fts: 'fts_projects',
    like: (like) =>
      sql`SELECT id, title FROM projects WHERE title LIKE ${like} OR coalesce(description, '') LIKE ${like}`,
    title: sql`SELECT id, title FROM projects`,
    href: () => '/courses',
  },
  {
    kind: 'mindmap',
    fts: 'fts_mindmaps',
    like: (like) =>
      sql`SELECT id, title FROM mindmaps WHERE title LIKE ${like} OR coalesce(nodes_json, '') LIKE ${like}`,
    title: sql`SELECT id, title FROM mindmaps`,
    href: () => '/mindmap',
  },
  {
    kind: 'canvas',
    fts: 'fts_canvases',
    like: (like) =>
      sql`SELECT id, title FROM canvases WHERE title LIKE ${like} OR coalesce(items, '') LIKE ${like}`,
    title: sql`SELECT id, title FROM canvases`,
    href: () => '/canvas',
  },
  {
    kind: 'palace',
    fts: 'fts_palaces',
    like: (like) =>
      sql`SELECT id, name AS title FROM palaces WHERE name LIKE ${like} OR coalesce(description, '') LIKE ${like}`,
    title: sql`SELECT id, name AS title FROM palaces`,
    href: () => '/palace',
  },
  {
    kind: 'goal',
    fts: 'fts_goals',
    like: (like) =>
      sql`SELECT id, substr(coalesce(wish, ''), 1, 80) AS title FROM goals WHERE wish LIKE ${like} OR coalesce(outcome, '') LIKE ${like} OR coalesce(obstacle, '') LIKE ${like} OR coalesce(if_then_plan, '') LIKE ${like}`,
    title: sql`SELECT id, substr(coalesce(wish, ''), 1, 80) AS title FROM goals`,
    href: () => '/motivation',
  },
  {
    kind: 'habit',
    fts: 'fts_habits',
    like: (like) =>
      sql`SELECT id, name AS title FROM habits WHERE name LIKE ${like} OR coalesce(cue, '') LIKE ${like} OR coalesce(response, '') LIKE ${like}`,
    title: sql`SELECT id, name AS title FROM habits`,
    href: () => '/habits',
  },
  {
    kind: 'capture',
    fts: 'fts_captures',
    like: (like) =>
      sql`SELECT id, substr(coalesce(text, ''), 1, 80) AS title FROM quick_captures WHERE text LIKE ${like} OR coalesce(tags, '') LIKE ${like} OR coalesce(source_title, '') LIKE ${like}`,
    title: sql`SELECT id, substr(coalesce(text, ''), 1, 80) AS title FROM quick_captures`,
    href: () => '/',
  },
  {
    kind: 'sq3r',
    fts: 'fts_sq3r',
    like: (like) =>
      sql`SELECT id, substr(coalesce(nullif(questions, ''), 'SQ3R session'), 1, 80) AS title FROM sq3r_sessions WHERE coalesce(questions, '') LIKE ${like} OR coalesce(survey_headings, '') LIKE ${like} OR coalesce(recite_notes, '') LIKE ${like}`,
    title: sql`SELECT id, substr(coalesce(nullif(questions, ''), 'SQ3R session'), 1, 80) AS title FROM sq3r_sessions`,
    href: () => '/reading',
  },
  {
    kind: 'chat',
    fts: 'fts_chats',
    like: (like) =>
      sql`SELECT id, coalesce(nullif(title, ''), kind) AS title FROM chat_sessions WHERE coalesce(title, '') LIKE ${like} OR coalesce(messages, '') LIKE ${like}`,
    title: sql`SELECT id, coalesce(nullif(title, ''), kind) AS title FROM chat_sessions`,
    href: () => '/tutor',
  },
]

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
  // A NUL (or other C0 control) in the term makes SQLite fail with "unterminated string" (500).
  const q = query.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
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
    for (const spec of SPECS) {
      // Only query kinds whose shadow table actually exists (older databases
      // created before migration 018 pre-apply still work mid-migration).
      const exists = db.all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${spec.fts}`,
      )
      if (exists.length === 0) continue
      const rows = db.all<{ id: number; title: string; snippet: string }>(
        sql`SELECT s.id AS id, s.title AS title,
              snippet(${sql.raw(spec.fts)}, 1, '', '', '…', 12) AS snippet
            FROM ${sql.raw(spec.fts)} f
            JOIN (${spec.title}) s ON s.id = f.ref
            WHERE ${sql.raw(spec.fts)} MATCH ${match}
            ORDER BY bm25(${sql.raw(spec.fts)}) ASC, f.rowid ASC
            LIMIT ${PER_KIND}`,
      )
      for (const r of rows)
        hits.push({
          kind: spec.kind,
          id: r.id,
          title: r.title,
          snippet: r.snippet,
          href: spec.href(r.id),
        })
    }
    return { hits: hits.slice(0, limit), mode: 'fts5' }
  }

  // LIKE fallback — substring match over the same surfaces
  const like = `%${q.replace(/[%_]/g, '')}%`
  const hits: SearchHit[] = []
  for (const spec of SPECS) {
    const rows = db.all<{ id: number; title: string }>(spec.like(like))
    for (const r of rows)
      hits.push({
        kind: spec.kind,
        id: r.id,
        title: r.title,
        snippet: r.title,
        href: spec.href(r.id),
      })
  }
  return { hits: hits.slice(0, limit), mode: 'like' }
}
