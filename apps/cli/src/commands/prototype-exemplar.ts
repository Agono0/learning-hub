/**
 * Prototype & Exemplar Categorization CLI Command:
 * 1. scenarios: list the canonical category sets (Rosch 1975, Medin & Schaffer
 *    1978, Nosofsky 1986, Ashby & Gott 1988)
 * 2. evaluate: run the engine on a submission from --data, --file or stdin,
 *    printing the TSC/CTS/MCD/CRI telemetry (or JSON with --json)
 * 3. plan: model-diagnostic trials for a set, plus the multi-day study
 *    schedule when session history is provided (Landauer & Bjork 1978,
 *    Kang 2016)
 * 4. deck: FSRS-calibrated review cards scaled by the CRI
 *
 * All output shapes mirror the web handler and the MCP tools exactly — the
 * `--json` flag emits the same envelope (`{ ok, evaluation | plan, schedule |
 * deck }`) so hosts can be diffed by the host-parity test.
 */

import { readFileSync } from 'node:fs'
import { type RegisteredCommand } from './registry'
import {
  CANONICAL_CATEGORIZATION_SETS,
  categorizationSubmissionSchema,
  evaluateCategorizationSession,
  findCategorySet,
  generateCategorizationDeck,
  planCategorizationStudy,
  planDiscriminatingBlock,
  studyPlanSessionSchema,
  type CategorizationEvaluation,
  type StudyPlan,
} from '@learning-hub/core'

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1]
  }
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
  if (file) return JSON.parse(readFileSync(file, 'utf8'))
  return JSON.parse(readFileSync(0, 'utf8'))
}

function printEvaluation(evaluation: CategorizationEvaluation): void {
  console.log('\nPrototype & Exemplar Categorization Telemetry')
  console.log('Citations: Rosch (1975); Reed (1972); Nosofsky (1986); Ashby & Gott (1988)')
  console.log('═'.repeat(65))
  console.log(`Category Set:       ${evaluation.setTitle} (${evaluation.setId})`)
  console.log(
    `TSC:                ${evaluation.tsc}/100 (typicality gradient vs ${evaluation.typicalityReference})`,
  )
  console.log(`CTS:                ${evaluation.cts}/100 (never-studied transfer items)`)
  console.log(`Overall Accuracy:   ${evaluation.overallAccuracy}/100`)
  console.log(`MCD:                ${evaluation.mcd}/100 (best model reproduces your choices)`)
  console.log(`CRI:                ${evaluation.cri}/100 (composite index)`)
  console.log(`Maturity Band:      ${evaluation.maturityBand}`)
  console.log(`Better Model:       ${evaluation.modelComparison.betterRepresentation}`)
  console.log(
    `  Prototype fit:    LL ${evaluation.modelComparison.prototype.logLikelihood} (AIC ${evaluation.modelComparison.prototype.aic}, BIC ${evaluation.modelComparison.prototype.bic})`,
  )
  console.log(
    `  GCM fit:          LL ${evaluation.modelComparison.exemplar.logLikelihood} (AIC ${evaluation.modelComparison.exemplar.aic}, BIC ${evaluation.modelComparison.exemplar.bic})`,
  )
  if (evaluation.modelComparison.ruleFit) {
    console.log(
      `  Rule fit:         ${Math.round(evaluation.modelComparison.ruleFit.agreement * 100)}% agreement (Ashby & Gott 1988)`,
    )
  }
  if (evaluation.divergentItems.length > 0) {
    console.log('Divergent Items (prototype vs GCM split):')
    for (const item of evaluation.divergentItems) {
      console.log(
        `  - ${item.label}: P_proto ${item.prototypePA.toFixed(2)} vs P_gcm ${item.gcmPA.toFixed(2)} (split ${item.divergence.toFixed(2)})`,
      )
    }
  }
  console.log('─'.repeat(65))
  for (const strength of evaluation.strengths) console.log(`Strength:   ${strength}`)
  for (const vulnerability of evaluation.vulnerabilities)
    console.log(`Watch out:  ${vulnerability}`)
  for (const feedback of evaluation.pedagogicalFeedback) console.log(`Next step:  ${feedback}`)
}

function printSchedule(schedule: StudyPlan): void {
  console.log(
    `\nStudy Schedule — ${schedule.horizonDays} days from ${schedule.days[0]?.day ?? '?'}`,
  )
  console.log('Landauer & Bjork (1978) expanding retrieval; Kang (2016) interleaving')
  console.log('═'.repeat(65))
  for (const day of schedule.days) {
    if (day.blocks.length === 0) {
      console.log(`${day.day}  rest day (spacing needs gaps — do not backfill)`)
      continue
    }
    for (const block of day.blocks) {
      const refresh =
        block.kind === 'refresh' ? ` #${block.retrievalOrdinal} (+${block.intervalDays}d)` : ''
      console.log(
        `${day.day}  ${block.kind}${refresh}: ${block.setTitle} — ${block.trials.length} trials`,
      )
    }
  }
  console.log('─'.repeat(65))
  for (const note of schedule.notes) console.log(`Note: ${note}`)
}

