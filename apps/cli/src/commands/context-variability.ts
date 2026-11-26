/**
 * Context Variability CLI command (`ctxv`).
 *
 *   ctxv status [--json]                          open session and recent sessions
 *   ctxv start <place> [--noise quiet|moderate|loud]
 *   ctxv end
 *   ctxv log <place> <startISO> <endISO>          record a past session
 *   ctxv audit [--days N] [--json]                recall by place and time of day
 *   ctxv goal add <label> <place> <fromHour> <toHour>
 *   ctxv goal archive <id>
 *
 * Calls the same repository functions as the web handler and the MCP tools.
 */
import {
  ContextLimitError,
  ContextValidationError,
  addContextGoal,
  archiveContextGoal,
  endContextSession,
  getOpenContextSession,
  listContextGoals,
  listContextSessions,
  logContextSession,
  runContextAuditDb,
  startContextSession,
} from '@learning-hub/db'
import type { RegisteredCommand } from './registry'

const USAGE =
  'usage: ctxv status | start <place> [--noise N] | end | log <place> <startISO> <endISO> | audit [--days N] | goal add <label> <place> <from> <to> | goal archive <id>'

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined
}

function positionals(args: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (a === '--json') continue
    if (a.startsWith('--')) {
      i++
      continue
    }
    out.push(a)
  }
  return out
}

function fail(message: string): void {
  console.error(message)
  process.exitCode = 1
}

const pct = (n: number | null) => (n === null ? 'n/a' : `${Math.round(n * 100)}%`)

/** Run one `ctxv` invocation. Exported for tests. */
export async function contextVariabilityCommand(args: string[]): Promise<void> {
  const [sub = 'status', ...rest] = args
  const asJson = args.includes('--json')
  const pos = positionals(rest)
  try {
    if (sub === 'status') {
      const open = getOpenContextSession()
      const sessions = listContextSessions(10)
      if (asJson) return console.log(JSON.stringify({ ok: true, open, sessions }, null, 2))
      console.log(open ? `Studying at ${open.place} since ${open.startedAt}` : 'No open session.')
      for (const s of sessions)
        console.log(`  ${s.startedAt}  ${s.place}${s.endedAt ? '' : ' (open)'}`)
      return
    }
    if (sub === 'start') {
      if (!pos[0]) return fail(USAGE)
      const r = startContextSession({ place: pos[0], noise: flag(rest, '--noise') ?? null })
      if (asJson) return console.log(JSON.stringify({ ok: true, ...r }, null, 2))
      console.log(
        r.created ? `Started at ${r.session.place}.` : `Already studying at ${r.session.place}.`,
      )
      return
    }
    if (sub === 'end') {
      const s = endContextSession()
      if (!s) return fail('No open session to end.')
      if (asJson) return console.log(JSON.stringify({ ok: true, session: s }, null, 2))
      console.log(`Ended session at ${s.place}.`)
      return
    }
    if (sub === 'log') {
      const [place, startedAt, endedAt] = pos
      if (!place || !startedAt || !endedAt) return fail(USAGE)
      const r = logContextSession({
        place,
        startedAt,
        endedAt,
        noise: flag(rest, '--noise') ?? null,
      })
      if (asJson) return console.log(JSON.stringify({ ok: true, ...r }, null, 2))
      console.log(r.created ? 'Logged.' : 'Already logged.')
      return
    }
    if (sub === 'audit') {
      const days = Number(flag(rest, '--days') ?? 60)
      const run = runContextAuditDb({
        windowDays: Number.isFinite(days) ? Math.min(365, Math.max(7, days)) : 60,
      })
      if (asJson) return console.log(JSON.stringify({ ok: true, ...run }, null, 2))
      console.log(run.report.headline)
      for (const g of run.audit.byPlace)
        console.log(`  ${g.key.padEnd(18)} ${String(g.n).padStart(5)} reviews  ${pct(g.rate)}`)
      for (const a of run.report.advice) console.log(`- ${a}`)
      for (const g of run.audit.goals)
        console.log(`Goal ${g.label}: ${g.status}, ${g.reviewsToFamiliar} reviews to familiar`)
      return
    }
    if (sub === 'goal') {
      const [action, ...gp] = pos
      if (action === 'add') {
        const [label, place, from, to] = gp
        if (!label || !place || from === undefined || to === undefined) return fail(USAGE)
        const r = addContextGoal({ label, place, startHour: Number(from), endHour: Number(to) })
        if (asJson) return console.log(JSON.stringify({ ok: true, ...r }, null, 2))
        console.log(`${r.created ? 'Added' : 'Updated'} goal #${r.goal.id}.`)
        return
      }
      if (action === 'archive') {
        const id = Number(gp[0])
        if (!Number.isInteger(id)) return fail(USAGE)
        if (!archiveContextGoal(id)) return fail('Goal not found.')
        console.log('Archived.')
        return
      }
      if (!action) {
        const goals = listContextGoals()
        if (asJson) return console.log(JSON.stringify({ ok: true, goals }, null, 2))
        for (const g of goals)
          console.log(`#${g.id} ${g.label} ${g.place} ${g.startHour}-${g.endHour}`)
        return
      }
    }
    fail(USAGE)
  } catch (e) {
    if (e instanceof ContextValidationError || e instanceof ContextLimitError)
      return fail(e.message)
    throw e
  }
}

export const contextVariabilityCommands: RegisteredCommand[] = [
  {
    name: 'ctxv',
    description: 'Context variability: log where you study and audit recall across places',
    usage: '[status|start|end|log|audit|goal]',
    run: (runArgs) => contextVariabilityCommand(runArgs),
  },
]
