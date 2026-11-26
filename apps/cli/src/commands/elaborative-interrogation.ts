/**
 * Elaborative Interrogation CLI command (`ei`).
 *
 *   ei prompt "<fact>" [--style why-true|...] [--json]   print a "why" prompt for a fact
 *   ei grade "<fact>" "<your explanation>" [--json]       score an explanation with the rubric
 *   ei lint <file.txt> [--json]                           extract facts from a text file and lint them
 *   ei recall <passage.txt> <recall.txt> [--json]         score a free-recall attempt against a passage
 *   ei styles                                             list prompt styles and their levels
 *
 * Calls the SAME pure functions as the web handler
 * (apps/web/src/server/handlers/elaborative-interrogation/route.ts) and the MCP
 * tools, so identical input gives identical output on every host. Nothing is
 * stored: this command is stateless.
 */
import {
  STYLE_LADDER,
  buildPrompt,
  classifyFact,
  eiFactSchema,
  extractFacts,
  gradeExplanation,
  gradeToFsrsRating,
  lintFacts,
  promptStyleSchema,
  type PromptStyle,
} from '@learning-hub/core/elaborative-interrogation'
import { gapsToEiFacts, scoreRecall, splitIdeaUnits } from '@learning-hub/core/free-recall'
import { type RegisteredCommand } from './registry'

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined
}

/** Positional args: everything that is not a --flag or a --flag's value. */
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

const USAGE =
  'usage: ei prompt "<fact>" [--style S] | ei grade "<fact>" "<answer>" | ei lint <file> | ei recall <passage> <recall> | ei styles [--json]'

function fail(message: string): void {
  console.error(message)
  process.exitCode = 1
}

/** Run one `ei` invocation. Exported for tests. */
export async function elaborativeInterrogationCommand(args: string[]): Promise<void> {
  const [sub = 'styles', ...rest] = args
  const asJson = args.includes('--json')
  const pos = positionals(rest)

  if (sub === 'styles') {
    const rows = STYLE_LADDER.map((style) => ({
      style,
      level: buildPrompt(
        eiFactSchema.parse({ id: 'x', statement: 'Heat causes metal to expand.' }),
        style,
      ).level,
    }))
    if (asJson) console.log(JSON.stringify({ ok: true, styles: rows }, null, 2))
    else for (const r of rows) console.log(`${r.style.padEnd(20)} level ${r.level}`)
    return
  }

  if (sub === 'prompt') {
    const statement = pos[0]
    if (!statement) return fail(USAGE)
    const parsedFact = eiFactSchema.safeParse({ id: 'cli', statement })
    if (!parsedFact.success) return fail('Fact must be 8 to 600 characters.')
    const rawStyle = flag(rest, '--style') ?? 'why-true'
    const style = promptStyleSchema.safeParse(rawStyle)
    if (!style.success) return fail(`Unknown style "${rawStyle}". Run: ei styles`)
    const prompt = buildPrompt(parsedFact.data, style.data as PromptStyle)
    if (asJson)
      console.log(JSON.stringify({ ok: true, kind: classifyFact(statement), prompt }, null, 2))
    else console.log(prompt.text)
    return
  }

  if (sub === 'grade') {
    const [statement, answer] = pos
    if (!statement || answer === undefined) return fail(USAGE)
    const parsedFact = eiFactSchema.safeParse({ id: 'cli', statement })
    if (!parsedFact.success) return fail('Fact must be 8 to 600 characters.')
    if (answer.length > 4000) return fail('Answer is limited to 4000 characters.')
    const grade = gradeExplanation(parsedFact.data, answer)
    const fsrsRating = gradeToFsrsRating(grade)
    if (asJson) {
      console.log(JSON.stringify({ ok: true, grade, fsrsRating }, null, 2))
      return
    }
    console.log(`Score ${grade.total}/100 (${grade.band}), FSRS rating ${fsrsRating}`)
    for (const r of grade.rubric)
      console.log(`  ${r.label.padEnd(26)} ${String(r.score).padStart(2)}/${r.max}  ${r.note}`)
    for (const f of grade.feedback) console.log(`- ${f}`)
    return
  }

  if (sub === 'lint') {
    const file = pos[0]
    if (!file) return fail(USAGE)
    // Dynamic import keeps node:fs out of the module graph until the command runs.
    const { readFile } = await import('node:fs/promises')
    let text: string
    try {
      text = await readFile(file, 'utf8')
    } catch {
      return fail(`Cannot read ${file}`)
    }
    const facts = extractFacts(text)
    const issues = lintFacts(facts)
    if (asJson) console.log(JSON.stringify({ ok: true, facts: facts.length, issues }, null, 2))
    else {
      console.log(`${facts.length} fact(s), ${issues.length} issue(s)`)
      for (const i of issues) console.log(`  ${i.factId} ${i.code}: ${i.message}`)
    }
    return
  }

  if (sub === 'recall') {
    const [passageFile, recallFile] = pos
    if (!passageFile || !recallFile) return fail(USAGE)
    const { readFile } = await import('node:fs/promises')
    let passage: string
    let recall: string
    try {
      ;[passage, recall] = await Promise.all([
        readFile(passageFile, 'utf8'),
        readFile(recallFile, 'utf8'),
      ])
    } catch {
      return fail('Cannot read the passage or recall file')
    }
    if (passage.trim().length < 40) return fail('Passage must be at least 40 characters.')
    const report = scoreRecall(splitIdeaUnits(passage), recall)
    if (asJson) {
      console.log(JSON.stringify({ ok: true, report, eiFacts: gapsToEiFacts(report) }, null, 2))
      return
    }
    console.log(
      `Recall ${report.recallScore}/100 (${report.band}): ${report.recalled} recalled, ${report.partial} partial, ${report.missed} missed`,
    )
    for (const u of report.units) console.log(`  [${u.status}] ${u.unit.text}`)
    for (const f of report.feedback) console.log(`- ${f}`)
    return
  }

  fail(USAGE)
}

export const elaborativeInterrogationCommands: RegisteredCommand[] = [
  {
    name: 'ei',
    description: 'Elaborative interrogation: why-prompts and rubric grading of explanations',
    usage: '[prompt|grade|lint|recall|styles]',
    run: (runArgs) => elaborativeInterrogationCommand(runArgs),
  },
]