export function prototypeExemplarCommand(args: string[]): void {
  const sub = args[0] || 'scenarios'

  if (sub === 'scenarios' || sub === 'list') {
    console.log(
      `\nCanonical Categorization Category Sets (${CANONICAL_CATEGORIZATION_SETS.length} available)`,
    )
    console.log('═'.repeat(65))
    for (const set of CANONICAL_CATEGORIZATION_SETS) {
      console.log(`- [${set.difficulty.toUpperCase()}] ${set.title} (${set.id})`)
      console.log(`  Structure:   ${set.structureKind}`)
      console.log(`  Categories:  A = ${set.categoryLabels.A} | B = ${set.categoryLabels.B}`)
      console.log(
        `  Items:       ${set.studyItems.length} study / ${set.testItems.length} test (${set.testItems.filter((t) => t.isTransfer).length} transfer)`,
      )
      console.log(`  Framing:     ${set.pedagogicalFraming}`)
      console.log('─'.repeat(65))
    }
    return
  }

  if (sub === 'evaluate') {
    const parsed = categorizationSubmissionSchema.safeParse(readJsonPayload(args))
    if (!parsed.success) {
      console.error('Invalid submission:', parsed.error.message)
      process.exitCode = 1
      return
    }
    const set = findCategorySet(parsed.data.setId)
    const evaluation = evaluateCategorizationSession(set, parsed.data)
    if (hasFlag(args, '--json')) {
      console.log(JSON.stringify({ ok: true, evaluation }))
      return
    }
    printEvaluation(evaluation)
    return
  }

  if (sub === 'plan') {
    const setId = parseFlag(args, '--set') || 'proto-bird-typicality'
    const maxTrials = parseInt(parseFlag(args, '--trials') || '6', 10)
    const set = findCategorySet(setId)
    const plan = planDiscriminatingBlock(set, maxTrials)

    let schedule: StudyPlan | null = null
    const historyPayload = parseFlag(args, '--history')
    if (historyPayload !== undefined) {
      const sessions = studyPlanSessionSchema
        .array()
        .parse(JSON.parse(readFileSync(historyPayload, 'utf8')))
      const horizonDays = parseInt(parseFlag(args, '--days') || '10', 10)
      schedule = planCategorizationStudy(sessions, {
        now: parseFlag(args, '--now') || new Date().toISOString(),
        horizonDays,
      })
    }

    if (hasFlag(args, '--json')) {
      console.log(JSON.stringify({ ok: true, plan, schedule }))
      return
    }
    console.log(`\nModel-Diagnostic Trial Plan — ${set.title}`)
    console.log('The trials where prototype and exemplar predictions split (Medin & Schaffer 1978)')
    console.log('═'.repeat(65))
    for (const [idx, trial] of plan.trials.entries()) {
      console.log(
        `${idx + 1}. ${trial.label} [${trial.isTransfer ? 'transfer' : 'old'}] split ${trial.divergence.toFixed(2)}`,
      )
      console.log(`   ${trial.rationale}`)
    }
    if (schedule) printSchedule(schedule)
    return
  }

  if (sub === 'deck') {
    const setId = parseFlag(args, '--set') || 'proto-bird-typicality'
    const criBaseline = parseInt(parseFlag(args, '--cri') || '50', 10)
    const set = findCategorySet(setId)
    const neutralEvaluation = evaluateCategorizationSession(set, { setId: set.id })
    neutralEvaluation.cri = criBaseline
    const deck = generateCategorizationDeck(set, neutralEvaluation)
    if (hasFlag(args, '--json')) {
      console.log(JSON.stringify({ ok: true, deck }))
      return
    }
    console.log(`\nFSRS Review Deck — ${deck.setTitle}`)
    console.log(`CRI baseline: ${deck.criBaseline}/100 | Cards: ${deck.cards.length}`)
    console.log('═'.repeat(65))
    for (const card of deck.cards) {
      console.log(
        `[${card.cardType}] S ${card.fsrsParameters.stability}d / D ${card.fsrsParameters.difficulty}`,
      )
      console.log(`Q: ${card.front.split('\n')[1] ?? card.front}`)
      console.log('─'.repeat(65))
    }
    return
  }

  console.log('Usage: learning-hub prototype-exemplar [scenarios|evaluate|plan|deck]')
  console.log('  scenarios                       list the canonical category sets')
  console.log('  evaluate [--data|--file|--stdin] [--json]')
  console.log('                                  evaluate a completed session submission')
  console.log(
    '  plan --set <id> [--trials 6] [--history sessions.json --days 10 --now <iso>] [--json]',
  )
  console.log('                                  discriminating trials + optional schedule')
  console.log('  deck --set <id> [--cri 50] [--json]')
  console.log('                                  FSRS review cards scaled by the CRI')
}

export const prototypeExemplarCommands: RegisteredCommand[] = [
  {
    name: 'prototype-exemplar',
    description: 'Rosch (1975) & Nosofsky (1986) Prototype & Exemplar Categorization Studio',
    usage: '[scenarios|evaluate|plan|deck]',
    run: (runArgs) => prototypeExemplarCommand(runArgs),
  },
]

