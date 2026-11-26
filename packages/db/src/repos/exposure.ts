/**
 * Learning HUB — Ambient Exposure Ledger Repository:
 * Reusable persistence and query helpers for incidental encounters of vocabulary
 * and technical terms across reading, notes, and lessons.
 *
 * `exposure_events` is append-only; every row is one encounter. Rollups
 * (counts, distinct days) are computed at read time so the promotion rule in
 * `@learning-hub/core/exposure` stays the single source of truth.
 */
import { rowLimit } from '../limits'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { meetsPromotionThreshold, normalizeExposureToken } from '@learning-hub/core/exposure'
import { getDb, type LearningHubDB } from '../index'
import { cards, exposureEvents } from '../schema'

export type ExposureSourceType = 'reading' | 'note' | 'lesson'

export interface WordEncounterSummary {
  normalized: string
  sampleToken: string
  encounterCount: number
  firstSeen: string
  lastSeen: string
  distinctDays: number
  /** Meets the Waring & Nation spaced-encounter threshold. */
  eligibleForPromotion: boolean
  /** A basic card whose front is this word already exists (don't offer promotion). */
  isAlreadyCard: boolean
}

/** FSRS state 2 = Review: the learner has graduated the card at least once. */
const FSRS_STATE_REVIEW = 2

/** SQL expression: the normalized basic-card front, or NULL for other card types. */
const cardFrontKey = sql<
  string | null
>`lower(trim(json_extract(${cards.content}, '$.basic.front')))`

/**
 * Returns the subset of `normalized` keys that already exist as a basic card front.
 * Empty input → empty set (no query).
 */
export function findCardFronts(normalized: string[], database?: LearningHubDB): Set<string> {
  const out = new Set<string>()
  if (normalized.length === 0) return out
  const db = database ?? getDb()
  const rows = db
    .select({ key: cardFrontKey })
    .from(cards)
    .where(and(eq(cards.type, 'basic'), inArray(cardFrontKey, normalized)))
    .all()
  for (const r of rows) if (r.key) out.add(r.key)
  return out
}

/** Records one encounter. Throws if the token is blank after normalization. */
export function recordExposure(
  data: {
    token: string
    sourceType?: ExposureSourceType
    sourceId?: number
    contextSnippet?: string
  },
  database?: LearningHubDB,
): typeof exposureEvents.$inferSelect {
  const db = database ?? getDb()
  const normalized = normalizeExposureToken(data.token)
  if (!normalized) throw new Error('exposure token is empty')

  const [row] = db
    .insert(exposureEvents)
    .values({
      token: data.token.trim(),
      normalized,
      sourceType: data.sourceType ?? 'reading',
      sourceId: data.sourceId,
      contextSnippet: data.contextSnippet,
      createdAt: new Date().toISOString(),
    })
    .returning()
    .all()

  return row!
}

/**
 * Records many encounters in one INSERT (atomic). Blank tokens are skipped.
 * Returns the number of rows written.
 */
export function recordExposureBatch(
  tokens: string[],
  meta: {
    sourceType?: ExposureSourceType
    sourceId?: number
    contextSnippet?: string
  } = {},
  database?: LearningHubDB,
): number {
  const nowIso = new Date().toISOString()
  const rows = tokens
    .map((token) => ({ token: token.trim(), normalized: normalizeExposureToken(token) }))
    .filter((r) => r.normalized.length > 0)
    .map((r) => ({
      ...r,
      sourceType: meta.sourceType ?? 'reading',
      sourceId: meta.sourceId,
      contextSnippet: meta.contextSnippet,
      createdAt: nowIso,
    }))
  if (rows.length === 0) return 0

  const db = database ?? getDb()
  return db.insert(exposureEvents).values(rows).run().changes
}

/**
 * Per-word encounter rollup, most-encountered first, with promotion
 * eligibility and whether a card already exists for the word.
 */
export function getWordExposureSummaries(
  limit = 50,
  database?: LearningHubDB,
): WordEncounterSummary[] {
  const db = database ?? getDb()

  const count = sql<number>`count(${exposureEvents.id})`
  const rows = db
    .select({
      normalized: exposureEvents.normalized,
      sampleToken: sql<string>`min(${exposureEvents.token})`,
      encounterCount: count,
      firstSeen: sql<string>`min(${exposureEvents.createdAt})`,
      lastSeen: sql<string>`max(${exposureEvents.createdAt})`,
      distinctDays: sql<number>`count(distinct substr(${exposureEvents.createdAt}, 1, 10))`,
    })
    .from(exposureEvents)
    .groupBy(exposureEvents.normalized)
    .orderBy(desc(count), desc(sql`max(${exposureEvents.createdAt})`))
    .limit(rowLimit(limit))
    .all()

  const existing = findCardFronts(
    rows.map((r) => r.normalized),
    db,
  )

  return rows.map((r) => {
    const encounterCount = Number(r.encounterCount)
    const distinctDays = Number(r.distinctDays)
    return {
      normalized: r.normalized,
      sampleToken: r.sampleToken,
      encounterCount,
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
      distinctDays,
      eligibleForPromotion: meetsPromotionThreshold(encounterCount, distinctDays),
      isAlreadyCard: existing.has(r.normalized),
    }
  })
}

/**
 * The learner's "known" lexicon for coverage analysis: words met often enough
 * to be familiar (≥ the promotion encounter count), plus basic-card fronts
 * that have graduated to FSRS Review state.
 */
export function getKnownTokensSet(database?: LearningHubDB, minEncounters = 5): Set<string> {
  const db = database ?? getDb()
  const known = new Set<string>()

  const frequent = db
    .select({ normalized: exposureEvents.normalized })
    .from(exposureEvents)
    .groupBy(exposureEvents.normalized)
    .having(sql`count(${exposureEvents.id}) >= ${minEncounters}`)
    .all()
  for (const row of frequent) known.add(row.normalized)

  const learned = db
    .select({ key: cardFrontKey })
    .from(cards)
    .where(and(eq(cards.type, 'basic'), gte(cards.state, FSRS_STATE_REVIEW)))
    .all()
  for (const row of learned) {
    // Only single-word fronts are lexical items; sentences would never match a token.
    if (row.key && !/\s/.test(row.key)) known.add(normalizeExposureToken(row.key))
  }

  return known
}
