/**
 * Context variability repository: study sessions (where and when), performance
 * goals, and the audit that joins them to the review log. Cards, schedules and
 * reviews are never written.
 */
import { sql, and, asc, count, desc, eq, gte, isNull, lte, notInArray, or } from 'drizzle-orm'
import {
  CTX_DEFAULTS,
  NOISE_LEVELS,
  normalizePlace,
  runContextAudit,
  summarizeContext,
  type CtxAudit,
  type CtxGoal,
  type CtxReport,
  type CtxReview,
  type CtxSession,
  type Noise,
} from '@learning-hub/core/context-variability'
import { getDb, type LearningHubDB } from '../index'
import { contextGoals, contextSessions, revlog, revlogUndos } from '../schema'
import type { Transaction } from '../transaction'

type Db = LearningHubDB | Transaction

/** Input rejected (bad place, hours, times). The web handler answers 400. */
export class ContextValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContextValidationError'
  }
}

/** A row cap was reached. The web handler answers 409. */
export class ContextLimitError extends Error {
  constructor(what: string, max: number) {
    super(`Too many ${what} (limit ${max}).`)
    this.name = 'ContextLimitError'
  }
}

const MAX_SESSION_HOURS = 12
const FUTURE_SLACK_MS = 5 * 60_000

function toSession(r: typeof contextSessions.$inferSelect): CtxSession {
  return {
    id: r.id,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    place: r.place,
    noise: (NOISE_LEVELS as readonly string[]).includes(r.noise ?? '') ? (r.noise as Noise) : null,
    tags: r.tags ?? [],
  }
}

function toGoal(r: typeof contextGoals.$inferSelect): CtxGoal {
  return {
    id: r.id,
    label: r.label,
    place: r.place,
    startHour: r.startHour,
    endHour: r.endHour,
    noise: (NOISE_LEVELS as readonly string[]).includes(r.noise ?? '') ? (r.noise as Noise) : null,
  }
}

function cleanPlace(raw: string): string {
  const place = normalizePlace(raw)
  if (place.length < 2) throw new ContextValidationError('Place must be at least 2 characters.')
  return place
}

function cleanTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((t) => normalizePlace(t)).filter((t) => t.length > 0))].slice(
    0,
    8,
  )
}

function cleanNoise(noise: string | null | undefined): Noise | null {
  if (noise === null || noise === undefined) return null
  if (!(NOISE_LEVELS as readonly string[]).includes(noise))
    throw new ContextValidationError(`Noise must be one of ${NOISE_LEVELS.join(', ')}.`)
  return noise as Noise
}

function sessionCount(db: Db): number {
  return db.select({ n: count() }).from(contextSessions).get()?.n ?? 0
}

/** End time for an open session closed at `now`: never before its start, never more than the open-session cap after it. */
function cappedEnd(startedAt: string, now: Date): string {
  const start = Date.parse(startedAt)
  const capped = Math.min(now.getTime(), start + CTX_DEFAULTS.openSessionHours * 3_600_000)
  return new Date(Math.max(capped, start)).toISOString()
}

export function getOpenContextSession(now = new Date(), database?: Db): CtxSession | null {
  const db = database ?? getDb()
  const row = db
    .select()
    .from(contextSessions)
    .where(isNull(contextSessions.endedAt))
    .orderBy(desc(contextSessions.startedAt))
    .get()
  if (!row) return null
  const age = now.getTime() - Date.parse(row.startedAt)
  return age > CTX_DEFAULTS.openSessionHours * 3_600_000 ? null : toSession(row)
}

export interface StartSessionInput {
  place: string
  noise?: string | null
  tags?: string[]
  now?: Date
}

/**
 * Start studying somewhere. Any other open session is closed first. Starting
 * the same place again while its session is still open (and recent) returns
 * that session instead of creating a duplicate.
 */
