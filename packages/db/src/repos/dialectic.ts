/**
 * Learning HUB — Multi-Agent Dialectic Arena DB Repository.
 */
import { desc, eq } from 'drizzle-orm'
import type { DebateTurn } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { dialecticArenaDebates } from '../schema'
import { awardXp } from './xp'
import { withTransaction } from '../transaction'

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

/**
 * Store the learner's ruling on a debate and, when `xp > 0`, append the matching
 * `xp_events` row — one transaction, so XP can never exist without its verdict.
 * XP is only granted the FIRST time a debate gets a verdict (re-submitting edits
 * the ruling but does not farm XP). Returns the updated row and the XP actually
 * awarded, or undefined when the debate does not exist.
 */
export function submitDialecticVerdict(
  id: number,
  verdict: string,
  score: number,
  xp: number,
  database?: LearningHubDB,
): { debate: typeof dialecticArenaDebates.$inferSelect; xpAwarded: number } | undefined {
  return withTransaction((tx) => {
    const existing = tx
      .select()
      .from(dialecticArenaDebates)
      .where(eq(dialecticArenaDebates.id, id))
      .get()
    if (!existing) return undefined
    const learnerScore = Math.max(0, Math.min(100, Math.round(score)))
    const [debate] = tx
      .update(dialecticArenaDebates)
      .set({ learnerVerdict: verdict, learnerScore })
      .where(eq(dialecticArenaDebates.id, id))
      .returning()
      .all()
    const xpAwarded = existing.learnerVerdict == null && xp > 0 ? Math.round(xp) : 0
    if (xpAwarded > 0) {
      // Rule 7: XP via the canonical awardXp path (repos/xp.ts).
      awardXp(tx, {
        source: 'debate',
        amount: xpAwarded,
        meta: { debateId: id, score: learnerScore },
      })
    }
    return { debate: debate!, xpAwarded }
  }, database)
}
