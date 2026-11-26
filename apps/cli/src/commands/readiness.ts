/**
 * `readiness` CLI command: how much of your card memory the FSRS model expects
 * you to recall on an exam date, with and without a hypothetical review plan.
 * Read-only. Uses the same pipeline as GET /api/readiness and the MCP
 * readiness_report tool (repos/readiness.runReadiness). Figures are model
 * estimates, so the assumptions print under the numbers and ride along in
 * `--json`.
 */
import { listReadinessExams, runReadiness, type ReadinessQuery } from '@learning-hub/db'
import { panel } from './ui'
import type { RegisteredCommand } from './registry'

const USAGE = [
  'Usage: learning-hub readiness exams [--json]',
  '       learning-hub readiness report (--exam <id> | --date YYYY-MM-DD [--title T])',
  '                [--plan none|on-schedule|capacity] [--per-day N] [--target 0.5-0.99]',
  '                [--decks 1,2] [--budget N] [--json]',
].join('\n')

const pct = (n: number) => `${Math.round(n * 100)}%`

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

function intIn(raw: string | undefined, name: string, min: number, max: number, dflt: number) {
  if (raw === undefined) return dflt
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`${name} must be an integer ${min}-${max}`)
  return n
}

/** Parse `report` flags against the same bounds as the web handler. Throws on bad input. */
export function parseReadinessArgs(args: string[]): ReadinessQuery {
  const plan = flag(args, '--plan') ?? 'on-schedule'
  if (plan !== 'none' && plan !== 'on-schedule' && plan !== 'capacity')
    throw new Error('--plan must be none, on-schedule or capacity')
  const targetRaw = flag(args, '--target')
  const target = targetRaw === undefined ? 0.85 : Number(targetRaw)
  if (!Number.isFinite(target) || target < 0.5 || target > 0.99)
    throw new Error('--target must be between 0.5 and 0.99')
  const exam = flag(args, '--exam')
  const date = flag(args, '--date')
  if (exam === undefined && date === undefined)
    throw new Error('give --exam <id> or --date YYYY-MM-DD')
  const decksRaw = flag(args, '--decks')
  const deckIds = decksRaw
    ? decksRaw.split(',').map((x) => {
        const n = Number(x.trim())
        if (!Number.isInteger(n) || n <= 0) throw new Error('--decks must be positive integers')
        return n
      })
    : undefined
  return {
    examId: exam === undefined ? undefined : intIn(exam, '--exam', 1, Number.MAX_SAFE_INTEGER, 1),
    date: exam === undefined ? date : undefined,
    title: flag(args, '--title'),
    plan,
    perDay: intIn(flag(args, '--per-day'), '--per-day', 0, 1000, 20),
    target,
    deckIds,
    budget: intIn(flag(args, '--budget'), '--budget', 0, 5000, 20),
  }
}

async function readinessCmd(args: string[]) {
  const sub = args[0] ?? 'exams'
  const asJson = args.includes('--json')

  if (sub === 'exams') {
    const exams = listReadinessExams()
    if (asJson) return void console.log(JSON.stringify({ ok: true, exams }, null, 2))
    if (exams.length === 0)
      return void console.log('No saved exams. Use: readiness report --date YYYY-MM-DD')
    for (const e of exams) console.log(`#${e.id}  ${e.date}  ${e.title}`)
    return
  }

  if (sub === 'report') {
    let query: ReadinessQuery
    try {
      query = parseReadinessArgs(args.slice(1))
    } catch (err) {
      console.error((err as Error).message)
      process.exitCode = 1
      return
    }
    const run = await runReadiness(query)
    if (!run.ok) {
      console.error(run.error)
      process.exitCode = 1
      return
    }
    const { report, review } = run.value
    if (asJson) return void console.log(JSON.stringify({ ok: true, report, review }, null, 2))
    const o = report.overall
    console.log(
      panel(`Exam readiness: ${report.target.title} (${report.target.date})`, [
        report.expired ? 'The exam date has passed.' : `${report.daysLeft} days left`,
        `If you stop reviewing today: ${pct(o.baselineRecall)}`,
        `With the review scenario:    ${pct(o.plannedRecall)}`,
        `Cards: ${o.cards} (${o.unseen} new, not counted as forgotten)`,
        `History: ${report.confidence.level}. ${report.confidence.reason}`,
        '',
        ...report.decks.map(
          (d) =>
            `  ${d.label}: ${pct(d.plannedRecall)} planned, ${pct(d.baselineRecall)} if you stop`,
        ),
      ]),
    )
    console.log(
      `Reviewing the best ${review.budget} cards today: ${pct(review.meanRecallBefore)} -> ${pct(review.meanRecallAfter)}` +
        (review.reviewsNeededForTarget === null
          ? ''
          : `; about ${review.reviewsNeededForTarget} reviews reach ${pct(report.targetRecall)}`),
    )
    console.log('\nHow to read these numbers:')
    for (const a of report.assumptions) console.log(`  - ${a}`)
    return
  }

  console.log(USAGE)
}

export const readinessCommands: RegisteredCommand[] = [
  {
    name: 'readiness',
    description: 'model-estimated recall for an exam date',
    usage: '[exams|report]',
    run: (runArgs) => readinessCmd(runArgs),
  },
]
