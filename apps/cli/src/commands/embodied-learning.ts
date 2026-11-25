/**
 * Embodied Learning & Gesture CLI Command:
 * 1. scenarios: list the canonical embodied practice scenarios
 *    (Goldin-Meadow 2003; Bruner 1966; Fyfe et al. 2014)
 * 2. scenario --id: print one full scenario (gesture plan, ladder, tracing,
 *    enactment, reflection)
 * 3. evaluate-plan: evaluate a gesture plan from --data, --file or stdin
 * 4. mismatch: analyze gesture-speech mismatch samples
 * 5. ladder: validate a concreteness-fading ladder
 * 6. enact: score an enactment session
 *
 * Output shapes mirror the web handler and the MCP tools; --json emits the
 * same envelope so hosts can be diffed by the host-parity test.
 */

import { readFileSync } from 'node:fs'
import { type RegisteredCommand } from './registry'
import {
  analyzeMismatch,
  EnactmentSessionSchema,
  evaluateGesturePlan,
  ExplanationSampleSchema,
  FadingLadderSchema,
  GestureSpecSchema,
  getEmbodiedScenario,
  listEmbodiedScenarios,
  scoreEnactmentSession,
  STUDIO_PHASE_ORDER,
  validateFadingLadder,
} from '@learning-hub/core'
import { z } from 'zod'

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

function printScenarios(): void {
  const scenarios = listEmbodiedScenarios()
  console.log('\nEmbodied Learning & Gesture Studio — Canonical Scenarios')
  console.log(
    'Citations: Goldin-Meadow (2003); Bruner (1966); Fyfe et al. (2014); Engelkamp & Zimmer (1984)',
  )
  console.log('═'.repeat(65))
  for (const s of scenarios) {
    console.log(`${s.id}  [${s.domain}]`)
    console.log(`  ${s.title}`)
    console.log(`  ${s.concept}`)
  }
  console.log(`\nPhase order: ${STUDIO_PHASE_ORDER.join(' -> ')}`)
}

function printScenario(id: string): void {
  const s = getEmbodiedScenario(id)
  if (!s) {
    console.error(`unknown scenario: ${id}`)
    process.exitCode = 1
    return
  }
  console.log(`\n${s.title} [${s.domain}]`)
  console.log(`Concept: ${s.concept}`)
  console.log(`\nWhy embodied: ${s.whyEmbodied}`)
  console.log('\nGesture plan:')
  for (const g of s.gesturePlan) {
    console.log(`  [${g.channel}] ${g.element}`)
    console.log(`    Gesture: ${g.gestureDescription}`)
    console.log(`    Say:     ${g.verbalAnchor}`)
  }
  console.log('\nConcreteness-fading ladder:')
  s.ladder.rungs.forEach((rung, i) => {
    console.log(`  Rung ${i + 1} [${rung.modality}]: ${rung.activity}`)
    console.log(`    Bridge: ${rung.bridgePrompt}`)
  })
  console.log(`\nTracing exercise: ${s.tracingExercise}`)
  console.log(`\nEnactment task (verbal):   ${s.enactmentTask.verbalVersion}`)
  console.log(`Enactment task (enacted): ${s.enactmentTask.enactedVersion}`)
  console.log('\nReflection prompts:')
  for (const p of s.reflectionPrompts) console.log(`  - ${p}`)
  console.log('\nCitations:')
  for (const c of s.citations) console.log(`  - ${c}`)
}

