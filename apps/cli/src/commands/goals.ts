/**
 * `goals` CLI command — WOOP goals and if-then implementation-intention
 * plans over the shared goals repository (repos/goals), the same functions
 * the web /api/goals handlers run.
 *
 *   goals list [--status active] [--limit 20]
 *   goals create "<wish>" [--outcome s] [--obstacle s] [--plan s]
 *   goals update <id> [--status done] [--progress 40] [--outcome s] [--plan s] …
 *   goals delete <id>
 *   goals plan list [--goal <id>] | plan add <goalId> "<if…>" "<then…>"
 *                   | plan pause <planId> | plan resume <planId> | plan delete <planId>
 */
import { limitFlag } from '../flags'
import {
  createGoal,
  createIfThenPlan,
  deleteGoal,
  deleteIfThenPlan,
  listGoals,
  listIfThenPlans,
  updateGoal,
  updateIfThenPlan,
} from '@learning-hub/db'
import { panel } from './ui'
import type { RegisteredCommand } from './registry'

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1]
  }
  return undefined
}

function listGoalsCommand(args: string[]): void {
  const status = parseFlag(args, '--status')
  const limit = limitFlag(parseFlag(args, '--limit'), 50)
  const goals = listGoals({ ...(status !== undefined ? { status } : {}), limit })
  if (goals.length === 0) {
    console.log('No goals yet — try `learning-hub goals create "finish the thesis"`.')
    return
  }
  console.log(
    panel(
      'GOALS',
      goals.map(
        (g) =>
          `#${g.id} [${g.status}] ${g.wish}\n     ${g.progressPct}% · ${g.obstacle ?? 'no obstacle recorded'} · ${g.ifThenPlan ?? 'no if-then plan'}`,
      ),
    ),
  )
}

function createGoalCommand(args: string[]): void {
  const wish = args[1]
  if (!wish || !wish.trim()) {
    console.error(
      'Usage: learning-hub goals create "<wish>" [--outcome s] [--obstacle s] [--plan s]',
    )
    process.exitCode = 1
    return
  }
  const goal = createGoal({
    wish,
    outcome: parseFlag(args, '--outcome'),
    obstacle: parseFlag(args, '--obstacle'),
    ifThenPlan: parseFlag(args, '--plan'),
  })
  console.log(`✔ Created goal #${goal.id}: ${goal.wish} [${goal.status}]`)
}

function updateGoalCommand(args: string[]): void {
  const id = Number(args[1])
  if (!Number.isInteger(id) || id <= 0) {
    console.error(
      'Usage: learning-hub goals update <id> [--status done] [--progress 0-100] [--wish s] [--outcome s] [--obstacle s] [--plan s]',
    )
    return
  }
  const progressStr = parseFlag(args, '--progress')
  const res = updateGoal(id, {
    wish: parseFlag(args, '--wish'),
    outcome: parseFlag(args, '--outcome'),
    obstacle: parseFlag(args, '--obstacle'),
    ifThenPlan: parseFlag(args, '--plan'),
    status: parseFlag(args, '--status'),
    progressPct: progressStr !== undefined ? Number(progressStr) : undefined,
  })
  if (!res.goal) {
    console.error(`✖ Goal #${id} not found.`)
    return
  }
  console.log(
    `✔ Goal #${id} updated [${res.goal.status}, ${res.goal.progressPct}%]${res.completedJustNow ? ' — completed! 🎉' : ''}`,
  )
}

function deleteGoalCommand(args: string[]): void {
  const id = Number(args[1])
  if (!Number.isInteger(id) || id <= 0) {
    console.error('Usage: learning-hub goals delete <id>')
    return
  }
  if (deleteGoal(id)) console.log(`✔ Deleted goal #${id} (and its quote bindings).`)
  else console.error(`✖ Goal #${id} not found.`)
}

function planListCommand(args: string[]): void {
  const goalStr = parseFlag(args, '--goal')
  const plans = listIfThenPlans({ context: 'goal' })
  const goalId = goalStr !== undefined ? Number(goalStr) : undefined
  const filtered = goalId !== undefined ? plans.filter((p) => p.linkedId === goalId) : plans
  if (filtered.length === 0) {
    console.log(
      'No if-then plans. Add one: learning-hub goals plan add <goalId> "If <obstacle>" "then <action>"',
    )
    return
  }
  console.log(
    panel(
      'IF-THEN PLANS (goal)',
      filtered.map(
        (p) =>
          `#${p.id}${p.linkedId ? ` → goal #${p.linkedId}` : ''}${p.active ? '' : ' [paused]'}\n     ${p.condition}\n     ${p.action}`,
      ),
    ),
  )
}

function planAddCommand(args: string[]): void {
  const goalId = Number(args[1])
  const condition = args[2]
  const action = args[3]
  if (!Number.isInteger(goalId) || goalId <= 0 || !condition || !action) {
    console.error('Usage: learning-hub goals plan add <goalId> "If <obstacle>…" "then <action>…"')
    process.exitCode = 1
    return
  }
  const plan = createIfThenPlan({ condition, action, context: 'goal', linkedId: goalId })
  console.log(`✔ If-then plan #${plan.id} linked to goal #${goalId}.`)
}

function planToggleCommand(args: string[], active: boolean): void {
  const id = Number(args[1])
  if (!Number.isInteger(id) || id <= 0) {
    console.error(`Usage: learning-hub goals plan ${active ? 'resume' : 'pause'} <planId>`)
    return
  }
  const updated = updateIfThenPlan(id, { active })
  if (!updated) {
    console.error(`✖ If-then plan #${id} not found.`)
    return
  }
  console.log(`✔ Plan #${id} ${active ? 'resumed' : 'paused'}.`)
}

function planDeleteCommand(args: string[]): void {
  const id = Number(args[1])
  if (!Number.isInteger(id) || id <= 0) {
    console.error('Usage: learning-hub goals plan delete <planId>')
    return
  }
  if (deleteIfThenPlan(id)) console.log(`✔ Deleted if-then plan #${id}.`)
  else console.error(`✖ If-then plan #${id} not found.`)
}

export function goalsCommand(args: string[]): void {
  const sub = args[0] || 'list'

  if (sub === 'list') return listGoalsCommand(args)
  if (sub === 'create') return createGoalCommand(args)
  if (sub === 'update') return updateGoalCommand(args)
  if (sub === 'delete') return deleteGoalCommand(args)

  if (sub === 'plan') {
    const planSub = args[1] || 'list'
    if (planSub === 'list') return planListCommand(args.slice(1))
    if (planSub === 'add') return planAddCommand(args.slice(1))
    if (planSub === 'pause') return planToggleCommand(args.slice(1), false)
    if (planSub === 'resume') return planToggleCommand(args.slice(1), true)
    if (planSub === 'delete') return planDeleteCommand(args.slice(1))
    console.error(
      'Usage: learning-hub goals plan [list [--goal <id>] | add <goalId> "<if>" "<then>" | pause|resume|delete <planId>]',
    )
    return
  }

  console.error(
    'Usage: learning-hub goals [list [--status s] [--limit N] | create "<wish>" [--outcome s] [--obstacle s] [--plan s] | update <id> […] | delete <id> | plan …]',
  )
}

export const goalsCommands: RegisteredCommand[] = [
  {
    name: 'goals',
    description: 'WOOP goals, progress, and if-then plans',
    usage: '[list|create|update|delete|plan]',
    run: (runArgs) => goalsCommand(runArgs),
  },
]
