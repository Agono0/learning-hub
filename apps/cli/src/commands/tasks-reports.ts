/**
 * Task reporting CLI: saved views, worklog, daily metrics and the finish-day pass, over the same
 * repo functions the /api/tasks-views, -worklog, -metrics and -finish-day web handlers use.
 *
 *   task-views [list | add "<name>" [--kind kanban|eisenhower|custom] | rm <id>]
 *   worklog    [--from YYYY-MM-DD] [--to YYYY-MM-DD]        (default: last 7 days)
 *   task-metrics [list [--from d] [--to d] | set <day> [--impact 1-4] [--energy 1-3] [--note text]]
 *   finish-day [YYYY-MM-DD]                                  (applies the auto-archive pass)
 *
 * Usage errors exit 2, unknown ids exit 1.
 */
import {
  createTaskViewRow,
  deleteTaskViewRow,
  finishDay,
  listMetricDays,
  listTaskViews,
  upsertMetricDay,
  worklogRollup,
} from '@learning-hub/db'
import { panel } from './ui'
import type { RegisteredCommand } from './registry'

class UsageError extends Error {}

function usage(message: string): never {
  throw new UsageError(message)
}

function flagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx === -1) return undefined
  const value = args[idx + 1]
  if (value === undefined || value.startsWith('--')) usage(`${flag} needs a value`)
  return value
}

function realDay(raw: string, what: string): string {
  const parsed = new Date(`${raw}T00:00:00.000Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(raw) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== raw
  ) {
    usage(`${what} must be a real date as YYYY-MM-DD`)
  }
  return raw
}

function intInRange(raw: string, what: string, min: number, max: number): number {
  const n = Number(raw)
  if (raw.trim() === '' || !Number.isInteger(n) || n < min || n > max) {
    usage(`${what} must be a whole number from ${min} to ${max}`)
  }
  return n
}

function run(name: string, args: string[], fn: (args: string[]) => void): void {
  try {
    fn(args)
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`error: ${err.message}`)
      console.error(
        `Usage: learning-hub ${name} <subcommand>; see the command list in learning-hub help.`,
      )
      process.exitCode = 2
      return
    }
    if (err instanceof Error && /(not found|needs a|must be one of)/i.test(err.message)) {
      console.error(`✖ ${err.message}`)
      process.exitCode = 1
      return
    }
    throw err
  }
}

const today = () => new Date().toISOString().slice(0, 10)
const minutes = (ms: number) => `${Math.round(ms / 60_000)} min`

function viewsDispatch(args: string[]): void {
  const sub = args[0] || 'list'
  if (sub === 'list') {
    const views = listTaskViews()
    if (views.length === 0) return console.log('No saved views yet.')
    return console.log(
      panel(
        `VIEWS (${views.length})`,
        views.map((v) => `#${v.id} ${v.name} [${v.kind}]`),
      ),
    )
  }
  if (sub === 'add') {
    const name = args[1]
    if (!name || name.trim() === '' || name.startsWith('--')) usage('view name is required')
    const kind = flagValue(args, '--kind') ?? 'custom'
    if (kind !== 'kanban' && kind !== 'eisenhower' && kind !== 'custom') {
      usage('--kind must be kanban, eisenhower or custom')
    }
    const view = createTaskViewRow({ name, kind })
    return console.log(`✔ Saved view #${view.id}: ${view.name}`)
  }
  if (sub === 'rm') {
    const id = intInRange(args[1] ?? '', 'view id', 1, Number.MAX_SAFE_INTEGER)
    if (!deleteTaskViewRow(id)) {
      console.error(`✖ view #${id} not found`)
      process.exitCode = 1
      return
    }
    return console.log(`✔ Deleted view #${id}`)
  }
  usage(`unknown subcommand "${sub}" (list, add, rm)`)
}

