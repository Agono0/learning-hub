/**
 * `exam-prep` CLI command: a day-by-day review schedule toward an exam date,
 * from the same model as `readiness`. Read-only: it never schedules or
 * reviews anything. Uses the same pipeline as GET /api/exam-prep and the MCP
 * exam_prep_plan tool (repos/exam-prep.runExamPrep). The assumptions print
 * under the numbers and ride along in `--json`.
 */
import { runExamPrep, type ExamPrepQuery } from '@learning-hub/db'
import { panel } from './ui'
import type { RegisteredCommand } from './registry'

const USAGE = [
  'Usage: learning-hub exam-prep plan (--exam <id> | --date YYYY-MM-DD [--title T])',
  '                [--per-day N] [--target 0.5-0.99] [--rest 0,6] [--decks 1,2]',
  '                [--min-gain 0-0.5] [--max-per-card N] [--json]',
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

function intList(raw: string | undefined, name: string, min: number, max: number, items: number) {
  if (raw === undefined) return undefined
  const out = raw.split(',').map((x) => {
    const n = Number(x.trim())
    if (!Number.isInteger(n) || n < min || n > max)
      throw new Error(`${name} must be integers ${min}-${max}`)
    return n
  })
  if (out.length > items) throw new Error(`${name} takes at most ${items} values`)
  return out
}

/** Parse `plan` flags against the same bounds as the web handler. Throws on bad input. */
export function parseExamPrepArgs(args: string[]): ExamPrepQuery {
  const targetRaw = flag(args, '--target')
  const target = targetRaw === undefined ? 0.85 : Number(targetRaw)
  if (!Number.isFinite(target) || target < 0.5 || target > 0.99)
    throw new Error('--target must be between 0.5 and 0.99')
  const gainRaw = flag(args, '--min-gain')
  const minGain = gainRaw === undefined ? 0.01 : Number(gainRaw)
  if (!Number.isFinite(minGain) || minGain < 0 || minGain > 0.5)
    throw new Error('--min-gain must be between 0 and 0.5')
  const exam = flag(args, '--exam')
  const date = flag(args, '--date')
  if (exam === undefined && date === undefined)
    throw new Error('give --exam <id> or --date YYYY-MM-DD')
  return {
    examId: exam === undefined ? undefined : intIn(exam, '--exam', 1, Number.MAX_SAFE_INTEGER, 1),
    date: exam === undefined ? date : undefined,
    title: flag(args, '--title'),
    target,
    perDay: intIn(flag(args, '--per-day'), '--per-day', 0, 100, 30),
    minGain,
    maxReviewsPerCard: intIn(flag(args, '--max-per-card'), '--max-per-card', 1, 10, 3),
    restWeekdays: intList(flag(args, '--rest'), '--rest', 0, 6, 7),
    deckIds: intList(flag(args, '--decks'), '--decks', 1, Number.MAX_SAFE_INTEGER, 200),
  }
}

async function examPrepCmd(args: string[]) {
  const sub = args[0] ?? 'help'
  const asJson = args.includes('--json')
  if (sub !== 'plan') return void console.log(USAGE)

  let query: ExamPrepQuery
  try {
    query = parseExamPrepArgs(args.slice(1))
  } catch (err) {
    console.error((err as Error).message)
    process.exitCode = 1
    return
  }
  const run = await runExamPrep(query)
  if (!run.ok) {
    console.error(run.error)
    process.exitCode = 1
    return
  }
  const { plan, title, note } = run.value
  if (asJson) return void console.log(JSON.stringify({ ok: true, title, plan, note }, null, 2))
  const s = plan.summary
  console.log(
    panel(`Exam prep: ${title} (${plan.exam.slice(0, 10)})`, [
      plan.expired ? 'The exam date has passed.' : `${plan.days.length} days from ${plan.from}`,
      `The model estimates, as of ${plan.from}, average recall on ${plan.exam.slice(0, 10)}:`,
      `  ${pct(s.baseline)} if you review nothing more`,
      `  ${pct(s.planned)} if you make all ${s.plannedReviews} planned reviews and remember each card`,
      `Cards: ${s.seenCards} studied, ${s.unseenCards} new (not planned, not counted as forgotten)`,
      `History: ${plan.confidence.level}. ${plan.confidence.reason}`,
    ]),
  )
  for (const d of plan.days) {
    if (d.rest) console.log(`${d.date}  rest`)
    else if (d.reviews.length)
      console.log(`${d.date}  ${d.reviews.length} reviews  (${pct(d.meanExamRecallAfter)})`)
  }
  console.log(`\n${note}`)
  console.log('\nHow to read these numbers:')
  for (const a of plan.assumptions) console.log(`  - ${a}`)
}

export const examPrepCommands: RegisteredCommand[] = [
  {
    name: 'exam-prep',
    description: 'model-suggested day-by-day review schedule toward an exam',
    usage: '[plan]',
    run: (runArgs) => examPrepCmd(runArgs),
  },
]
