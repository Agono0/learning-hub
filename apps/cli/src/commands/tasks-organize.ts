/**
 * Task organisation CLI: tags, projects, sections and counters, over the same repo functions the
 * /api/tasks-tags, -projects, -sections and -counters web handlers run.
 *
 *   task-tags     [list | add "<name>" [--color c] | rm <id> | set <taskId> [tagId ...]]
 *   task-projects [list | add "<title>" [--color c] [--backlog] | archive <id> | restore <id> | rm <id>]
 *   task-sections [list | add "<name>" | rm <id> | set <taskId> <sectionId|none>]
 *   counters      [list [--all] | add "<label>" [--color c] | tap <id> [--by N] [--day YYYY-MM-DD] | archive <id> | restore <id>]
 *
 * Usage errors exit 2, unknown ids and duplicate names exit 1.
 */
import { TaskDomainError } from '@learning-hub/core'
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
import { panel } from './ui'
import type { RegisteredCommand } from './registry'

class UsageError extends Error {}

function usage(message: string): never {
  throw new UsageError(message)
}

function fail(message: string): void {
  console.error(`✖ ${message}`)
  process.exitCode = 1
}

/** Value of `--flag <value>`; undefined when absent; a missing value is a usage error. */
function flagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx === -1) return undefined
  const value = args[idx + 1]
  if (value === undefined || value.startsWith('--')) usage(`${flag} needs a value`)
  return value
}

/** Positional arguments after the subcommand, with every `--flag value` pair removed. */
function positionals(args: string[], valueFlags: string[]): string[] {
  const out: string[] = []
  for (let i = 1; i < args.length; i++) {
    const a = args[i]!
    if (valueFlags.includes(a)) {
      i++
      continue
    }
    if (a.startsWith('--')) continue
    out.push(a)
  }
  return out
}

function parseId(raw: string | undefined, what: string): number {
  const n = Number(raw)
  if (raw === undefined || raw.trim() === '' || !Number.isInteger(n) || n < 1) {
    usage(`${what} must be a positive whole number`)
  }
  return n
}

function requireText(raw: string | undefined, what: string): string {
  if (raw === undefined || raw.trim() === '') usage(`${what} is required`)
  return raw
}

/** Domain, not-found and duplicate errors print one line; anything else rethrows. */
function report(err: unknown): void {
  if (err instanceof TaskDomainError) return fail(err.message)
  if (
    err instanceof Error &&
    /(not found|already exists|^Unknown tag ids|needs a)/i.test(err.message)
  ) {
    return fail(err.message)
  }
  throw err
}

function run(name: string, args: string[], dispatch: (args: string[]) => void): void {
  try {
    dispatch(args)
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`error: ${err.message}`)
      console.error(
        `Usage: learning-hub ${name} <subcommand>; see the command list in learning-hub help.`,
      )
      process.exitCode = 2
      return
    }
    report(err)
  }
}

function tagsDispatch(args: string[]): void {
  const sub = args[0] || 'list'
  if (sub === 'list') {
    const tags = listTaskTags()
    if (tags.length === 0) return console.log('No tags yet.')
    return console.log(
      panel(
        `TAGS (${tags.length})`,
        tags.map((t) => `#${t.id} ${t.name}${t.color ? ` (${t.color})` : ''}`),
      ),
    )
  }
  if (sub === 'add') {
    const name = requireText(positionals(args, ['--color'])[0], 'tag name')
    const tag = createTaskTag({ name, color: flagValue(args, '--color') ?? null })
    return console.log(`✔ Created tag #${tag.id}: ${tag.name}`)
  }
  if (sub === 'rm') {
    const id = parseId(args[1], 'tag id')
    if (!deleteTaskTag(id)) return fail(`tag #${id} not found`)
    return console.log(`✔ Deleted tag #${id}`)
  }
  if (sub === 'set') {
    const taskId = parseId(args[1], 'task id')
    const tagIds = args.slice(2).map((a) => parseId(a, 'tag id'))
    setTaskItemTags(taskId, tagIds)
    return console.log(`✔ Task #${taskId} now has ${new Set(tagIds).size} tag(s)`)
  }
  usage(`unknown subcommand "${sub}" (list, add, rm, set)`)
}

