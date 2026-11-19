/**
 * `focus` CLI command — start a pomodoro focus session (or report cognitive
 * load via `focus load`). Session lifecycle goes through the shared
 * focus-lock repo: completing pays canonical focus XP + streak activity,
 * Ctrl+C logs a leak — identical to the web /api/focus routes.
 */
import { stdin, exit } from 'node:process'
import { abandonFocusSession, createPomodoroSession, finishFocusSession } from '@learning-hub/db'
import { focusLoadCmd } from './telemetry-audio'
import { bar } from './ui'
import type { RegisteredCommand } from './registry'

async function focus(minutesArg?: string) {
  const planned = Math.max(1, Math.min(180, Number(minutesArg ?? 25) || 25))
  // Shared session lifecycle (repos/focus-lock) — the web /api/focus routes
  // and this command now start/end sessions identically.
  const session = createPomodoroSession(planned)
  console.log(
    `⏳ Focus session #${session.id} started — ${planned} minutes. Ctrl+C to bail (it counts as a leak).`,
  )
  const startedAt = Date.now()
  const timer = setInterval(() => {
    const elapsedMin = Math.floor((Date.now() - startedAt) / 60_000)
    const left = planned - elapsedMin
    process.stdout.write(
      `\r${' '.repeat(40)}\r${left > 0 ? `${left} min left ${bar(elapsedMin, planned)}` : ''}`,
    )
    if (left <= 0) finish()
  }, 10_000)
  const finish = async () => {
    clearInterval(timer)
    clearTimeout(hardStop)
    stdin.setRawMode?.(false) // restore cooked terminal before exiting
    const actualMinutes = Math.round(((Date.now() - startedAt) / 60_000) * 10) / 10
    // Completing pays canonical focus XP + streak activity in one transaction.
    const { xpAwarded } = finishFocusSession(session.id, { actualMinutes })
    console.log(`\n✅ Focus complete: ${actualMinutes} min. +${xpAwarded} XP`)
    exit(0)
  }
  const hardStop = setTimeout(finish, planned * 60_000 + 5_000)
  // Ctrl+C = abandoned session (leak)
  stdin.setRawMode?.(true)
  stdin.on('data', (key: Buffer) => {
    if (key[0] === 3) {
      clearInterval(timer)
      clearTimeout(hardStop)
      stdin.setRawMode?.(false) // restore cooked terminal before exiting
      const actualMinutes = Math.round(((Date.now() - startedAt) / 60_000) * 10) / 10
      void Promise.resolve()
        .then(() => abandonFocusSession(session.id, { actualMinutes }))
        .then(() => {
          console.log(`\nSession ended early at ${actualMinutes} min (leak logged).`)
          exit(0)
        })
        .catch((err) => {
          console.error('Failed to log the abandoned focus session:', err)
          exit(1)
        })
    }
  })
}

export const focusCommands: RegisteredCommand[] = [
  {
    name: 'focus',
    description: 'start a focus session or report cognitive load',
    usage: '[min|load]',
    run: (runArgs) => (runArgs[0] === 'load' ? focusLoadCmd(runArgs.slice(1)) : focus(runArgs[0])),
  },
]
