/**
 * Learning HUB — Multi-Agent Dialectic Arena DB Repository.
 */
import { desc, eq } from 'drizzle-orm'
import type { DebateTurn } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { dialecticArenaDebates } from '../schema'

export function recordDialecticDebate(
  data: {
    topic: string
    thesisAgentRole: string
    antithesisAgentRole: string
    transcript: DebateTurn[]
    learnerVerdict?: string
    learnerScore?: number
  },
  database?: LearningHubDB,
): typeof dialecticArenaDebates.$inferSelect {
  const db = database ?? getDb()
  const nowIso = new Date().toISOString()

  const [row] = db
    .insert(dialecticArenaDebates)
    .values({
      topic: data.topic,
      thesisAgentRole: data.thesisAgentRole,
      antithesisAgentRole: data.antithesisAgentRole,
      transcript: data.transcript,
      learnerVerdict: data.learnerVerdict,
      learnerScore: data.learnerScore ?? 0,
      createdAt: nowIso,
    })
    .returning()
    .all()

  return row!
}

export function listDialecticDebates(
  limit = 20,
  database?: LearningHubDB,
): (typeof dialecticArenaDebates.$inferSelect)[] {
  const db = database ?? getDb()
  return db
    .select()
    .from(dialecticArenaDebates)
    .orderBy(desc(dialecticArenaDebates.createdAt))
    .limit(limit)
    .all()
}

export function getDialecticDebate(
  id: number,
  database?: LearningHubDB,
): typeof dialecticArenaDebates.$inferSelect | undefined {
  const db = database ?? getDb()
  return db.select().from(dialecticArenaDebates).where(eq(dialecticArenaDebates.id, id)).get()
}