function projectsDispatch(args: string[]): void {
  const sub = args[0] || 'list'
  if (sub === 'list') {
    const projects = listTaskProjects()
    if (projects.length === 0) return console.log('No projects yet.')
    return console.log(
      panel(
        `PROJECTS (${projects.length})`,
        projects.map(
          (p) =>
            `#${p.id} ${p.title}${p.archivedAt ? ' [archived]' : ''}${p.backlogFlag ? ' [backlog]' : ''}`,
        ),
      ),
    )
  }
  if (sub === 'add') {
    const title = requireText(positionals(args, ['--color'])[0], 'project title')
    const project = createTaskProjectRow({
      title: title.trim(),
      color: flagValue(args, '--color') ?? null,
      backlogFlag: args.includes('--backlog'),
    })
    return console.log(`✔ Created project #${project.id}: ${project.title}`)
  }
  if (sub === 'archive' || sub === 'restore') {
    const id = parseId(args[1], 'project id')
    const project = sub === 'archive' ? archiveTaskProjectRow(id) : restoreTaskProjectRow(id)
    if (!project) return fail(`project #${id} not found`)
    return console.log(
      `✔ Project #${id} ${sub === 'archive' ? 'archived' : 'restored'}: ${project.title}`,
    )
  }
  if (sub === 'rm') {
    const id = parseId(args[1], 'project id')
    if (!getTaskProject(id)) return fail(`project #${id} not found`)
    deleteTaskProjectRow(id)
    return console.log(`✔ Deleted project #${id} (its tasks moved to the inbox)`)
  }
  usage(`unknown subcommand "${sub}" (list, add, archive, restore, rm)`)
}

function sectionsDispatch(args: string[]): void {
  const sub = args[0] || 'list'
  if (sub === 'list') {
    const sections = listSections()
    if (sections.length === 0) return console.log('No sections yet.')
    return console.log(
      panel(
        `SECTIONS (${sections.length})`,
        sections.map((s) => `#${s.id} ${s.name}`),
      ),
    )
  }
  if (sub === 'add') {
    const name = requireText(positionals(args, [])[0], 'section name')
    const section = createSection(name)
    return console.log(`✔ Created section #${section.id}: ${section.name}`)
  }
  if (sub === 'rm') {
    const id = parseId(args[1], 'section id')
    if (!deleteSection(id)) return fail(`section #${id} not found`)
    return console.log(`✔ Deleted section #${id}`)
  }
  if (sub === 'set') {
    const taskId = parseId(args[1], 'task id')
    const target = args[2]
    const sectionId = target === 'none' ? null : parseId(target, 'section id (or "none")')
    setTaskItemSection(taskId, sectionId)
    return console.log(
      sectionId === null
        ? `✔ Task #${taskId} removed from its section`
        : `✔ Task #${taskId} moved to section #${sectionId}`,
    )
  }
  usage(`unknown subcommand "${sub}" (list, add, rm, set)`)
}

function countersDispatch(args: string[]): void {
  const sub = args[0] || 'list'
  if (sub === 'list') {
    const counters = listCounters({ includeArchived: args.includes('--all') })
    if (counters.length === 0) return console.log('No counters yet.')
    return console.log(
      panel(
        `COUNTERS (${counters.length})`,
        counters.map((c) => `#${c.id} ${c.label}${c.archived ? ' [archived]' : ''}`),
      ),
    )
  }
  if (sub === 'add') {
    const label = requireText(positionals(args, ['--color'])[0], 'counter label')
    const counter = createCounterRow({ label, color: flagValue(args, '--color') ?? null })
    return console.log(`✔ Created counter #${counter.id}: ${counter.label}`)
  }
  if (sub === 'tap') {
    const id = parseId(args[1], 'counter id')
    const rawBy = flagValue(args, '--by')
    const by = rawBy === undefined ? 1 : Number(rawBy)
    if (!Number.isInteger(by) || by < 1 || by > 1000)
      usage('--by must be a whole number from 1 to 1000')
    const rawDay = flagValue(args, '--day')
    const day = rawDay ?? new Date().toISOString().slice(0, 10)
    const parsed = new Date(`${day}T00:00:00.000Z`)
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== day
    ) {
      usage('--day must be a real date as YYYY-MM-DD')
    }
    const log = incrementCounter(id, day, by)
    return console.log(`✔ Counter #${id} is at ${log.count} for ${log.day}`)
  }
  if (sub === 'archive' || sub === 'restore') {
    const id = parseId(args[1], 'counter id')
    const counter = updateCounterRow(id, { archived: sub === 'archive' })
    if (!counter) return fail(`counter #${id} not found`)
    return console.log(
      `✔ Counter #${id} ${sub === 'archive' ? 'archived' : 'restored'}: ${counter.label}`,
    )
  }
  usage(`unknown subcommand "${sub}" (list, add, tap, archive, restore)`)
}

export const tasksOrganizeCommands: RegisteredCommand[] = [
  {
    name: 'task-tags',
    description: "task tags: list, add, rm, set (replace a task's tags)",
    usage: '[list|add|rm|set]',
    run: (a) => run('task-tags', a, tagsDispatch),
  },
  {
    name: 'task-projects',
    description: 'task projects: list, add, archive, restore, rm',
    usage: '[list|add|archive|restore|rm]',
    run: (a) => run('task-projects', a, projectsDispatch),
  },
  {
    name: 'task-sections',
    description: 'task sections: list, add, rm, set (put a task in a section)',
    usage: '[list|add|rm|set]',
    run: (a) => run('task-sections', a, sectionsDispatch),
  },
  {
    name: 'counters',
    description: 'tally counters: list, add, tap, archive, restore',
    usage: '[list|add|tap|archive|restore]',
    run: (a) => run('counters', a, countersDispatch),
  },
]
