/**
 * Unit tests for core task projects (S3-05): create/update, archive/restore,
 * SP-style duplicate, selection helpers (active vs archived, backlog last),
 * and the validation advisories.
 */
import { describe, expect, it } from 'vitest'
import { TaskDomainError } from '../src/tasks'
import {
  activeProjects,
  archiveProject,
  archivedProjects,
  createProject,
  duplicateProject,
  restoreProject,
  taskProjectSchema,
  updateProject,
  validateProject,
  type TaskProject,
} from '../src/tasks/projects'

const NOW = '2026-11-22T10:00:00.000Z'

function project(overrides: Partial<TaskProject> = {}): TaskProject {
  return taskProjectSchema.parse({
    id: 1,
    title: 'Mega-run',
    notes: null,
    backlogFlag: false,
    color: 'indigo',
    archivedAt: null,
    createdAt: '2026-11-20T08:00:00.000Z',
    updatedAt: '2026-11-20T08:00:00.000Z',
    ...overrides,
  })
}

describe('createProject / updateProject', () => {
  it('applies SP defaults (active, not backlog, no color)', () => {
    const p = createProject({ title: 'Parity' }, NOW)
    expect(p).toMatchObject({
      id: 0,
      title: 'Parity',
      notes: null,
      backlogFlag: false,
      color: null,
      archivedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    })
  })

  it('keeps explicit fields; rejects empty titles', () => {
    const p = createProject({ title: 'Backlog idea', backlogFlag: true, notes: 'parked' }, NOW)
    expect(p.backlogFlag).toBe(true)
    expect(() => createProject({ title: '  ' }, NOW)).toThrow()
    expect(() => createProject({ title: 'x'.repeat(201) }, NOW)).toThrow()
  })

  it('patches immutably and bumps updatedAt only', () => {
    const p = project()
    const next = updateProject(p, { color: 'rose', notes: 'ship it' }, NOW)
    expect(next).toMatchObject({ color: 'rose', notes: 'ship it', updatedAt: NOW })
    expect(next.createdAt).toBe(p.createdAt)
    expect(p.color).toBe('indigo')
  })
})

describe('archive / restore', () => {
  it('archives with a timestamp (idempotent) and restores cleanly', () => {
    const archived = archiveProject(project(), NOW)
    expect(archived.archivedAt).toBe(NOW)
    expect(archiveProject(archived, '2026-11-23T00:00:00.000Z')).toEqual(archived)

    const restored = restoreProject(archived, NOW)
    expect(restored.archivedAt).toBeNull()
    expect(restoreProject(project(), NOW)).toEqual(project())
  })
})

describe('duplicateProject', () => {
  it('copies with (copy) suffix, fresh id, active, same color/backlog', () => {
    const copy = duplicateProject(project({ backlogFlag: true, notes: 'n' }), NOW)
    expect(copy).toMatchObject({
      id: 0,
      title: 'Mega-run (copy)',
      archivedAt: null,
      backlogFlag: true,
      notes: 'n',
      color: 'indigo',
    })
  })

  it('blocks duplicating an archived project (restore first)', () => {
    const archived = archiveProject(project(), NOW)
    expect(() => duplicateProject(archived, NOW)).toThrow(TaskDomainError)
    try {
      duplicateProject(archived, NOW)
    } catch (err) {
      expect((err as TaskDomainError).code).toBe('project-archived')
    }
  })

  it('accepts a title override instead of the (copy) suffix', () => {
    expect(duplicateProject(project(), NOW, { title: 'Sequel' }).title).toBe('Sequel')
  })
})

describe('selection helpers', () => {
  it('activeProjects lists active first, backlog last, stable within groups', () => {
    const a = project({ id: 1, title: 'a', createdAt: '2026-11-20T00:00:00.000Z' })
    const b = project({ id: 2, title: 'b', createdAt: '2026-11-21T00:00:00.000Z' })
    const backlog = project({
      id: 3,
      title: 'c',
      backlogFlag: true,
      createdAt: '2026-11-19T00:00:00.000Z',
    })
    const archived = project({ id: 4, title: 'd', archivedAt: NOW })
    const list = activeProjects([b, archived, backlog, a])
    expect(list.map((p) => p.id)).toEqual([1, 2, 3])
  })

  it('archivedProjects returns most-recently-archived first', () => {
    const older = project({ id: 1, archivedAt: '2026-11-20T00:00:00.000Z' })
    const newer = project({ id: 2, archivedAt: NOW })
    expect(archivedProjects([older, newer, project()]).map((p) => p.id)).toEqual([2, 1])
  })
})

describe('validateProject', () => {
  it('passes a normal project', () => {
    expect(validateProject(project())).toEqual({ ok: true, errors: [], warnings: [] })
  })

  it('blocks empty titles and warns on backlog-without-note and archived-backlog', () => {
    expect(validateProject(project({ title: '' })).ok).toBe(false)
    const parked = validateProject(project({ backlogFlag: true }))
    expect(parked.ok).toBe(true)
    expect(parked.warnings).toHaveLength(1)
    const mixed = validateProject(project({ backlogFlag: true, archivedAt: NOW }))
    expect(mixed.warnings.some((w) => w.includes('both archived and in the backlog'))).toBe(true)
  })
})
