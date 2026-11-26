/**
 * Task organisation MCP tools: tags, projects, sections and counters, over the same repo
 * functions the /api/tasks-tags, -projects, -sections and -counters web handlers run. Failures
 * the web handlers map to 4xx (invalid input, unknown id, duplicate name) come back as
 * `{ ok: false, error }`.
 */
import { z } from 'zod'
import { TaskDomainError, dayKeySchema } from '@learning-hub/core'
import {
  archiveTaskProjectRow,
  createCounterRow,
  createSection,
  createTaskProjectRow,
  createTaskTag,
  deleteSection,
  deleteTaskProjectRow,
  deleteTaskTag,
  getTaskProject,
  incrementCounter,
  listCounters,
  listSections,
  listTaskProjects,
  listTaskTags,
  restoreTaskProjectRow,
  setTaskItemSection,
  setTaskItemTags,
  updateCounterRow,
} from '@learning-hub/db'
import { json, tool, type RegisteredTool } from '../tool-kit'

const id = z.number().int().positive()
const color = z.string().max(40).nullable().optional()

const realDay = dayKeySchema.refine((d) => {
  const parsed = new Date(`${d}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d
}, 'Expected a real calendar date')

/** Domain, "not found" and "already exists" errors become tool results; the rest rethrow. */
function failure(err: unknown) {
  if (err instanceof TaskDomainError) return json({ ok: false, error: err.message, code: err.code })
  if (
    err instanceof Error &&
    /(not found|already exists|^Unknown tag ids|needs a)/i.test(err.message)
  ) {
    return json({ ok: false, error: err.message })
  }
  throw err
}

function attempt(fn: () => unknown) {
  try {
    return json(fn())
  } catch (err) {
    return failure(err)
  }
}

export const taskOrganizeTools: RegisteredTool[] = [
  tool('task_tag_list', 'List task tags in creation order.', {}, () => {
    const tags = listTaskTags()
    return json({ count: tags.length, tags })
  }),
  tool(
    'task_tag_create',
    'Create a task tag (name is normalized and must be unique).',
    { name: z.string().min(1).max(100), color },
    (args) => attempt(() => ({ ok: true, tag: createTaskTag(args) })),
  ),
  tool('task_tag_delete', 'Delete a tag and unlink it from every task.', { id }, ({ id: tagId }) =>
    attempt(() =>
      deleteTaskTag(tagId) ? { ok: true } : { ok: false, error: `tag #${tagId} not found` },
    ),
  ),
  tool(
    'task_set_tags',
    'Replace the tag set of a task (an empty list clears them). Repeated ids count once.',
    { taskId: id, tagIds: z.array(id).max(100) },
    ({ taskId, tagIds }) =>
      attempt(() => {
        setTaskItemTags(taskId, tagIds)
        return { ok: true }
      }),
  ),
  tool(
    'task_project_list',
    'List task projects (archived ones are included and marked by archivedAt).',
    {},
    () => {
      const projects = listTaskProjects()
      return json({ count: projects.length, projects })
    },
  ),
  tool(
    'task_project_create',
    'Create a task project (title required).',
    {
      title: z.string().trim().min(1).max(200),
      notes: z.string().max(10_000).nullable().optional(),
      backlogFlag: z.boolean().optional(),
      color,
    },
    (args) => attempt(() => ({ ok: true, project: createTaskProjectRow(args) })),
  ),
  tool(
    'task_project_archive',
    'Archive a project, or restore it with restore=true.',
    { id, restore: z.boolean().optional() },
    ({ id: projectId, restore }) =>
      attempt(() => {
        const project = restore
          ? restoreTaskProjectRow(projectId)
          : archiveTaskProjectRow(projectId)
        return project
          ? { ok: true, project }
          : { ok: false, error: `project #${projectId} not found` }
      }),
  ),
  tool(
    'task_project_delete',
    'Delete a project (its tasks move to the inbox).',
    { id },
    ({ id: projectId }) =>
      attempt(() => {
        if (!getTaskProject(projectId))
          return { ok: false, error: `project #${projectId} not found` }
        return deleteTaskProjectRow(projectId) ? { ok: true } : { ok: false, error: 'not deleted' }
      }),
  ),
  tool('task_section_list', 'List task sections in display order.', {}, () => {
    const sections = listSections()
    return json({ count: sections.length, sections })
  }),
  tool(
    'task_section_create',
    'Create a task section (name required; appended at the end unless sortOrder is given).',
    { name: z.string().trim().min(1).max(200), sortOrder: z.number().int().optional() },
    ({ name, sortOrder }) => attempt(() => ({ ok: true, section: createSection(name, sortOrder) })),
  ),
  tool(
    'task_section_delete',
    'Delete a section; its tasks become unsectioned.',
    { id },
    ({ id: sectionId }) =>
      attempt(() =>
        deleteSection(sectionId)
          ? { ok: true }
          : { ok: false, error: `section #${sectionId} not found` },
      ),
  ),
  tool(
    'task_set_section',
    'Put a task in a section, or sectionId=null to take it out.',
    { taskId: id, sectionId: id.nullable() },
    ({ taskId, sectionId }) =>
      attempt(() => {
        setTaskItemSection(taskId, sectionId)
        return { ok: true }
      }),
  ),
  tool(
    'counter_list',
    'List simple tally counters (archived ones with includeArchived=true).',
    { includeArchived: z.boolean().optional() },
    ({ includeArchived }) => {
      const counters = listCounters({ includeArchived: includeArchived ?? false })
      return json({ count: counters.length, counters })
    },
  ),
  tool(
    'counter_create',
    'Create a tally counter (label required).',
    { label: z.string().trim().min(1).max(200), color },
    (args) => attempt(() => ({ ok: true, counter: createCounterRow(args) })),
  ),
  tool(
    'counter_increment',
    'Add to a counter for today (or day=YYYY-MM-DD). by is 1 to 1000 (default 1).',
    { id, day: realDay.optional(), by: z.number().int().min(1).max(1000).default(1) },
    ({ id: counterId, day, by }) =>
      attempt(() => ({
        ok: true,
        log: incrementCounter(counterId, day ?? new Date().toISOString().slice(0, 10), by),
      })),
  ),
  tool(
    'counter_archive',
    'Archive a counter, or restore it with restore=true.',
    { id, restore: z.boolean().optional() },
    ({ id: counterId, restore }) =>
      attempt(() => {
        const counter = updateCounterRow(counterId, { archived: !restore })
        return counter
          ? { ok: true, counter }
          : { ok: false, error: `counter #${counterId} not found` }
      }),
  ),
]
