/**
 * Interference CLI command (`interf`).
 *
 *   interf audit [--deck N] [--days N] [--json]   lookalike pairs, worst first
 *   interf confirm <a> <b> | dismiss <a> <b> | clear <a> <b>
 *   interf drill <a> <b> [--json]                 print a discrimination drill
 *   interf log <a> <b> <correct> <total>          record drill answers
 *   interf order <id> <id> ...                    spread a queue so lookalikes are apart
 *
 * Calls the same repository functions as the web handler and the MCP tools.
 */
import {
  InterferenceLimitError,
  InterferenceValidationError,
  getPairDrill,
  logPairDrill,
  planSeparatedSession,
  runInterferenceAuditDb,
  setPairStatus,
} from '@learning-hub/db'
import type { RegisteredCommand } from './registry'

const USAGE =
  'usage: interf audit [--deck N] [--days N] | confirm|dismiss|clear <a> <b> | drill <a> <b> | log <a> <b> <correct> <total> | order <id>...'

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
const num = (s: string | undefined) => (s === undefined ? NaN : Number(s))

/** Run one `interf` invocation. Exported for tests. */
export async function interferenceCommand(args: string[]): Promise<void> {
  const [sub = 'audit', ...rest] = args
  const asJson = args.includes('--json')
  const pos = positionals(rest)
  try {
    if (sub === 'audit') {
      const deck = flag(rest, '--deck')
      const days = num(flag(rest, '--days') ?? '90')
      if (deck !== undefined && !(Number.isInteger(num(deck)) && num(deck) > 0))
        throw new Error('--deck must be a positive integer')
      const run = runInterferenceAuditDb({
        deckId: deck === undefined ? undefined : num(deck),
        windowDays: Number.isFinite(days) ? Math.min(365, Math.max(7, days)) : 90,
      })
      if (asJson) return console.log(JSON.stringify({ ok: true, ...run }, null, 2))
      console.log(run.report.headline)
      for (const p of run.audit.pairs.slice(0, 15))
        console.log(
          `  #${p.a} #${p.b}  ${p.band.padEnd(5)} ${Math.round(p.severity * 100)}%  ${p.kind}`,
        )
      for (const a of run.report.advice) console.log(`- ${a}`)
      return
    }
    if (sub === 'confirm' || sub === 'dismiss' || sub === 'clear') {
      const [a, b] = [num(pos[0]), num(pos[1])]
      if (!Number.isInteger(a) || !Number.isInteger(b)) return fail(USAGE)
      const ok = setPairStatus(
        a,
        b,
        sub === 'confirm' ? 'confirmed' : sub === 'dismiss' ? 'dismissed' : null,
      )
      if (!ok) return fail('Card not found.')
      if (asJson) return console.log(JSON.stringify({ ok: true }))
      console.log(`Pair ${Math.min(a, b)} and ${Math.max(a, b)}: ${sub}.`)
      return
    }
    if (sub === 'drill') {
      const [a, b] = [num(pos[0]), num(pos[1])]
      if (!Number.isInteger(a) || !Number.isInteger(b)) return fail(USAGE)
      const drill = getPairDrill(a, b)
      if (!drill) return fail('Both cards must exist and have a question and an answer.')
      if (asJson) return console.log(JSON.stringify({ ok: true, drill }, null, 2))
      drill.items.forEach((it, i) => console.log(`${i + 1}. ${it.prompt}\n   -> ${it.expected}`))
      console.log(drill.contrast)
      return
    }
    if (sub === 'log') {
      const [a, b, c, t] = [num(pos[0]), num(pos[1]), num(pos[2]), num(pos[3])]
      if (![a, b, c, t].every(Number.isInteger)) return fail(USAGE)
      const r = logPairDrill({ a, b, correct: c, total: t })
      if (!r) return fail('Card not found.')
      if (asJson) return console.log(JSON.stringify({ ok: true, ...r }))
      console.log(`Today: ${r.correct} of ${r.total} right.`)
      return
    }
    if (sub === 'order') {
      const ids = [...new Set(pos.map(Number))]
        .filter((n) => Number.isInteger(n) && n > 0)
        .slice(0, 2000)
      if (ids.length === 0) return fail(USAGE)
      const out = planSeparatedSession(ids)
      if (asJson) return console.log(JSON.stringify({ ok: true, ids: out }))
      console.log(out.join(' '))
      return
    }
    fail(USAGE)
  } catch (e) {
    if (e instanceof InterferenceValidationError || e instanceof InterferenceLimitError)
      return fail(e.message)
    throw e
  }
}

export const interferenceCommands: RegisteredCommand[] = [
  {
    name: 'interf',
    description: 'Interference: find lookalike cards, drill them apart, spread them in a queue',
    usage: '[audit|confirm|dismiss|clear|drill|log|order]',
    run: (runArgs) => interferenceCommand(runArgs),
  },
]