export function startContextSession(
  input: StartSessionInput,
  database?: Db,
): { session: CtxSession; created: boolean } {
  const db = database ?? getDb()
  const now = input.now ?? new Date()
  const place = cleanPlace(input.place)
  const noise = cleanNoise(input.noise)
  const open = getOpenContextSession(now, db)
  if (open && open.place === place) return { session: open, created: false }
  if (sessionCount(db) >= CTX_DEFAULTS.maxSessions)
    throw new ContextLimitError('study sessions', CTX_DEFAULTS.maxSessions)
  const stamp = now.toISOString()
  // Close every open session at its own cap, never at "now": a forgotten session must not stretch over the gap.
  for (const o of db.select().from(contextSessions).where(isNull(contextSessions.endedAt)).all()) {
    db.update(contextSessions)
      .set({ endedAt: cappedEnd(o.startedAt, now), updatedAt: stamp })
      .where(eq(contextSessions.id, o.id))
      .run()
  }
  const existing = db
    .select()
    .from(contextSessions)
    .where(and(eq(contextSessions.startedAt, stamp), eq(contextSessions.place, place)))
    .get()
  if (existing) return { session: toSession(existing), created: false }
  const [row] = db
    .insert(contextSessions)
    .values({
      startedAt: stamp,
      place,
      noise,
      tags: cleanTags(input.tags),
      createdAt: stamp,
      updatedAt: stamp,
    })
    .returning()
    .all()
  return { session: toSession(row!), created: true }
}

/** End the open session (or one by id). Returns the ended session, or null if there was nothing to end. */
export function endContextSession(id?: number, now = new Date(), database?: Db): CtxSession | null {
  const db = database ?? getDb()
  const stamp = now.toISOString()
  const target = db
    .select()
    .from(contextSessions)
    .where(
      id === undefined
        ? isNull(contextSessions.endedAt)
        : and(eq(contextSessions.id, id), isNull(contextSessions.endedAt)),
    )
    .orderBy(desc(contextSessions.startedAt))
    .get()
  if (!target) return null
  const end = cappedEnd(target.startedAt, now)
  const [row] = db
    .update(contextSessions)
    .set({ endedAt: end, updatedAt: stamp })
    .where(eq(contextSessions.id, target.id))
    .returning()
    .all()
  return toSession(row!)
}

export interface LogSessionInput {
  place: string
  startedAt: string
  endedAt: string
  noise?: string | null
  tags?: string[]
  now?: Date
}

/** Record a past session. The same place and start time is stored once. */
export function logContextSession(
  input: LogSessionInput,
  database?: Db,
): { session: CtxSession; created: boolean } {
  const db = database ?? getDb()
  const now = input.now ?? new Date()
  const place = cleanPlace(input.place)
  const noise = cleanNoise(input.noise)
  const start = Date.parse(input.startedAt)
  const end = Date.parse(input.endedAt)
  if (!Number.isFinite(start) || !Number.isFinite(end))
    throw new ContextValidationError('Start and end must be valid times.')
  if (end <= start) throw new ContextValidationError('The session must end after it starts.')
  if (end - start > MAX_SESSION_HOURS * 3_600_000)
    throw new ContextValidationError(`A session can be at most ${MAX_SESSION_HOURS} hours.`)
  if (end > now.getTime() + FUTURE_SLACK_MS)
    throw new ContextValidationError('A logged session cannot end in the future.')
  const startedAt = new Date(start).toISOString()
  const existing = db
    .select()
    .from(contextSessions)
    .where(and(eq(contextSessions.startedAt, startedAt), eq(contextSessions.place, place)))
    .get()
  if (existing) return { session: toSession(existing), created: false }
  if (sessionCount(db) >= CTX_DEFAULTS.maxSessions)
    throw new ContextLimitError('study sessions', CTX_DEFAULTS.maxSessions)
  const stamp = now.toISOString()
  const [row] = db
    .insert(contextSessions)
    .values({
      startedAt,
      endedAt: new Date(end).toISOString(),
      place,
      noise,
      tags: cleanTags(input.tags),
      createdAt: stamp,
      updatedAt: stamp,
    })
    .returning()
    .all()
  return { session: toSession(row!), created: true }
}

export function listContextSessions(limit = 30, database?: Db): CtxSession[] {
  const db = database ?? getDb()
  return db
    .select()
    .from(contextSessions)
    .orderBy(desc(contextSessions.startedAt), desc(contextSessions.id))
    .limit(Math.max(1, Math.min(200, limit)))
    .all()
    .map(toSession)
}

export interface GoalInput {
  label: string
  place: string
  startHour: number
  endHour: number
  noise?: string | null
  now?: Date
}