function worklogDispatch(args: string[]): void {
  const rawFrom = flagValue(args, '--from')
  const rawTo = flagValue(args, '--to')
  const to = rawTo === undefined ? today() : realDay(rawTo, '--to')
  const from =
    rawFrom === undefined
      ? new Date(new Date(`${to}T00:00:00.000Z`).getTime() - 6 * 86_400_000)
          .toISOString()
          .slice(0, 10)
      : realDay(rawFrom, '--from')
  if (from > to) usage('--from must not be after --to')
  const r = worklogRollup(from, to)
  if (r.logCount === 0) return console.log(`No tracked time from ${from} to ${to}.`)
  console.log(
    panel(`WORKLOG ${from} to ${to}: ${minutes(r.totalMs)}`, [
      ...r.perDay.map((d) => `${d.day}  ${minutes(d.totalMs)}`),
      '',
      ...r.perTask.map((t) => `#${t.taskId} ${t.title ?? '(deleted task)'}  ${minutes(t.totalMs)}`),
    ]),
  )
}

function metricsDispatch(args: string[]): void {
  const sub = args[0] || 'list'
  if (sub === 'list') {
    const rawFrom = flagValue(args, '--from')
    const rawTo = flagValue(args, '--to')
    const days = listMetricDays({
      from: rawFrom === undefined ? undefined : realDay(rawFrom, '--from'),
      to: rawTo === undefined ? undefined : realDay(rawTo, '--to'),
    })
    if (days.length === 0) return console.log('No metric days recorded.')
    return console.log(
      panel(
        `METRIC DAYS (${days.length})`,
        days.map(
          (d) =>
            `${d.day}  impact ${d.impact ?? '-'}  energy ${d.energy ?? '-'}${d.reflection ? `  ${d.reflection}` : ''}`,
        ),
      ),
    )
  }
  if (sub === 'set') {
    const day = realDay(args[1] ?? '', 'day')
    const impact = flagValue(args, '--impact')
    const energy = flagValue(args, '--energy')
    const note = flagValue(args, '--note')
    if (note !== undefined && note.length > 2000) usage('--note must be at most 2000 characters')
    const row = upsertMetricDay(day, {
      ...(impact === undefined ? {} : { impact: intInRange(impact, '--impact', 1, 4) }),
      ...(energy === undefined ? {} : { energy: intInRange(energy, '--energy', 1, 3) }),
      ...(note === undefined ? {} : { reflection: note }),
    })
    return console.log(`✔ Saved metrics for ${row.day}`)
  }
  usage(`unknown subcommand "${sub}" (list, set)`)
}

function finishDayDispatch(args: string[]): void {
  const day = args[0] === undefined ? today() : realDay(args[0], 'day')
  const r = finishDay(day)
  console.log(
    panel(`FINISH DAY ${r.day}`, [
      `Done: ${r.completedThatDay.length}`,
      ...r.completedThatDay.map((t) => `  ✔ #${t.id} ${t.title}`),
      `Tracked: ${minutes(r.trackedMs)}`,
      `Still due: ${r.stillOpenForDay.length}`,
      ...r.stillOpenForDay.map((t) => `  ○ #${t.id} ${t.title}`),
      `Archive pass: ${r.archive.archived.length} archived, ${r.archive.restored.length} restored`,
    ]),
  )
}

export const tasksReportCommands: RegisteredCommand[] = [
  {
    name: 'task-views',
    description: 'saved task views: list, add, rm',
    usage: '[list|add|rm]',
    run: (a) => run('task-views', a, viewsDispatch),
  },
  {
    name: 'worklog',
    description: 'tracked-time rollup per day and task (default: last 7 days)',
    usage: '[--from YYYY-MM-DD] [--to YYYY-MM-DD]',
    run: (a) => run('worklog', a, worklogDispatch),
  },
  {
    name: 'task-metrics',
    description: 'daily task metrics: list, set (impact, energy, note)',
    usage: '[list|set]',
    run: (a) => run('task-metrics', a, metricsDispatch),
  },
  {
    name: 'finish-day',
    description: 'end-of-day pass: done, tracked, still due, auto-archive',
    usage: '[YYYY-MM-DD]',
    run: (a) => run('finish-day', a, finishDayDispatch),
  },
]
