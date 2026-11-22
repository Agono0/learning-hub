/**
 * Tasks — projects (S3-05): the SP-parity project model for the task system.
 *
 * Parallel to the course-oriented `projects` table (schema.ts): SP projects
 * organize TASKS (backlog flag, notes, color, archive/duplicate). The DB
 * layer persists this shape in `task_projects` (S3-01 batch A); S3-22
 * renders it. Pure model + ops, immutable, no I/O — `now` is injected.
 */
import { z } from 'zod'
import { TaskDomainError } from './index'

// ── Schema ──────────────────────────────────────────────────────────────────

/**
 * The project model — mirrors `task_projects` (S3-01). `id === 0` means
 * "not persisted yet" (draft from {@link createProject}).
 */
export const taskProjectSchema = z.object({
  /** Row id; `0` for unpersisted drafts. */
  id: z.number().int().nonnegative(),
  /** Project title, 1–200 chars. */
  title: z.string().min(1).max(200),
  /** Free-form project notes (S3-93 links standalone notes to this field). */
  notes: z.string().max(10_000).nullable(),
  /**
   * SP's backlog flag: backlog projects are ideas/parked work, excluded
   * from active counts until promoted.
   */
  backlogFlag: z.boolean(),
  /** Palette color key for the UI (null = neutral). */
  color: z.string().max(40).nullable(),
  /** Archive timestamp; null = active (S3-11's project-side archive). */
  archivedAt: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})

/** The parsed {@link taskProjectSchema} shape. */
export type TaskProject = z.infer<typeof taskProjectSchema>

/** Input for {@link createProject} — only the title is required. */
export const createProjectInputSchema = z.object({
  title: z.string().trim().min(1, 'A project needs a title').max(200),
  notes: z.string().max(10_000).nullable().optional(),
  backlogFlag: z.boolean().optional(),
  color: z.string().max(40).nullable().optional(),
})

/** The parsed {@link createProjectInputSchema} shape. */
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>

/** Input for {@link updateProject} — every field optional, constraints kept. */
export const updateProjectInputSchema = createProjectInputSchema.partial()

/** The parsed {@link updateProjectInputSchema} shape. */
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>

// ── Ops ─────────────────────────────────────────────────────────────────────

/**
 * Build a new project from validated input. Pure: `now` stamps the
 * timestamps; the result has `id: 0` (repo assigns the row id), active
 * (archivedAt null), not in backlog by default.
 */
export function createProject(input: CreateProjectInput, now: string): TaskProject {
  const v = createProjectInputSchema.parse(input)
  return {
    id: 0,
    title: v.title,
    notes: v.notes ?? null,
    backlogFlag: v.backlogFlag ?? false,
    color: v.color ?? null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

/** Apply a validated patch immutably; `updatedAt` always bumps. */
export function updateProject(
  project: TaskProject,
  patch: UpdateProjectInput,
  now: string,
): TaskProject {
  const v = updateProjectInputSchema.parse(patch)
  return { ...project, ...v, updatedAt: now }
}

/**
 * Archive a project (SP: finished/shelved projects leave active lists).
 * Idempotent; the archivedAt timestamp records when it was shelved.
 */
export function archiveProject(project: TaskProject, now: string): TaskProject {
  if (project.archivedAt !== null) return project
  return { ...project, archivedAt: now, updatedAt: now }
}

/** Restore an archived project to active (S3-75 trophy reopen flow). */
export function restoreProject(project: TaskProject, now: string): TaskProject {
  if (project.archivedAt === null) return project
  return { ...project, archivedAt: null, updatedAt: now }
}

/**
 * SP-style duplicate: `(copy)` suffix, fresh id (0), active, notes/color/
 * backlog copied. Throws {@link TaskDomainError} (`project-archived`) when
 * duplicating an archived project — restore it first (SP blocks copies of
 * shelved projects; archive/restore is the explicit path).
 */
export function duplicateProject(
  project: TaskProject,
  now: string,
  overrides: UpdateProjectInput = {},
): TaskProject {
  if (project.archivedAt !== null) {
    throw new TaskDomainError('project-archived', 'Restore this project before duplicating it.')
  }
  const v = updateProjectInputSchema.parse(overrides)
  return {
    ...project,
    ...v,
    id: 0,
    title: (v.title ?? `${project.title} (copy)`).slice(0, 200),
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

// ── Selection helpers (view-level, pure) ────────────────────────────────────

/**
 * Active (non-archived) projects in stable order: backlog last, then
 * creation order (SP lists active projects first, backlog at the bottom).
 */
export function activeProjects(projects: TaskProject[]): TaskProject[] {
  return projects
    .filter((p) => p.archivedAt === null)
    .sort((a, b) =>
      a.backlogFlag === b.backlogFlag
        ? a.createdAt.localeCompare(b.createdAt)
        : a.backlogFlag
          ? 1
          : -1,
    )
}

/** Archived projects, most recently archived first (S3-75 archive section). */
export function archivedProjects(projects: TaskProject[]): TaskProject[] {
  return projects
    .filter((p) => p.archivedAt !== null)
    .sort((a, b) => (a.archivedAt ?? '').localeCompare(b.archivedAt ?? '') * -1)
}

// ── Validation ──────────────────────────────────────────────────────────────

/** Domain-rule check result (habits.ts style). */
export interface ProjectValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Project rules: title present (schema covers, belt for hand-built rows),
 * backlog projects should have a note (advisory — why is it parked?),
 * archived projects should not carry the backlog flag (advisory — restore
 * or clear the flag to keep the lists honest).
 */
export function validateProject(project: TaskProject): ProjectValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (project.title.trim().length === 0) errors.push('A project needs a title.')
  if (project.backlogFlag && (project.notes === null || project.notes.trim().length === 0)) {
    warnings.push('Backlog projects benefit from a note — why is this parked?')
  }
  if (project.archivedAt !== null && project.backlogFlag) {
    warnings.push('This project is both archived and in the backlog — clear one of the two.')
  }

  return { ok: errors.length === 0, errors, warnings }
}
