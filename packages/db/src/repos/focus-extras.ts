/**
 * Focus extras repository — distraction apps/sites blocklist,
 * structured routines (morning/evening rituals), and time-boxed routine steps.
 */
import { asc, desc, eq } from 'drizzle-orm'
import { pendingTombstone } from '../sync'
import { getDb, withTransaction, type LearningHubDB } from '../index'
import { distractionApps, routines, routineSteps } from '../schema'

export type DistractionAppRow = typeof distractionApps.$inferSelect
export type RoutineRow = typeof routines.$inferSelect
export type RoutineStepRow = typeof routineSteps.$inferSelect

export interface CreateDistractionAppInput {
  name: string
  kind?: 'app' | 'website' | 'habit'
  createdAt?: string
}

export interface CreateRoutineStepInput {
  name: string
  minutes?: number
  order?: number
}

export interface CreateRoutineInput {
  name: string
  createdAt?: string
  steps?: CreateRoutineStepInput[]
}

export interface RoutineWithSteps extends RoutineRow {
  steps: RoutineStepRow[]
}

// ─── Distraction Apps ────────────────────────────────────────────────────────

/**
 * List all declared distraction apps/sites.
 */
export function listDistractionApps(opts: { db?: LearningHubDB } = {}): DistractionAppRow[] {
  const db = opts.db ?? getDb()
  return db.select().from(distractionApps).orderBy(desc(distractionApps.createdAt)).all()
}

/**
 * Get a single distraction app by ID.
 */
export function getDistractionApp(
  id: number,
  opts: { db?: LearningHubDB } = {},
): DistractionAppRow | null {
  const db = opts.db ?? getDb()
  const [row] = db.select().from(distractionApps).where(eq(distractionApps.id, id)).limit(1).all()
  return row ?? null
}

/**
 * Add a new app, site, or habit to the distraction friction list.
 * Returns null if an app with the same name already exists (unique name constraint).
 */
export function createDistractionApp(
  input: CreateDistractionAppInput,
  opts: { db?: LearningHubDB } = {},
): DistractionAppRow | null {
  const db = opts.db ?? getDb()
  const inserted = db
    .insert(distractionApps)
    .values({
      name: input.name.trim(),
      kind: input.kind ?? 'app',
      createdAt: input.createdAt ?? new Date().toISOString(),
    })
    .onConflictDoNothing()
    .returning()
    .all()
  return inserted[0] ?? null
}

/**
 * Remove an app or site from the distraction friction list.
 */
export function deleteDistractionApp(id: number, opts: { db?: LearningHubDB } = {}): boolean {
  const db = opts.db ?? getDb()
  const res = db.delete(distractionApps).where(eq(distractionApps.id, id)).run()
  return (res?.changes ?? 0) > 0
}

// ─── Routines & Routine Steps ────────────────────────────────────────────────

/**
 * List all routines, including their ordered steps.
 */
export function listRoutines(opts: { db?: LearningHubDB } = {}): RoutineWithSteps[] {
  const db = opts.db ?? getDb()
  const routineRows = db.select().from(routines).orderBy(desc(routines.createdAt)).all()
  if (routineRows.length === 0) return []

  const stepRows = db
    .select()
    .from(routineSteps)
    .orderBy(asc(routineSteps.order), asc(routineSteps.id))
    .all()
  const stepMap = new Map<number, RoutineStepRow[]>()
  for (const step of stepRows) {
    const list = stepMap.get(step.routineId) ?? []
    list.push(step)
    stepMap.set(step.routineId, list)
  }

  return routineRows.map((r) => ({
    ...r,
    steps: stepMap.get(r.id) ?? [],
  }))
}

/**
 * Get a routine with its steps by ID.
 */