function embodiedLearningCommand(args: string[]): void {
  const sub = args[0] ?? 'scenarios'
  const asJson = hasFlag(args, '--json')

  switch (sub) {
    case 'scenarios': {
      if (asJson) {
        console.log(
          JSON.stringify({
            ok: true,
            scenarios: listEmbodiedScenarios(),
            phases: STUDIO_PHASE_ORDER,
          }),
        )
      } else {
        printScenarios()
      }
      return
    }
    case 'scenario': {
      const id = parseFlag(args, '--id') ?? args[1]
      if (!id) {
        console.error('usage: embodied-learning scenario --id <scenario-id>')
        process.exitCode = 1
        return
      }
      const scenario = getEmbodiedScenario(id)
      if (!scenario) {
        console.error(`unknown scenario: ${id}`)
        process.exitCode = 1
        return
      }
      if (asJson) {
        console.log(JSON.stringify({ ok: true, scenario }))
      } else {
        printScenario(id)
      }
      return
    }
    case 'evaluate-plan': {
      const body = z
        .object({
          plan: z.array(GestureSpecSchema).min(1),
          coreElements: z.array(z.string().min(1)).min(1),
        })
        .parse(readJsonPayload(args))
      const report = evaluateGesturePlan(body.plan, body.coreElements)
      if (asJson) {
        console.log(JSON.stringify({ ok: true, report }))
      } else {
        console.log('\nGesture Plan Evaluation')
        console.log(`Covered elements: ${report.coveredElements.join(', ') || '(none)'}`)
        console.log(`Missing elements: ${report.missingElements.join(', ') || '(none)'}`)
        console.log(`Channels used:    ${report.channels.join(', ')}`)
        for (const a of report.advice) console.log(`  - ${a}`)
      }
      return
    }
    case 'mismatch': {
      const body = z
        .object({ samples: z.array(ExplanationSampleSchema) })
        .parse(readJsonPayload(args))
      const report = analyzeMismatch(body.samples)
      if (asJson) {
        console.log(JSON.stringify({ ok: true, report }))
      } else {
        console.log('\nGesture-Speech Mismatch Analysis (Church & Goldin-Meadow 1986)')
        console.log(`Aligned:      ${report.alignedCount}`)
        console.log(`Mismatched:   ${report.mismatchCount}`)
        console.log(`Mismatch rate: ${Math.round(report.mismatchRate * 100)}%`)
        console.log(
          `Transitional:  ${report.transitional ? 'yes — prime moment for instruction' : 'no'}`,
        )
        for (const c of report.coaching) console.log(`  - ${c}`)
      }
      return
    }
    case 'ladder': {
      const body = z.object({ ladder: FadingLadderSchema }).parse(readJsonPayload(args))
      const report = validateFadingLadder(body.ladder)
      if (asJson) {
        console.log(JSON.stringify({ ok: true, report }))
      } else {
        console.log('\nConcreteness-Fading Ladder Validation (Fyfe et al. 2014)')
        console.log(report.valid ? 'Valid fading ladder.' : 'Problems found:')
        for (const p of report.problems) console.log(`  - ${p}`)
      }
      return
    }
    case 'enact': {
      const body = z.object({ session: EnactmentSessionSchema }).parse(readJsonPayload(args))
      const report = scoreEnactmentSession(body.session)
      if (asJson) {
        console.log(JSON.stringify({ ok: true, report }))
      } else {
        console.log('\nEnactment Session Score (Engelkamp & Zimmer 1984)')
        console.log(`Enacted recall: ${Math.round(report.enactedRecall * 100)}%`)
        console.log(`Verbal recall:  ${Math.round(report.verbalRecall * 100)}%`)
        console.log(`Advantage:      ${Math.round(report.enactmentAdvantage * 100)} pts`)
        console.log(report.interpretation)
      }
      return
    }
    default:
      console.error(`unknown subcommand: ${sub}`)
      console.error(
        'usage: embodied-learning [scenarios|scenario|evaluate-plan|mismatch|ladder|enact] [--json]',
      )
      process.exitCode = 1
  }
}

export const embodiedLearningCommands: RegisteredCommand[] = [
  {
    name: 'embodied-learning',
    description: 'Goldin-Meadow (2003) Gesture & Embodied Cognition Studio',
    usage: '[scenarios|scenario|evaluate-plan|mismatch|ladder|enact]',
    run: (runArgs) => embodiedLearningCommand(runArgs),
  },
]