/** Add a performance goal. Same label and place updates the existing goal (and un-archives it). */
export function addContextGoal(
  input: GoalInput,
  database?: Db,
): { goal: CtxGoal; created: boolean } {
  const db = database ?? getDb()
  const label = input.label.trim().replace(/\s+/g, ' ').slice(0, 60)
  if (label.length < 2) throw new ContextValidationError('Label must be at least 2 characters.')
  const place = cleanPlace(input.place)
  const noise = cleanNoise(input.noise)
  const { startHour, endHour } = input
  if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23)
    throw new ContextValidationError('Start hour must be a whole number from 0 to 23.')
  if (!Number.isInteger(endHour) || endHour < 0 || endHour > 24)
    throw new ContextValidationError('End hour must be a whole number from 0 to 24.')
  if (startHour === endHour) throw new ContextValidationError('The hour window cannot be empty.')
  const stamp = (input.now ?? new Date()).toISOString()
  const existing = db
    .select()
    .from(contextGoals)
    .where(
      and(
        sql`lower(${contextGoals.label}) = ${label.toLowerCase()}`,
        eq(contextGoals.place, place),
      ),
    )
    .get()
  if (existing) {
    const [row] = db
      .update(contextGoals)
      .set({ startHour, endHour, noise, archivedAt: null, updatedAt: stamp })
      .where(eq(contextGoals.id, existing.id))
      .returning()
      .all()
    return { goal: toGoal(row!), created: false }
  }
  const active =
    db.select({ n: count() }).from(contextGoals).where(isNull(contextGoals.archivedAt)).get()?.n ??
    0
  if (active >= CTX_DEFAULTS.maxGoals) throw new ContextLimitError('goals', CTX_DEFAULTS.maxGoals)
  const [row] = db
    .insert(contextGoals)
    .values({ label, place, startHour, endHour, noise, createdAt: stamp, updatedAt: stamp })
    .returning()
    .all()
  return { goal: toGoal(row!), created: true }
}

/** Archive a goal (kept so sync stays consistent). Returns false when it does not exist or is already archived. */
export function archiveContextGoal(id: number, now = new Date(), database?: Db): boolean {
  const db = database ?? getDb()
  const stamp = now.toISOString()
  return (
    db
      .update(contextGoals)
      .set({ archivedAt: stamp, updatedAt: stamp })
      .where(and(eq(contextGoals.id, id), isNull(contextGoals.archivedAt)))
      .returning({ id: contextGoals.id })
      .all().length > 0
  )
}

export function listContextGoals(database?: Db): CtxGoal[] {
  const db = database ?? getDb()
  return db
    .select()
    .from(contextGoals)
    .where(isNull(contextGoals.archivedAt))
    .orderBy(asc(contextGoals.id))
    .all()
    .map(toGoal)
}

export interface ContextAuditQuery {
  windowDays?: number
  /** Minutes east of UTC; defaults to the server's own offset. */
  tzOffsetMinutes?: number
  now?: Date
}

export interface ContextRun {
  audit: CtxAudit
  report: CtxReport
}

/** Reviews in the window with undone reviews removed (newest first, bounded). */
export function loadContextReviews(windowDays: number, now: Date, database?: Db): CtxReview[] {
  const db = database ?? getDb()
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString()
  const undone = db.select({ id: revlogUndos.revlogId }).from(revlogUndos)
  return db
    .select({ cardId: revlog.cardId, rating: revlog.rating, reviewedAt: revlog.reviewedAt })
    .from(revlog)
    .where(
      and(
        gte(revlog.reviewedAt, since),
        lte(revlog.reviewedAt, now.toISOString()),
        notInArray(revlog.id, undone),
      ),
    )
    .orderBy(desc(revlog.reviewedAt))
    .limit(CTX_DEFAULTS.maxReviews + 1)
    .all()
}

/** Run the audit on live data. Read-only. */
export function runContextAuditDb(q: ContextAuditQuery = {}, database?: Db): ContextRun {
  const db = database ?? getDb()
  const now = q.now ?? new Date()
  const windowDays = q.windowDays ?? CTX_DEFAULTS.windowDays
  const since = new Date(now.getTime() - (windowDays + 1) * 86_400_000).toISOString()
  const sessions = db
    .select()
    .from(contextSessions)
    .where(or(gte(contextSessions.startedAt, since), isNull(contextSessions.endedAt)))
    .orderBy(asc(contextSessions.startedAt))
    .limit(CTX_DEFAULTS.maxSessions)
    .all()
    .map(toSession)
  const audit = runContextAudit(
    loadContextReviews(windowDays, now, db),
    sessions,
    listContextGoals(db),
    {
      now,
      windowDays,
      tzOffsetMinutes: q.tzOffsetMinutes ?? -now.getTimezoneOffset(),
    },
  )
  return { audit, report: summarizeContext(audit) }
}
