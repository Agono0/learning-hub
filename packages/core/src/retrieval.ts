/**
 * Retrieval-coverage ranking — the pure half of the "Read but never tested"
 * panel (the fluency-illusion guard). Rereading feels like knowing (perceptual
 * fluency), but only retrieval changes memory (Roediger & Karpicke 2006,
 * g≈0.61 Adesope 2017 — docs/learning-science.md "Testing effect"). This module
 * takes material rows the database already filtered to "zero linked cards" and
 * ranks them most-recently-opened first: what you touched last is what you are
 * most likely to *think* you know. No DB imports — the server hands rows in,
 * keeping the ranking testable without SQLite.
 */
import { z } from 'zod'

/** Which content surface a candidate row came from. */
export type UntestedKind = 'source' | 'note'

/**
 * One candidate material the repo already established has content but zero
 * linked cards (`kind: 'source'` → reading sources via `cards.source =
 * 'sq3r:<id>'` / a triaged highlight card; `kind: 'note'` → notes via
 * `cards.note_id` / a minted note bullet). `lastOpenedAt` is ISO-8601 or null
 * when the surface never tracks an open timestamp.
 */
export interface UntestedMaterialRow {
  kind: UntestedKind
  id: number
  title: string
  /** ISO-8601 instant the learner last opened it; null = never tracked (ranks last). */
  lastOpenedAt: string | null
}

/** Parse an ISO timestamp to epoch ms; unparseable/null → null (ranks last). */
function recencyMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/**
 * Rank untested material most-recently-opened first, capped at `limit`
 * (default 20). Dated rows beat never-tracked ones; ties break deterministically
 * by kind then id so the panel never flickers between renders. Generic over the
 * row type so callers can carry extra columns (excerpt, href) through untouched.
 */
export function rankUntestedMaterial<T extends UntestedMaterialRow>(
  rows: readonly T[],
  limit = 20,
): T[] {
  const capped = Math.max(0, Math.floor(limit))
  return [...rows]
    .sort((a, b) => {
      const ra = recencyMs(a.lastOpenedAt)
      const rb = recencyMs(b.lastOpenedAt)
      if (ra !== rb) return (rb ?? -Infinity) - (ra ?? -Infinity) // nulls last
      if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1
      return a.id - b.id
    })
    .slice(0, capped)
}

// ─── Wire schemas (the API route validates its response with these) ─────────

/** One panel row as it travels over the wire. */
export const untestedMaterialItemSchema = z.object({
  kind: z.enum(['source', 'note']),
  id: z.number().int().positive(),
  title: z.string().min(1),
  /** ISO-8601 or null — shown as "opened <date>" context, never as a promise. */
  lastOpenedAt: z.string().nullable(),
  /** Truncated content sample the card miner pre-fills from (repo slices it). */
  excerpt: z.string(),
  /** Deep link to the surface where the material is opened and mined. */
  href: z.string().min(1),
})

/** Full GET /api/insights/untested response, validated at the boundary before returning. */
export const untestedMaterialResponseSchema = z.object({
  items: z.array(untestedMaterialItemSchema),
})
