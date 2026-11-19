/**
 * `workload` CLI command — forecast, fuzz-smoothed balancing, and overdue
 * backlog recovery over the shared workload repo (repos/workload) and core's
 * pure forecast/balance/catch-up engines. The due-date writes are the same
 * transactional path the MCP workload_balance tool uses.
 */
import { applyWorkloadShifts, workloadCards } from '@learning-hub/db'
import { balanceWorkload, catchUpBacklog, forecastWorkload } from '@learning-hub/core/workload'
import { panel } from './ui'
import type { RegisteredCommand } from './registry'

async function workloadCmd(runArgs: string[]) {
  const sub = runArgs[0] || 'forecast'
  // Shared workload projection + transactional due shifts (repos/workload) —
  // previously duplicated verbatim here and in the MCP workload_balance tool.
  const cardItems = workloadCards()

  const now = new Date()

  if (sub === 'forecast') {
    const forecast = forecastWorkload(cardItems, 14, now)
    const overdue = cardItems.filter((c) => c.due < now.toISOString() && c.state !== 0).length
    console.log(
      panel('14-Day Workload Forecast', [
        `Total active cards: ${cardItems.length}`,
        `Overdue right now:  ${overdue}`,
        '',
        ...forecast.map((f) => `  ${f.day}: ${'#'.repeat(Math.min(f.count, 30))} (${f.count})`),
      ]),
    )
    return
  }

  if (sub === 'balance') {
    const { shifts } = balanceWorkload(cardItems, { days: 14, easyDays: [0, 6], asOf: now })
    applyWorkloadShifts(shifts)
    console.log(`✔ Smoothed ${shifts.length} review due dates without compromising retention.`)
    return
  }

  if (sub === 'catchup') {
    const overdue = cardItems.filter((c) => c.due < now.toISOString() && c.state !== 0)
    const shifts = catchUpBacklog(overdue, 30, now)
    applyWorkloadShifts(shifts)
    console.log(
      `✔ Rescheduled ${shifts.length} overdue cards (lowest stability prioritized first).`,
    )
    return
  }

  console.log('Usage: learning-hub workload [forecast|balance|catchup]')
}

export const workloadCommands: RegisteredCommand[] = [
  {
    name: 'workload',
    description: 'forecast, smooth, or catch up review backlog',
    usage: '[forecast|balance|catchup]',
    run: (runArgs) => workloadCmd(runArgs),
  },
]