export function getRoutine(id: number, opts: { db?: LearningHubDB } = {}): RoutineWithSteps | null {
  const db = opts.db ?? getDb()
  const [row] = db.select().from(routines).where(eq(routines.id, id)).limit(1).all()
  if (!row) return null

  const steps = db
    .select()
    .from(routineSteps)
    .where(eq(routineSteps.routineId, id))
    .orderBy(asc(routineSteps.order), asc(routineSteps.id))
    .all()

  return {
    ...row,
    steps,
  }
}

/**
 * Create a new routine container, optionally populating initial steps atomically.
 */
export function createRoutine(
  input: CreateRoutineInput,
  opts: { db?: LearningHubDB } = {},
): RoutineWithSteps {
  return withTransaction((tx) => {
    const [row] = tx
      .insert(routines)
      .values({
        name: input.name.trim(),
        createdAt: input.createdAt ?? new Date().toISOString(),
      })
      .returning()
      .all()

    const steps: RoutineStepRow[] = []
    if (input.steps && input.steps.length > 0) {
      for (let i = 0; i < input.steps.length; i++) {
        const stepInput = input.steps[i]
        const [stepRow] = tx
          .insert(routineSteps)
          .values({
            routineId: row.id,
            name: stepInput.name.trim(),
            minutes: stepInput.minutes ?? 5,
            order: stepInput.order ?? i,
          })
          .returning()
          .all()
        steps.push(stepRow)
      }
    }

    return {
      ...row,
      steps,
    }
  }, opts.db)
}

/**
 * Update routine metadata (e.g. name).
 */
export function updateRoutine(
  id: number,
  patch: { name?: string },
  opts: { db?: LearningHubDB } = {},
): RoutineRow | null {
  const db = opts.db ?? getDb()
  const values: Partial<RoutineRow> = {}
  if (patch.name !== undefined) values.name = patch.name.trim()

  const [updated] = db.update(routines).set(values).where(eq(routines.id, id)).returning().all()
  return updated ?? null
}

/**
 * Delete a routine and all its nested steps.
 */
export function deleteRoutine(id: number, opts: { db?: LearningHubDB } = {}): boolean {
  const commit = pendingTombstone('routines', id, Boolean(opts.db))
  const ok = withTransaction((tx) => {
    tx.delete(routineSteps).where(eq(routineSteps.routineId, id)).run()
    const res = tx.delete(routines).where(eq(routines.id, id)).run()
    return (res?.changes ?? 0) > 0
  }, opts.db)
  if (ok) commit()
  return ok
}

/**
 * Add a new step to an existing routine.
 */
export function addRoutineStep(
  routineId: number,
  input: CreateRoutineStepInput,
  opts: { db?: LearningHubDB } = {},
): RoutineStepRow {
  const db = opts.db ?? getDb()
  const [step] = db
    .insert(routineSteps)
    .values({
      routineId,
      name: input.name.trim(),
      minutes: input.minutes ?? 5,
      order: input.order ?? 0,
    })
    .returning()
    .all()
  return step!
}

/**
 * Update an existing routine step.
 */
export function updateRoutineStep(
  id: number,
  patch: { name?: string; minutes?: number; order?: number },
  opts: { db?: LearningHubDB } = {},
): RoutineStepRow | null {
  const db = opts.db ?? getDb()
  const values: Partial<RoutineStepRow> = {}
  if (patch.name !== undefined) values.name = patch.name.trim()
  if (patch.minutes !== undefined) values.minutes = patch.minutes
  if (patch.order !== undefined) values.order = patch.order

  const [updated] = db
    .update(routineSteps)
    .set(values)
    .where(eq(routineSteps.id, id))
    .returning()
    .all()
  return updated ?? null
}

/**
 * Delete a specific routine step.
 */
export function deleteRoutineStep(id: number, opts: { db?: LearningHubDB } = {}): boolean {
  const db = opts.db ?? getDb()
  const res = db.delete(routineSteps).where(eq(routineSteps.id, id)).run()
  return (res?.changes ?? 0) > 0
}
