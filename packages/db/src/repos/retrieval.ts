/**
 * Retrieval-coverage repository — the read-only query behind the "Read but
 * never tested" panel (the fluency-illusion guard: reading without retrieval
 * practice feels like knowing but doesn't stick — Roediger & Karpicke 2006).
 *
 * Lists reading sources and notes that HAVE content but ZERO linked cards.
 * The link-back columns per surface:
 *  - note → card: `cards.note_id` (direct) or a minted `note_bullets.card_id`
 *    (RemNote pattern — any note bullet can BE a card);
 *  - source → card: `cards.source = 'sq3r:<sourceId>'` (SQ3R minting) or a
 *    triaged `highlights.card_id` of that source. Cards mined via the generic
 *    miner carry `source = 'mined'` with no per-source link, so those are
 *    honestly still reported as untested.
 *
 * Ranking policy (most-recently-opened first, cap 20) lives in
 * {@link rankUntestedMaterial} (@learning-hub/core/retrieval) — this module
 * only gathers facts, so web, MCP and CLI hosts share one definition.
 */
import { sql } from 'drizzle-orm'
import {
  rankUntestedMaterial,
  type UntestedKind,
  type UntestedMaterialRow,
} from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'

/** One panel row: the ranked core facts plus the mining excerpt and deep link. */
export interface UntestedMaterialItem extends UntestedMaterialRow {
  /** First characters of the content, whitespace-trimmed — the card miner's prefill. */
  excerpt: string
  /** Deep link to the surface that opens (and mines) this material. */
  href: string
}

/** Content sample handed to the card miner per row — keeps the payload light. */
const EXCERPT_CHARS = 2000

/** Deep links mirror the search repo's hrefs: sources open on /reading, notes on /notes. */
function hrefFor(kind: UntestedKind): string {
  return kind === 'source' ? '/reading' : '/notes'
}

/**
 * Sources and notes with content but zero linked cards, most-recently-opened
 * first (sources: `last_read_at` falling back to `added_at`; notes:
 * `updated_at` falling back to `created_at`), capped at `limit` (default 20).
 * Read-only — never writes. Empty list = everything tested; the panel says so.
 */
export function listUntestedMaterial(limit = 20, database?: LearningHubDB): UntestedMaterialItem[] {
  const db = database ?? getDb()

  // One UNION over both surfaces; NOT EXISTS keeps it a pure scan of the
  // link-back columns with no join fan-out. `trim` skips whitespace-only
  // content (notes default to '' and sources can hold blank extracted text).
  const rows = db.all<{
    kind: UntestedKind
    id: number
    title: string
    lastOpenedAt: string | null
    excerpt: string | null
  }>(sql`
    SELECT 'source' AS kind,
           s.id AS id,
           s.title AS title,
           coalesce(s.last_read_at, s.added_at) AS lastOpenedAt,
           substr(s.content, 1, ${EXCERPT_CHARS + 1}) AS excerpt
    FROM sources s
    WHERE trim(s.content) != ''
      AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.source = 'sq3r:' || s.id)
      AND NOT EXISTS (
        SELECT 1 FROM highlights h WHERE h.source_id = s.id AND h.card_id IS NOT NULL
      )
    UNION ALL
    SELECT 'note' AS kind,
           n.id AS id,
           n.title AS title,
           coalesce(n.updated_at, n.created_at) AS lastOpenedAt,
           substr(n.content, 1, ${EXCERPT_CHARS + 1}) AS excerpt
    FROM notes n
    WHERE trim(n.content) != ''
      AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.note_id = n.id)
      AND NOT EXISTS (
        SELECT 1 FROM note_bullets nb WHERE nb.note_id = n.id AND nb.card_id IS NOT NULL
      )
  `)

  const ranked = rankUntestedMaterial(rows, limit)
  return ranked.map((r) => ({
    kind: r.kind,
    id: r.id,
    // A blank title would fail the boundary schema (min 1) and take the whole panel down.
    title: r.title?.trim() || (r.kind === 'source' ? 'Untitled source' : 'Untitled note'),
    lastOpenedAt: r.lastOpenedAt,
    excerpt: (r.excerpt ?? '').trim().slice(0, EXCERPT_CHARS),
    href: hrefFor(r.kind),
  }))
}
