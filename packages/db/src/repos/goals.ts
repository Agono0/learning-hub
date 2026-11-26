/**
 * Goals repository — WOOP goal setting (Oettingen 2014, *Rethinking Positive Thinking*),
 * structured implementation intentions (Gollwitzer & Sheeran 2006, d = 0.65),
 * if-then distraction planning, and goal-quote bindings.
 */
import { rowLimit } from '../limits'
import { and, desc, eq } from 'drizzle-orm'
import { pendingTombstone } from '../sync'
import { getDb, type LearningHubDB } from '../index'
import { goals, goalsQuotes, ifthenPlans } from '../schema'
import { withTransaction } from '../transaction'

export type GoalRow = typeof goals.$inferSelect
export type GoalsQuotesRow = typeof goalsQuotes.$inferSelect
export type IfThenPlanRow = typeof ifthenPlans.$inferSelect

export interface CreateGoalInput {
  wish: string
  outcome?: string | null
  obstacle?: string | null
  ifThenPlan?: string | null
  ifCondition?: string | null
  thenAction?: string | null
  dueDate?: string | null
  status?: string
  progressPct?: number
  quoteId?: number | null
  createdAt?: string
}

export interface PatchGoalInput {
  wish?: string
  outcome?: string | null
  obstacle?: string | null
  ifThenPlan?: string | null
  ifCondition?: string | null
  thenAction?: string | null
  dueDate?: string | null
  status?: string
  progressPct?: number
  quoteId?: number | null
}

export interface CreateIfThenPlanInput {
  condition: string
  action: string
  context?: string
  linkedId?: number | null
  active?: boolean
  createdAt?: string
}

export interface PatchIfThenPlanInput {
  condition?: string
  action?: string
  context?: string
  linkedId?: number | null
  active?: boolean
}

/**
 * List goals ordered newest first, with optional status filter and limit.
 */
export function listGoals(
  opts: {
    status?: string
    limit?: number
    db?: LearningHubDB
  } = {},
): GoalRow[] {
  const db = opts.db ?? getDb()
  const base = opts.status
    ? db.select().from(goals).where(eq(goals.status, opts.status))
    : db.select().from(goals)
  const query = base.orderBy(desc(goals.createdAt))
  return (opts.limit !== undefined ? query.limit(rowLimit(opts.limit)) : query).all()
}

/**
 * Get a single WOOP goal by id.
 */
export function getGoal(id: number, opts: { db?: LearningHubDB } = {}): GoalRow | null {
  const db = opts.db ?? getDb()
  const [row] = db.select().from(goals).where(eq(goals.id, id)).limit(1).all()
  return row ?? null
}

/**
 * Insert a new WOOP goal.
 */
export function createGoal(input: CreateGoalInput, opts: { db?: LearningHubDB } = {}): GoalRow {
  const db = opts.db ?? getDb()
  const [created] = db
    .insert(goals)
    .values({
      wish: input.wish.trim(),
      outcome: input.outcome ?? null,
      obstacle: input.obstacle ?? null,
      ifThenPlan: input.ifThenPlan ?? null,
      ifCondition: input.ifCondition ?? null,
      thenAction: input.thenAction ?? null,
      dueDate: input.dueDate ?? null,
      status: input.status ?? 'active',
      progressPct: input.progressPct ?? 0,
      quoteId: input.quoteId ?? null,
      createdAt: input.createdAt ?? new Date().toISOString(),
    })
    .returning()
    .all()

  return created!
}

/**
 * Update an existing WOOP goal.
 * Detects if the goal transitioned to 'done' for the first time (`completedJustNow: true`).
 */
export function updateGoal(
  id: number,
  patch: PatchGoalInput,
  opts: { db?: LearningHubDB } = {},
): { goal: GoalRow | null; completedJustNow: boolean } {
  const db = opts.db ?? getDb()
  const existing = getGoal(id, { db })
  if (!existing) return { goal: null, completedJustNow: false }

  const next: Partial<typeof goals.$inferInsert> = {}
  if (patch.wish !== undefined) next.wish = patch.wish.trim()
  if (patch.outcome !== undefined) next.outcome = patch.outcome
  if (patch.obstacle !== undefined) next.obstacle = patch.obstacle
  if (patch.ifThenPlan !== undefined) next.ifThenPlan = patch.ifThenPlan
  if (patch.ifCondition !== undefined) next.ifCondition = patch.ifCondition
  if (patch.thenAction !== undefined) next.thenAction = patch.thenAction
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate
  if (patch.status !== undefined) next.status = patch.status
  if (patch.quoteId !== undefined) next.quoteId = patch.quoteId
  if (patch.progressPct !== undefined && Number.isFinite(patch.progressPct)) {
    next.progressPct = Math.min(100, Math.max(0, patch.progressPct))
  }

  const [updated] = db.update(goals).set(next).where(eq(goals.id, id)).returning().all()
  const completedJustNow = Boolean(
    updated && existing.status !== 'done' && updated.status === 'done',
  )

  return { goal: updated ?? null, completedJustNow }
}

