/**
 * `tasks` CLI command — the task manager over the shared tasks repository
 * (repos/tasks), the same functions the web /api/tasks* handlers run.
 *
 *   tasks list [--project <id>|inbox] [--all] [--limit N]
 *   tasks add "<title>" [--project <id>] [--priority none|low|medium|high] [--due YYYY-MM-DD]
 *   tasks done <id>
 *   tasks reopen <id>
 *   tasks track <id> <minutes>
 */
import { TaskDomainError, createTaskInputSchema, taskPrioritySchema } from '@learning-hub/core'
import {
  completeTaskItem,
  createTaskItem,
  getTaskItem,
  listTaskItems,
  reopenTaskItem,
  trackTaskTime,
} from '@learning-hub/db'
import { panel } from './ui'
import type { RegisteredCommand } from './registry'

const USAGE =
  'Usage: learning-hub tasks [list [--project <id>|inbox] [--all] [--limit N] | add "<title>" ' +
  '[--project <id>] [--priority p] [--due YYYY-MM-DD] | done <id> | reopen <id> | track <id> <minutes>]'

function fail(message: string): void {
  console.error(`✖ ${message}`)
  process.exitCode = 1
}

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined
}

function parseId(raw: string | undefined): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Domain-rule and "not found" errors print a message; anything else rethrows. */
function report(err: unknown): void {
  if (err instanceof TaskDomainError) return fail(err.message)
  if (err instanceof Error && /not found$/i.test(err.message)) return fail(err.message)
  throw err
}

function line(t: {
  id: number
  title: string
  isDone: boolean
  priority: string
  due: string | null
}) {
  const due = t.due ? ` · due ${t.due.slice(0, 10)}` : ''
  const prio = t.priority !== 'none' ? ` [${t.priority}]` : ''
  return `${t.isDone ? '✔' : '○'} #${t.id}${prio} ${t.title}${due}`
}

function listCommand(args: string[]): void {
  const project = parseFlag(args, '--project')
  let projectId: number | null | 'any' = 'any'
  if (project === 'inbox') projectId = null
  else if (project !== undefined) {
    const id = parseId(project)
    if (id === null) return fail('--project must be a positive id or "inbox"')
    projectId = id
  }
  const rawLimit = parseFlag(args, '--limit')
  let limit = 50
  if (rawLimit !== undefined) {
    const n = Number(rawLimit)
    if (!Number.isInteger(n) || n < 1 || n > 200) return fail('--limit must be 1-200')
    limit = n
  }
  const tasks = listTaskItems({
    projectId,
    parentId: null,
    includeDone: args.includes('--all'),
    limit,
  })
  if (tasks.length === 0) {
    console.log('No tasks — try `learning-hub tasks add "Write the report"`.')
    return
  }
  console.log(panel(`TASKS (${tasks.length})`, tasks.map(line)))
}

function addCommand(args: string[]): void {
  const title = args[1]
  if (!title || !title.trim()) {
    console.error(USAGE)
    process.exitCode = 1
    return
  }
  const project = parseFlag(args, '--project')
  const priority = parseFlag(args, '--priority')
  if (priority !== undefined && !taskPrioritySchema.safeParse(priority).success) {
    return fail(
      `Unknown priority "${priority}". Available: ${taskPrioritySchema.options.join(', ')}`,
    )
  }
  const projectId = project === undefined ? undefined : parseId(project)
  if (project !== undefined && projectId === null) return fail('--project must be a positive id')
  const parsed = createTaskInputSchema.safeParse({
    title,
    ...(projectId ? { projectId } : {}),
    ...(priority ? { priority } : {}),
    ...(parseFlag(args, '--due') ? { due: parseFlag(args, '--due') } : {}),
  })
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  }
  try {
    const task = createTaskItem(parsed.data)
    console.log(`✔ Created task #${task.id}: ${task.title}`)
  } catch (err) {
    report(err)
  }
}

function transitionCommand(args: string[], kind: 'done' | 'reopen'): void {
  const id = parseId(args[1])
  if (id === null) {
    console.error(USAGE)
    process.exitCode = 1
    return
  }
  try {
    const task = kind === 'done' ? completeTaskItem(id) : reopenTaskItem(id)
    if (!task) return fail(`task #${id} not found`)
    console.log(`✔ Task #${id} ${kind === 'done' ? 'completed' : 'reopened'}: ${task.title}`)
  } catch (err) {
    report(err)
  }
}

function trackCommand(args: string[]): void {
  const id = parseId(args[1])
  const minutes = Number(args[2])
  if (id === null || !Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) {
    console.error(USAGE)
    process.exitCode = 1
    return
  }
  if (!getTaskItem(id)) return fail(`task #${id} not found`)
  const log = trackTaskTime(id, Math.round(minutes * 60_000))
  if (!log) return fail('session not stored (too short or over the cap)')
  console.log(`✔ Logged ${minutes} min on task #${id} (${log.day})`)
}

export function tasksCommand(args: string[]): void {
  const sub = args[0] || 'list'
  if (sub === 'list') return listCommand(args)
  if (sub === 'add') return addCommand(args)
  if (sub === 'done') return transitionCommand(args, 'done')
  if (sub === 'reopen') return transitionCommand(args, 'reopen')
  if (sub === 'track') return trackCommand(args)
  console.error(USAGE)
  process.exitCode = 1
}

export const tasksCommands: RegisteredCommand[] = [
  {
    name: 'tasks',
    description: 'tasks: list, add, done, reopen, track time',
    usage: '[list|add|done|reopen|track]',
    run: (runArgs) => tasksCommand(runArgs),
  },
]
