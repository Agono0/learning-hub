/**
 * Feedback Literacy & Formative Assessment CLI commands:
 * 1. scenarios — list the canonical misconception-tagged formative scenarios
 * 2. classify — classify feedback statements (--data/--file/stdin JSON array)
 *    into Hattie & Timperley (2007) levels with FIT risk flags and FL metrics
 * 3. audit — Shute (2008) formative guideline audit for a statement set
 * 4. grade — grade a scenario response and print three-level feedback
 * 5. deck — FSRS-6 bridge cards from the scenario bank
 * 6. timing — Shute (2008) timing guidance for a teaching context
 *
 * All output shapes mirror the web handler and the MCP tools exactly — the
 * `--json` flag emits the same envelope so hosts can be diffed by the
 * host-parity tests.
 */

import { readBoundedJson } from '../bounded-input'
import { type RegisteredCommand } from './registry'
import {
  auditFeedbackAgainstShute,
  calculateFLMetrics,
  classifyFeedbackStatement,
  FeedbackStatementSchema,
  generateFeedbackFSRSCards,
  getCanonicalFeedbackScenarios,
  gradeScenarioResponse,
  listMisconceptionTags,
  SHUTE_GUIDELINES,
  suggestFeedbackTiming,
  type FeedbackStatement,
} from '@learning-hub/core'

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1]
  return undefined
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag)
}

/** Read a JSON payload from --data, --file or (last resort) stdin. */
function readJsonPayload(args: string[]): unknown {
  const inline = parseFlag(args, '--data')
  if (inline) return JSON.parse(inline)
  const file = parseFlag(args, '--file')
  if (file) return readBoundedJson(file)
  return readBoundedJson(0)
}

/** Parse a statements payload: a bare array, or `{ statements: [...] }`. */
function parseStatements(args: string[]): FeedbackStatement[] {
  const payload = readJsonPayload(args)
  const raw = Array.isArray(payload)
    ? payload
    : ((payload as { statements?: unknown[] }).statements ?? [])
  return raw.map((s, i) =>
    FeedbackStatementSchema.parse({
      id: (s as { id?: string }).id ?? `stmt-${i + 1}`,
      ...(s as Record<string, unknown>),
    }),
  )
}

const LEVEL_ORDER = ['task', 'process', 'self_regulation', 'self'] as const

function printClassifications(statements: FeedbackStatement[]): void {
  const classifications = statements.map(classifyFeedbackStatement)
  const metrics = calculateFLMetrics(statements)
  console.log('\nFeedback Literacy Telemetry')
  console.log('Citations: Hattie & Timperley (2007); Kluger & DeNisi (1996); Shute (2008)')
  console.log('═'.repeat(65))
  for (const c of classifications) {
    console.log(
      `${c.statementId.padEnd(10)} ${c.level.padEnd(16)} conf ${(c.confidence * 100).toFixed(0).padStart(3)}%` +
        (c.fitRisks.length > 0 ? `  risks: ${c.fitRisks.join(', ')}` : ''),
    )
  }
  console.log('─'.repeat(65))
  console.log(`Statements:           ${metrics.statementCount}`)
  for (const level of LEVEL_ORDER) {
    console.log(`  ${level.padEnd(18)}${metrics.levelCounts[level]}`)
  }
  console.log(`Formative Alignment:  ${metrics.formativeAlignmentScore}/100 (Shute 2008)`)
  console.log(`Level Balance:        ${metrics.levelBalanceScore}/100 (target mix)`)
  console.log(`Self-Focus Safety:    ${metrics.selfFocusSafetyScore}/100 (FIT risk load)`)
  console.log(`Feedback Quality:     ${metrics.feedbackQualityIndex}/100 (composite)`)
}