/**
 * Delete a goal and any quote bindings atomically.
 */
export function deleteGoal(id: number, opts: { db?: LearningHubDB } = {}): boolean {
  const commit = pendingTombstone('goals', id, Boolean(opts.db))
  const ok = withTransaction((tx) => {
    tx.delete(goalsQuotes).where(eq(goalsQuotes.goalId, id)).run()
    const res = tx.delete(goals).where(eq(goals.id, id)).run()
    return (res.changes ?? 0) > 0
  }, opts.db)
  if (ok) commit()
  return ok
}

/**
 * Link a motivational quote to a goal.
 */
export function linkGoalQuote(
  goalId: number,
  quoteId: number,
  opts: { db?: LearningHubDB } = {},
): void {
  const db = opts.db ?? getDb()
  db.insert(goalsQuotes).values({ goalId, quoteId }).onConflictDoNothing().run()
}

/**
 * Unlink a quote from a goal.
 */
export function unlinkGoalQuote(
  goalId: number,
  quoteId: number,
  opts: { db?: LearningHubDB } = {},
): void {
  const db = opts.db ?? getDb()
  db.delete(goalsQuotes)
    .where(and(eq(goalsQuotes.goalId, goalId), eq(goalsQuotes.quoteId, quoteId)))
    .run()
}

/**
 * List quote IDs bound to a goal.
 */
export function listGoalQuotes(goalId: number, opts: { db?: LearningHubDB } = {}): number[] {
  const db = opts.db ?? getDb()
  const rows = db
    .select({ quoteId: goalsQuotes.quoteId })
    .from(goalsQuotes)
    .where(eq(goalsQuotes.goalId, goalId))
    .all()
  return rows.map((r) => r.quoteId)
}

/**
 * List if-then implementation intention plans.
 */
export function listIfThenPlans(
  opts: {
    context?: string
    activeOnly?: boolean
    db?: LearningHubDB
  } = {},
): IfThenPlanRow[] {
  const db = opts.db ?? getDb()
  const query = db.select().from(ifthenPlans)
  if (opts.context && opts.activeOnly) {
    return query
      .where(and(eq(ifthenPlans.context, opts.context), eq(ifthenPlans.active, true)))
      .orderBy(desc(ifthenPlans.createdAt))
      .all()
  }
  if (opts.context) {
    return query
      .where(eq(ifthenPlans.context, opts.context))
      .orderBy(desc(ifthenPlans.createdAt))
      .all()
  }
  if (opts.activeOnly) {
    return query.where(eq(ifthenPlans.active, true)).orderBy(desc(ifthenPlans.createdAt)).all()
  }
  return query.orderBy(desc(ifthenPlans.createdAt)).all()
}

/**
 * Get an if-then plan by id.
 */
export function getIfThenPlan(id: number, opts: { db?: LearningHubDB } = {}): IfThenPlanRow | null {
  const db = opts.db ?? getDb()
  const [row] = db.select().from(ifthenPlans).where(eq(ifthenPlans.id, id)).limit(1).all()
  return row ?? null
}

/**
 * Create a new if-then implementation intention plan.
 */
export function createIfThenPlan(
  input: CreateIfThenPlanInput,
  opts: { db?: LearningHubDB } = {},
): IfThenPlanRow {
  const db = opts.db ?? getDb()
  const [created] = db
    .insert(ifthenPlans)
    .values({
      condition: input.condition.trim(),
      action: input.action.trim(),
      context: input.context ?? 'focus',
      linkedId: input.linkedId ?? null,
      active: input.active ?? true,
      createdAt: input.createdAt ?? new Date().toISOString(),
    })
    .returning()
    .all()

  return created!
}

/**
 * Update an if-then plan.
 */
export function updateIfThenPlan(
  id: number,
  patch: PatchIfThenPlanInput,
  opts: { db?: LearningHubDB } = {},
): IfThenPlanRow | null {
  const db = opts.db ?? getDb()
  const existing = getIfThenPlan(id, { db })
  if (!existing) return null

  const next: Partial<typeof ifthenPlans.$inferInsert> = {}
  if (patch.condition !== undefined) next.condition = patch.condition.trim()
  if (patch.action !== undefined) next.action = patch.action.trim()
  if (patch.context !== undefined) next.context = patch.context
  if (patch.linkedId !== undefined) next.linkedId = patch.linkedId
  if (patch.active !== undefined) next.active = patch.active

  const [updated] = db.update(ifthenPlans).set(next).where(eq(ifthenPlans.id, id)).returning().all()
  return updated ?? null
}

/**
 * Delete an if-then plan by id.
 */
export function deleteIfThenPlan(id: number, opts: { db?: LearningHubDB } = {}): boolean {
  const db = opts.db ?? getDb()
  const res = db.delete(ifthenPlans).where(eq(ifthenPlans.id, id)).run()
  return (res.changes ?? 0) > 0
}
