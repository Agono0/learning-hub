/**
 * Journal repository — daily reflection logging, mood tracking, small wins, and AI insights.
 *
 * Implements expressive writing and metacognitive reflection (Pennebaker 1997;
 * Emmons & McCullough 2003) with canonical XP awards (Rule 7).
 */
import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { XP_REWARDS } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { journalEntries } from '../schema'
import { withTransaction } from '../transaction'
import { awardXp } from './xp'

export type JournalEntryRow = typeof journalEntries.$inferSelect

export interface UpsertJournalInput {
  date: string
  mood?: number | null
  smallWins?: string | null
  gratitude?: string | null
  worryDump?: string | null
}

/**
 * List journal entries within a date range (inclusive), ordered newest first.
 */
export function listJournalEntries(opts: {
  from: string
  to: string
  db?: LearningHubDB
}): JournalEntryRow[] {
  const db = opts.db ?? getDb()
  return db
    .select()
    .from(journalEntries)
    .where(and(gte(journalEntries.date, opts.from), lte(journalEntries.date, opts.to)))
    .orderBy(desc(journalEntries.date))
    .all()
}

/**
 * Get a single journal entry by its calendar day key (YYYY-MM-DD).
 */
export function getJournalEntry(
  date: string,
  opts: { db?: LearningHubDB } = {},
): JournalEntryRow | null {
  const db = opts.db ?? getDb()
  const [row] = db.select().from(journalEntries).where(eq(journalEntries.date, date)).limit(1).all()
  return row ?? null
}

/**
 * List journal entries from `sinceDate` onwards in ascending order (useful for weekly summaries).
 */
export function listJournalEntriesSince(
  sinceDate: string,
  opts: { db?: LearningHubDB } = {},
): JournalEntryRow[] {
  const db = opts.db ?? getDb()
  return db
    .select()
    .from(journalEntries)
    .where(gte(journalEntries.date, sinceDate))
    .all()
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

/**
 * Upsert a daily journal entry. On first creation for a date, awards canonical XP.
 */
export function upsertJournalEntry(
  input: UpsertJournalInput,
  opts: { db?: LearningHubDB } = {},
): { entry: JournalEntryRow; created: boolean; xpAwarded: number } {
  const db = opts.db ?? getDb()
  const [existing] = db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.date, input.date))
    .limit(1)
    .all()

  if (existing) {
    const [row] = db
      .update(journalEntries)
      .set({
        mood: input.mood !== undefined ? input.mood : existing.mood,
        smallWins: input.smallWins !== undefined ? input.smallWins : existing.smallWins,
        gratitude: input.gratitude !== undefined ? input.gratitude : existing.gratitude,
        worryDump: input.worryDump !== undefined ? input.worryDump : existing.worryDump,
      })
      .where(eq(journalEntries.id, existing.id))
      .returning()
      .all()
    return { entry: row!, created: false, xpAwarded: 0 }
  }

  const [row] = db
    .insert(journalEntries)
    .values({
      date: input.date,
      mood: input.mood ?? null,
      smallWins: input.smallWins ?? null,
      gratitude: input.gratitude ?? null,
      worryDump: input.worryDump ?? null,
    })
    .returning()
    .all()

  // Canonical XP award (Rule 7)
  awardXp(db, { source: 'journal', meta: { date: input.date } })

  return { entry: row!, created: true, xpAwarded: XP_REWARDS.journal }
}

/**
 * Upsert an AI reflection insight for a specific date, creating an empty entry if none exists.
 */
export function setJournalAiInsight(
  date: string,
  insight: string,
  opts: { db?: LearningHubDB } = {},
): JournalEntryRow {
  return withTransaction((tx) => {
    const [existing] = tx
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.date, date))
      .limit(1)
      .all()

    if (existing) {
      const [updated] = tx
        .update(journalEntries)
        .set({ aiInsight: insight })
        .where(eq(journalEntries.id, existing.id))
        .returning()
        .all()
      return updated!
    }

    const [created] = tx
      .insert(journalEntries)
      .values({ date, aiInsight: insight })
      .returning()
      .all()
    return created!
  }, opts.db)
}