export const feedbackCommands: RegisteredCommand[] = [
  {
    name: 'feedback-scenarios',
    description: 'list canonical formative scenarios + Shute guidelines',
    usage: '[--json]',
    run: (args) => {
      const payload = {
        scenarios: getCanonicalFeedbackScenarios(),
        guidelines: SHUTE_GUIDELINES,
        misconceptionTags: listMisconceptionTags(),
      }
      if (hasFlag(args, '--json')) {
        console.log(JSON.stringify({ ok: true, ...payload }, null, 2))
        return
      }
      console.log('\nCanonical Formative Scenarios')
      console.log('═'.repeat(65))
      for (const s of payload.scenarios) {
        console.log(`${s.id}  [${s.domain} · difficulty ${s.difficulty}/5]`)
        console.log(`  ${s.concept}`)
      }
      console.log('\nShute (2008) Guidelines')
      console.log('═'.repeat(65))
      for (const g of payload.guidelines) {
        console.log(`${g.id}: ${g.title}`)
      }
    },
  },
  {
    name: 'feedback-classify',
    description: 'classify feedback statements (Hattie & Timperley levels + FIT risks)',
    usage: '--data <json> | --file <path> [--json]',
    run: (args) => {
      const statements = parseStatements(args)
      if (hasFlag(args, '--json')) {
        console.log(
          JSON.stringify(
            {
              ok: true,
              classifications: statements.map(classifyFeedbackStatement),
              metrics: calculateFLMetrics(statements),
            },
            null,
            2,
          ),
        )
        return
      }
      printClassifications(statements)
    },
  },
  {
    name: 'feedback-audit',
    description: 'Shute (2008) formative guideline audit for a statement set',
    usage: '--data <json> | --file <path> [--json]',
    run: (args) => {
      const statements = parseStatements(args)
      const { audits, formativeAlignmentScore } = auditFeedbackAgainstShute(statements)
      if (hasFlag(args, '--json')) {
        console.log(JSON.stringify({ ok: true, audits, formativeAlignmentScore }, null, 2))
        return
      }
      console.log('\nShute (2008) Formative Audit')
      console.log('═'.repeat(65))
      for (const a of audits) {
        console.log(`${a.status.toUpperCase().padEnd(9)} ${a.guidelineId}: ${a.rationale}`)
      }
      console.log(`\nFormative Alignment Score: ${formativeAlignmentScore}/100`)
    },
  },
  {
    name: 'feedback-grade',
    description: 'grade a scenario response, print three-level feedback',
    usage: '--scenario <id> --option <id> [--confidence 1-5] [--json]',
    run: (args) => {
      const scenarioId = parseFlag(args, '--scenario') ?? 'fb-math-fraction-addition'
      const optionId = parseFlag(args, '--option') ?? 'a'
      const confidence = Number(parseFlag(args, '--confidence') ?? '3')
      const result = gradeScenarioResponse({ scenarioId, optionId, confidence })
      if (hasFlag(args, '--json')) {
        console.log(
          JSON.stringify(
            {
              ok: true,
              isCorrect: result.isCorrect,
              misconceptionTag: result.misconceptionTag ?? null,
              hypercorrectionFlag: result.hypercorrectionFlag,
              feedback: result.feedback,
            },
            null,
            2,
          ),
        )
        return
      }
      console.log('\nFormative Feedback')
      console.log('═'.repeat(65))
      console.log(`Correct: ${result.isCorrect}`)
      if (result.misconceptionTag) console.log(`Misconception: ${result.misconceptionTag}`)
      if (result.hypercorrectionFlag) {
        console.log('High-confidence error — prioritized for review (hypercorrection)')
      }
      console.log(`\nTask:            ${result.feedback.task}`)
      console.log(`Process:         ${result.feedback.process}`)
      console.log(`Self-regulation: ${result.feedback.selfRegulation}`)
    },
  },
  {
    name: 'feedback-deck',
    description: 'generate FSRS-6 bridge cards from the scenario bank',
    usage: '[--scenarios id1,id2] [--json]',
    run: (args) => {
      const list = parseFlag(args, '--scenarios')
      const cards = generateFeedbackFSRSCards(list ? list.split(',') : undefined)
      if (hasFlag(args, '--json')) {
        console.log(JSON.stringify({ ok: true, count: cards.length, cards }, null, 2))
        return
      }
      console.log(`\nFSRS-6 Bridge Deck — ${cards.length} cards`)
      console.log('═'.repeat(65))
      for (const c of cards) {
        console.log(`[${c.tags.join(', ')}]`)
        console.log(`  Q: ${c.front}`)
        console.log(`  A: ${c.back}`)
        console.log('')
      }
    },
  },
  {
    name: 'feedback-timing',
    description: 'Shute (2008) immediate-vs-delayed timing guidance',
    usage: '[--difficulty 1-5] [--procedural] [--transfer] [--retrieval] [--json]',
    run: (args) => {
      const result = suggestFeedbackTiming({
        taskDifficulty: Number(parseFlag(args, '--difficulty') ?? '3'),
        isProcedural: hasFlag(args, '--procedural'),
        transferGoal: hasFlag(args, '--transfer'),
        isRetrievalPractice: hasFlag(args, '--retrieval'),
      })
      if (hasFlag(args, '--json')) {
        console.log(JSON.stringify({ ok: true, ...result }, null, 2))
        return
      }
      console.log(`Timing: ${result.timing}\nRationale: ${result.rationale}`)
    },
  },
]
