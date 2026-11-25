/**
 * `study-session` CLI command: pick a bounded set of cards by deck, tag,
 * state, lapses, due window and estimated recall. Read-only: it never
 * schedules or reviews anything. Uses the same pipeline as
 * GET /api/study-session/preview and the MCP study_session_preview tool
 * (repos/study-session.runStudySession). Assumptions print under the list.
 */
import { runStudySession } from '@learning-hub/db'
import { panel } from './ui'
import type { RegisteredCommand } from './registry'

const USAGE = [
  'Usage: learning-hub study-session preview [--decks 1,2] [--tags a,b] [--states 1,2,3]',
  '                [--min-lapses N] [--max-lapses N] [--recall-below 0.01-0.99]',
  '                [--due-by DAYS] [--sort most-overdue|lowest-recall|most-lapses|newest]',
  '                [--limit 1-100] [--json]',
].join('\n')

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

function num(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined) return undefined
  const n = Number(raw)
  if (raw.trim() === '' || !Number.isFinite(n)) throw new Error(`${name} must be a number`)
  return n
}

function ints(raw: string | undefined, name: string): number[] | undefined {
  if (raw === undefined) return undefined
  return raw.split(',').map((x) => {
    const n = Number(x.trim())
    if (!/^\d+$/.test(x.trim()) || !Number.isSafeInteger(n))
      throw new Error(`${name} must be a comma-separated list of integers`)
    return n
  })
}

/**
 * Turn `preview` flags into the object core validates. Range checks live in
 * core (parseStudySessionFilter), so the CLI, API and MCP cannot drift.
 */
export function parseStudySessionArgs(args: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const set = (k: string, v: unknown) => {
    if (v !== undefined) out[k] = v
  }
  set('deckIds', ints(flag(args, '--decks'), '--decks'))
  const tags = flag(args, '--tags')
  set('tags', tags === undefined ? undefined : tags.split(',').map((t) => t.trim()))
  set('states', ints(flag(args, '--states'), '--states'))
  set('minLapses', num(flag(args, '--min-lapses'), '--min-lapses'))
  set('maxLapses', num(flag(args, '--max-lapses'), '--max-lapses'))
  set('recallBelow', num(flag(args, '--recall-below'), '--recall-below'))
  set('dueByDays', num(flag(args, '--due-by'), '--due-by'))
  set('sort', flag(args, '--sort'))
  set('limit', num(flag(args, '--limit'), '--limit'))
  return out
}

const pct = (n: number | null) => (n === null ? 'n/a' : `${Math.round(n * 100)}%`)

async function studySessionCmd(args: string[]) {
  const sub = args[0] ?? 'help'
  const asJson = args.includes('--json')
  if (sub !== 'preview') return void console.log(USAGE)

  let input: Record<string, unknown>
  try {
    input = parseStudySessionArgs(args.slice(1))
  } catch (err) {
    console.error((err as Error).message)
    process.exitCode = 1
    return
  }
  const run = await runStudySession(input)
  if (!run.ok) {
    console.error(run.error)
    process.exitCode = 1
    return
  }
  const v = run.value
  if (asJson) return void console.log(JSON.stringify({ ok: true, ...v }, null, 2))
  console.log(
    panel(
      'Study session',
      [
        `${v.selected} cards picked of ${v.matched} that match (${v.scanned} scanned)`,
        ...v.funnel.map((f) => `  ${f.label}: ${f.count}`),
        `Left out: ${v.excluded.suspended} suspended, ${v.excluded.buried} buried`,
        v.truncated
          ? `The list is capped at ${v.selected}. ${v.matched - v.selected} more match.`
          : '',
      ].filter(Boolean),
    ),
  )
  for (const c of v.cards)
    console.log(`#${c.id}  ${c.label}  (${c.deck}, ${c.lapses} lapses, recall ${pct(c.recall)})`)
  if (v.startHref) console.log(`\nOpen in the review queue: ${v.startHref}`)
  console.log(`\n${v.note}`)
  console.log('\nHow to read this:')
  for (const a of v.assumptions) console.log(`  - ${a}`)
}

export const studySessionCommands: RegisteredCommand[] = [
  {
    name: 'study-session',
    description: 'pick a bounded set of cards by tag, state, lapses, due and recall',
    usage: '[preview]',
    run: (runArgs) => studySessionCmd(runArgs),
  },
]
