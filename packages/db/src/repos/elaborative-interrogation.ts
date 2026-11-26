/**
 * Learning HUB: Elaborative Interrogation repository.
 *
 * Persists the fact bank, per-fact adaptive state and an append-only attempt
 * log. The grading and scheduling logic is pure and lives in
 * `@learning-hub/core/elaborative-interrogation`; this file only stores and reads.
 * Day numbers are integer days since the Unix epoch (UTC), matching the core engine.
 */
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import {
  buildQueue,
  eiFactSchema,
  gradeExplanation,
  gradeToFsrsRating,
  initialState,
  nextStyle,
  summarize,
  updateState,
  type EiFact,
  type EiFactState,
  type EiGrade,
  type EiQueueItem,
  type EiSummary,
  type PromptStyle,
} from '@learning-hub/core/elaborative-interrogation'
import { getDb, type LearningHubDB } from '../index'
import { eiAttempts, eiFacts, eiFactStates } from '../schema'
import { withTransaction, type Transaction } from '../transaction'

type Db = LearningHubDB | Transaction

/** Stored fact id prefix: engine ids are strings, rows use integers. */
const toEngineId = (id: number) => `db${id}`
/** Parse an engine id back to the row id, or null if it is not a stored one. */
export function parseEngineId(id: string): number | null {
  const m = /^db(\d+)$/.exec(id)
  return m ? Number(m[1]) : null
}

function rowToFact(r: typeof eiFacts.$inferSelect): EiFact {
  return eiFactSchema.parse({
    id: toEngineId(r.id),
    statement: r.statement,
    keyTerms: r.keyTerms,
    priorKnowledge: r.priorKnowledge,
  })
}

function rowToState(r: typeof eiFactStates.$inferSelect): EiFactState {
  return {
    factId: toEngineId(r.factId),
    level: Math.min(4, Math.max(1, r.level)),
    attempts: r.attempts,
    bestScore: r.bestScore,
    lastScore: r.lastScore,
    streak: r.streak,
    intervalDays: r.intervalDays,
    dueDay: r.dueDay,
    stylesSeen: r.stylesSeen as PromptStyle[],
  }
}

/** Most active facts a bank may hold. */
export const EI_MAX_ACTIVE_FACTS = 500

/** Thrown when the bank is full. */
export class EiBankFullError extends Error {
  constructor() {
    super(`The fact bank is full (${EI_MAX_ACTIVE_FACTS} active facts). Archive some first.`)
    this.name = 'EiBankFullError'
  }
}

/** Case, spacing and trailing punctuation do not make a fact new. */
export function normalizeStatement(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s.!?;:]+$/, '')
    .trim()
}

/**
 * Add a fact unless an active fact with the same normalized statement exists.
 * Returns the stored fact and whether it was newly created.
 * Statement is validated by the core schema (8 to 600 chars).
 */
