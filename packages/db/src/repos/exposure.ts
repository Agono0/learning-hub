/**
 * Learning HUB — Ambient Exposure Ledger Repository:
 * Reusable persistence and query helpers for incidental encounters of vocabulary
 * and technical terms across reading, notes, and lessons.
 */
import { desc, eq, sql } from 'drizzle-orm'
import { getDb, type LearningHubDB } from '../index'
import { exposureEvents, cards } from '../schema'
import { isEligibleForSrsPromotion } from '@learning-hub/core/exposure'

export interface WordEncounterSummary {
  normalized: string
  sampleToken: string
  encounterCount: number
  firstSeen: string
  lastSeen: string
  distinctDays: number
  eligibleForPromotion: boolean
  isAlreadyCard: boolean
}

export function recordExposure(
  data: {
    token: string
    sourceType?: 'reading' | 'note' | 'lesson'
    sourceId?: number
    contextSnippet?: string
  },
  database?: LearningHubDB,
): typeof exposureEvents.$inferSelect {
  const db = database ?? getDb()
  const normalized = data.token.toLowerCase().trim()
  const nowIso = new Date().toISOString()

  const [row] = db
    .insert(exposureEvents)
    .values({
      token: data.token.trim(),
      normalized,
      sourceType: data.sourceType ?? 'reading',
      sourceId: data.sourceId,
      contextSnippet: data.contextSnippet,
      createdAt: nowIso,
    })
    .returning()
    .all()

  return row!
}

export function recordExposureBatch(
  tokens: string[],
  meta: {
    sourceType?: 'reading' | 'note' | 'lesson'
    sourceId?: number
    contextSnippet?: string
  } = {},
  database?: LearningHubDB,
): number {
  const db = database ?? getDb()
  if (tokens.length === 0) return 0
  const nowIso = new Date().toISOString()

  const rows = tokens.map((token) => ({
    token: token.trim(),
    normalized: token.toLowerCase().trim(),
    sourceType: meta.sourceType ?? 'reading',
    sourceId: meta.sourceId,
    contextSnippet: meta.contextSnippet,
    createdAt: nowIso,
  }))

  const result = db.insert(exposureEvents).values(rows).run()
  return result.changes
}

export function getWordExposureSummaries(
  limit = 50,
  database?: LearningHubDB,
): WordEncounterSummary[] {
  const db = database ?? getDb()

  // Aggregate encounters per normalized token
  const rows = db
    .select({
      normalized: exposureEvents.normalized,
      sampleToken: sql<string>`min(${exposureEvents.token})`,
      encounterCount: sql<number>`count(${exposureEvents.id})`,
      firstSeen: sql<string>`min(${exposureEvents.createdAt})`,
      lastSeen: sql<string>`max(${exposureEvents.createdAt})`,
      distinctDays: sql<number>`count(distinct substr(${exposureEvents.createdAt}, 1, 10))`,
    })
    .from(exposureEvents)
    .groupBy(exposureEvents.normalized)
    .orderBy(desc(sql`count(${exposureEvents.id})`))
    .limit(limit)
    .all()

  return rows.map((r) => {
    const encounters = Number(r.encounterCount)
    const distinctDays = Number(r.distinctDays)
    const eligible = encounters >= 5 && distinctDays >= 3

    return {
      normalized: r.normalized,
      sampleToken: r.sampleToken,
      encounterCount: encounters,
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
      distinctDays,
      eligibleForPromotion: eligible,
      isAlreadyCard: false, // Can be cross-referenced with card front/back if needed
    }
  })
}

export function getKnownTokensSet(database?: LearningHubDB): Set<string> {
  const db = database ?? getDb()
  const known = new Set<string>()

  // Frequent exposures (>= 5 encounters) are treated as familiar
  const frequentExposures = db
    .select({
      normalized: exposureEvents.normalized,
    })
    .from(exposureEvents)
    .groupBy(exposureEvents.normalized)
    .having(sql`count(${exposureEvents.id}) >= 5`)
    .all()

  for (const row of frequentExposures) {
    known.add(row.normalized)
  }

  return known
}
