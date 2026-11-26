/**
 * `rif` CLI command: retrieval-induced forgetting guard. Same repository
 * functions as the web handler (/api/retrieval-forgetting) and the MCP tools.
 *
 *   rif audit [--deck N] [--days N] [--save] [--json]   find cards crowded out by practised siblings
 *   rif rescue [--deck N] [--limit N] [--json]          the rescue queue with reverse probes
 *   rif dismiss <cardId> [--reason "..."]               leave a card out of the guard
 *   rif restore <cardId>                                put it back
 *   rif plan <id,id,...> [--budget N] [--json]          add suppressed siblings to a due list, interleaved
 *
 * Read-only for cards, schedules and reviews.
 */
import {
  dismissRifCard,
  planBalancedSession,
  restoreRifCard,
  runRifAudit,
  saveRifAudit,
} from '@learning-hub/db'
import type { RegisteredCommand } from './registry'

const USAGE =
  'usage: rif audit [--deck N] [--days N] [--save] | rif rescue [--deck N] [--limit N] | rif dismiss <cardId> [--reason T] | rif restore <cardId> | rif plan <id,id,...> [--budget N] [--json]'

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined
}

function intFlag(
  args: string[],
  name: string,
  min: number,
  max: number,
): number | undefined | Error {
  const raw = flag(args, name)
  if (raw === undefined) return undefined
  const n = Number(raw)
  if (!/^\d+$/.test(raw) || n < min || n > max)
    return new Error(`${name} must be a whole number from ${min} to ${max}`)
  return n
}

function positionals(args: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (a === '--json' || a === '--save') continue
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

/** Run one `rif` invocation. Exported for tests. */
export async function retrievalForgettingCommand(args: string[]): Promise<void> {
  const [sub = 'audit', ...rest] = args
  const asJson = args.includes('--json')
  const pos = positionals(rest)

  if (sub === 'audit' || sub === 'rescue') {
    const deck = intFlag(rest, '--deck', 1, 1_000_000_000)
    const days = intFlag(rest, '--days', 3, 120)
    const limit = intFlag(rest, '--limit', 1, 200)
    for (const v of [deck, days, limit]) if (v instanceof Error) return fail(v.message)
    const run = runRifAudit({
      deckId: deck as number | undefined,
      windowDays: days as number | undefined,
    })
    if (sub === 'audit') {
      const savedId = rest.includes('--save')
        ? saveRifAudit(run.audit, (deck as number | undefined) ?? null)
        : null
      if (asJson) {
        console.log(JSON.stringify({ ok: true, ...run, savedId }, null, 2))
        return
      }
      console.log(run.report.headline)
      console.log(
        `${run.audit.scanned} cards scanned, ${run.audit.clustered} in competing groups, ${run.audit.atRisk} high, ${run.audit.watch} watch.`,
      )
      for (const cl of run.audit.clusters) {
        console.log(
          `\n[${cl.id}] ${cl.sharedCue.join(' ') || 'shared cue'} (balance ${Math.round(cl.balance * 100)}%)`,
        )
        for (const m of cl.members)
          console.log(`  #${m.cardId} ${m.band.padEnd(5)} ${Math.round(m.risk * 100)}%  ${m.cue}`)
      }
      for (const a of run.report.advice) console.log(`- ${a}`)
      for (const c of run.report.caveats) console.log(`  (${c})`)
      if (savedId !== null) console.log(`Saved audit #${savedId}.`)
      return
    }
    const rescue = limit === undefined ? run.rescue : run.rescue.slice(0, limit as number)
    if (asJson) {
      console.log(JSON.stringify({ ok: true, rescue }, null, 2))
      return
    }
    if (rescue.length === 0) return void console.log('Nothing to rescue.')
    for (const r of rescue) {
      console.log(`#${r.cardId} ${r.band} ${Math.round(r.risk * 100)}%: ${r.reason}`)
      console.log(`    probe: ${r.reverseProbe}`)
    }
    return
  }

  if (sub === 'dismiss' || sub === 'restore') {
    const id = Number(pos[0])
    if (!Number.isInteger(id) || id < 1) return fail(USAGE)
    const ok = sub === 'dismiss' ? dismissRifCard(id, flag(rest, '--reason')) : restoreRifCard(id)
    if (asJson) return void console.log(JSON.stringify({ ok }))
    if (!ok)
      return fail(sub === 'dismiss' ? `Card ${id} not found.` : `Card ${id} was not dismissed.`)
    console.log(
      sub === 'dismiss' ? `Card ${id} is out of the guard.` : `Card ${id} is back under the guard.`,
    )
    return
  }

  if (sub === 'plan') {
    const ids = (pos[0] ?? '').split(',').filter(Boolean).map(Number)
    if (ids.length === 0 || ids.some((n) => !Number.isInteger(n) || n < 1)) return fail(USAGE)
    const budget = intFlag(rest, '--budget', 0, 50)
    if (budget instanceof Error) return fail(budget.message)
    const plan = planBalancedSession(ids, { budget })
    if (asJson) return void console.log(JSON.stringify({ ok: true, ...plan }, null, 2))
    console.log(`Session: ${plan.ids.join(', ')}`)
    for (const a of plan.added)
      console.log(`  added #${a.cardId} (sibling of #${a.becauseOf}, ${a.clusterId})`)
    return
  }

  fail(USAGE)
}

export const retrievalForgettingCommands: RegisteredCommand[] = [
  {
    name: 'rif',
    description: 'Retrieval-induced forgetting guard: find cards crowded out by practised siblings',
    usage: '[audit|rescue|dismiss|restore|plan]',
    run: (runArgs) => retrievalForgettingCommand(runArgs),
  },
]