export function addEiFactIfNew(
  input: { statement: string; keyTerms?: string[]; priorKnowledge?: number },
  database?: Db,
): { fact: EiFact; created: boolean } {
  const db = database ?? getDb()
  const parsed = eiFactSchema.parse({
    id: 'new',
    statement: input.statement,
    keyTerms: input.keyTerms ?? [],
    priorKnowledge: input.priorKnowledge ?? 0.5,
  })
  const active = db.select().from(eiFacts).where(isNull(eiFacts.archivedAt)).all()
  const key = normalizeStatement(parsed.statement)
  const existing = active.find((r) => normalizeStatement(r.statement) === key)
  if (existing) return { fact: rowToFact(existing), created: false }
  if (active.length >= EI_MAX_ACTIVE_FACTS) throw new EiBankFullError()
  const now = new Date().toISOString()
  const [row] = db
    .insert(eiFacts)
    .values({
      statement: parsed.statement,
      keyTerms: parsed.keyTerms,
      priorKnowledge: parsed.priorKnowledge,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .all()
  return { fact: rowToFact(row!), created: true }
}

/** Add a fact to the bank (deduplicated, capped). Returns the stored fact. */
export function addEiFact(
  input: { statement: string; keyTerms?: string[]; priorKnowledge?: number },
  database?: Db,
): EiFact {
  return addEiFactIfNew(input, database).fact
}

/** List active (not archived) facts, oldest first. */
export function listEiFacts(database?: Db): EiFact[] {
  const db = database ?? getDb()
  return db
    .select()
    .from(eiFacts)
    .where(isNull(eiFacts.archivedAt))
    .orderBy(asc(eiFacts.id))
    .all()
    .map(rowToFact)
}

/** Archive a fact (kept with its history). Returns false when it does not exist or is already archived. */
export function archiveEiFact(id: number, database?: Db): boolean {
  const db = database ?? getDb()
  const now = new Date().toISOString()
  const rows = db
    .update(eiFacts)
    .set({ archivedAt: now, updatedAt: now })
    .where(and(eq(eiFacts.id, id), isNull(eiFacts.archivedAt)))
    .returning({ id: eiFacts.id })
    .all()
  return rows.length > 0
}

/** Stored states for the active facts, as engine states. */
export function listEiStates(database?: Db): EiFactState[] {
  const db = database ?? getDb()
  return db
    .select({ s: eiFactStates })
    .from(eiFactStates)
    .innerJoin(eiFacts, eq(eiFacts.id, eiFactStates.factId))
    .where(isNull(eiFacts.archivedAt))
    .all()
    .map((r) => rowToState(r.s))
}

/** Build the study queue for a day from stored facts and states. */
export function getEiQueue(
  today: number,
  limit = 10,
  database?: Db,
): { queue: EiQueueItem[]; summary: EiSummary } {
  const facts = listEiFacts(database)
  const states = listEiStates(database)
  return {
    queue: buildQueue(facts, states, today, limit),
    summary: summarize(facts, states, today),
  }
}

export interface RecordedAttempt {
  attemptId: number
  grade: EiGrade
  fsrsRating: 1 | 2 | 3 | 4
  state: EiFactState
}

/**
 * Grade an answer for a stored fact and persist the attempt and the updated
 * state in ONE transaction. Throws when the fact is missing or archived.
 */
export function recordEiAttempt(
  input: { factId: number; answer: string; today: number; style?: PromptStyle; predicted?: number },
  database?: LearningHubDB,
): RecordedAttempt {
  const db = database ?? getDb()
  return withTransaction((tx) => {
    const row = tx
      .select()
      .from(eiFacts)
      .where(and(eq(eiFacts.id, input.factId), isNull(eiFacts.archivedAt)))
      .get()
    if (!row) throw new Error(`Elaborative interrogation fact ${input.factId} not found`)
    const fact = rowToFact(row)
    const stateRow = tx.select().from(eiFactStates).where(eq(eiFactStates.factId, row.id)).get()
    const before = stateRow ? rowToState(stateRow) : initialState(fact)
    const style = input.style ?? nextStyle(before)
    const grade = gradeExplanation(fact, input.answer)
    const after = updateState(before, grade, style, input.today)
    const fsrsRating = gradeToFsrsRating(grade)
    const now = new Date().toISOString()
    const [attempt] = tx
      .insert(eiAttempts)
      .values({
        factId: row.id,
        style,
        answer: input.answer,
        score: grade.total,
        band: grade.band,
        predicted: input.predicted ?? null,
        fsrsRating,
        rubric: grade.rubric,
        createdAt: now,
      })
      .returning({ id: eiAttempts.id })
      .all()
    const values = {
      level: after.level,
      attempts: after.attempts,
      bestScore: after.bestScore,
      lastScore: after.lastScore,
      streak: after.streak,
      intervalDays: after.intervalDays,
      dueDay: after.dueDay,
      stylesSeen: after.stylesSeen,
      updatedAt: now,
    }
    tx.insert(eiFactStates)
      .values({ factId: row.id, ...values })
      .onConflictDoUpdate({ target: eiFactStates.factId, set: values })
      .run()
    return {
      attemptId: attempt!.id,
      grade,
      fsrsRating,
      state: { ...after, factId: toEngineId(row.id) },
    }
  }, db)
}

/** Recent attempts, newest first, optionally for one fact. */
export function listEiAttempts(opts: { factId?: number; limit?: number } = {}, database?: Db) {
  const db = database ?? getDb()
  const q = db.select().from(eiAttempts)
  const filtered = opts.factId === undefined ? q : q.where(eq(eiAttempts.factId, opts.factId))
  return filtered
    .orderBy(desc(eiAttempts.createdAt), desc(eiAttempts.id))
    .limit(Math.min(500, Math.max(1, opts.limit ?? 50)))
    .all()
}

/** Predicted vs actual score pairs for calibration (attempts that had a prediction). */
export function listEiCalibrationPoints(
  limit = 500,
  database?: Db,
): { predicted: number; actual: number }[] {
  const db = database ?? getDb()
  return db
    .select({ predicted: eiAttempts.predicted, actual: eiAttempts.score })
    .from(eiAttempts)
    .orderBy(desc(eiAttempts.id))
    .limit(Math.min(2000, Math.max(1, limit)))
    .all()
    .filter((r): r is { predicted: number; actual: number } => r.predicted !== null)
    .reverse()
}
