/**
 * Learning HUB — Real-Time Cognitive Load Telemetry DB Repository.
 */
import { desc, eq } from 'drizzle-orm'
import { getDb, type LearningHubDB } from '../index'
import { cognitiveTelemetryEvents } from '../schema'

export function recordCognitiveTelemetryEvent(
  data: {
    cardId?: number
    responseLatencyMs: number
    hesitationVariance?: number
    editChurnCount?: number
    estimatedCli: number
    flowZone: string
    interventionApplied?: string
  },
  database?: LearningHubDB,
): typeof cognitiveTelemetryEvents.$inferSelect {
  const db = database ?? getDb()
  const nowIso = new Date().toISOString()

  const [row] = db
    .insert(cognitiveTelemetryEvents)
    .values({
      cardId: data.cardId,
      responseLatencyMs: data.responseLatencyMs,
      hesitationVariance: data.hesitationVariance,
      editChurnCount: data.editChurnCount ?? 0,
      estimatedCli: data.estimatedCli,
      flowZone: data.flowZone,
      interventionApplied: data.interventionApplied ?? 'none',
      createdAt: nowIso,
    })
    .returning()
    .all()

  return row!
}

export function getRecentCognitiveTelemetry(
  limit = 20,
  cardId?: number,
  database?: LearningHubDB,
): (typeof cognitiveTelemetryEvents.$inferSelect)[] {
  const db = database ?? getDb()

  if (cardId) {
    return db
      .select()
      .from(cognitiveTelemetryEvents)
      .where(eq(cognitiveTelemetryEvents.cardId, cardId))
      .orderBy(desc(cognitiveTelemetryEvents.createdAt))
      .limit(limit)
      .all()
  }

  return db
    .select()
    .from(cognitiveTelemetryEvents)
    .orderBy(desc(cognitiveTelemetryEvents.createdAt))
    .limit(limit)
    .all()
}
