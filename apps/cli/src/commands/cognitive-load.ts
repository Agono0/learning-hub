/**
 * Cognitive Load Theory (CLT) CLI Command:
 * 1. benchmarks: list the calibrated benchmark scenarios (Sweller 1988/2011
 *    element-interactivity calibration) + the Cowan (2001) 4-chunk
 *    working-memory capacity limit
 * 2. evaluate: run the comprehensive engine on session telemetry from
 *    explicit flags, printing the tripartite decomposition, Paas (1992)
 *    efficiency, Csikszentmihalyi (1990) flow channel, intervention and
 *    FSRS-6 modulation (or JSON with --json)
 *
 * This complements `focus load` (telemetry-audio.ts), which only reports the
 * STORED revlog telemetry — `clt evaluate` runs the full
 * `evaluateComprehensiveCognitiveLoad` engine, the SAME call the web handler
 * (apps/web/src/server/handlers/cognitive-load/route.ts) and the headless
 * server (POST /cognitive/load/evaluate) make. Flag defaults mirror the web
 * handler's zod bounds so identical telemetry produces identical evaluations
 * on every host; `--json` emits the same envelope as the MCP tool
 * (`{ ok, scenarioId, evaluation }`) for host-parity diffing.
 */

import { type RegisteredCommand } from './registry'
// Same engine names the web handler imports (from the /cognitive-load subpath
// there); here the root barrel is used like every sibling command file —
// identical resolution under tsx, Node and the bundlers.
import {
  CALIBRATED_COGNITIVE_LOAD_SCENARIOS,
  evaluateComprehensiveCognitiveLoad,
  type ComprehensiveCognitiveLoadEvaluation,
} from '@learning-hub/core'

/** Cowan (2001) working-memory chunk capacity — the engine's decomposition bound. */
const COWAN_CAPACITY_LIMIT_CHUNKS = 4.0

/** Default benchmark scenario used when --scenario is unknown (web-handler parity). */
const DEFAULT_SCENARIO_ID = 'distributed_paxos_consensus'

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

/**
 * Parse a numeric CLI flag against the web handler's zod bounds.
 * Returns undefined when the flag is absent, null when the value is not a
 * finite number in bounds (integer-enforced when `bounds.integer`), so the
 * caller can distinguish "not provided" from "invalid".
 */
function parseBoundedNumber(
  args: string[],
  flag: string,
  bounds: { min: number; max: number; integer?: boolean },
): number | undefined | null {
  const raw = parseFlag(args, flag)
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  if (bounds.integer && !Number.isInteger(value)) return null
  if (value < bounds.min || value > bounds.max) return null
  return value
}

/**
 * Print one human-readable CLT evaluation (65-column ══ banner style,
 * labeled lines) with the research citations inline.
 */
function printEvaluation(
  scenarioId: string,
  evaluation: ComprehensiveCognitiveLoadEvaluation,
): void {
  console.log(`\nCognitive Load Theory Evaluation — ${scenarioId}`)
  console.log('Sweller (1988, 2011) tripartite CLT; Paas (1992) efficiency;')
  console.log('Csikszentmihalyi (1990) flow; Cowan (2001) 4-chunk capacity')
  console.log('═'.repeat(65))
  console.log(`Cognitive Load Index: ${evaluation.cli} / 1.00`)
  console.log('Tripartite Load (working-memory chunks):')
  console.log(
    `  Intrinsic:    ${evaluation.tripartiteLoad.intrinsicChunks} chunks (element interactivity reduced by mastery)`,
  )
  console.log(
    `  Extraneous:   ${evaluation.tripartiteLoad.extraneousChunks} chunks (presentation friction)`,
  )
  console.log(
    `  Germane:      ${evaluation.tripartiteLoad.germaneChunks} chunks (schema construction)`,
  )
  console.log(
    `  Total:        ${evaluation.tripartiteLoad.totalLoadChunks} / ${evaluation.tripartiteLoad.capacityLimit} chunks (Cowan 2001)`,
  )
  console.log(
    `  Overloaded:   ${evaluation.tripartiteLoad.isOverloaded ? 'YES' : 'no'} (headroom ${evaluation.tripartiteLoad.freeWorkingMemoryHeadroom} chunks)`,
  )
  console.log('─'.repeat(65))
  console.log(
    `Paas Efficiency:      E ${evaluation.paasEfficiency.cognitiveEfficiencyIndex} (perf z ${evaluation.paasEfficiency.performanceZ} vs effort z ${evaluation.paasEfficiency.mentalEffortZ})`,
  )
  console.log(`  Quadrant:           ${evaluation.paasEfficiency.quadrant}`)
  console.log(`  ${evaluation.paasEfficiency.interpretation}`)
  console.log('─'.repeat(65))
  console.log('Flow Channel (Csikszentmihalyi 1990):')
  console.log(`  Challenge:Skill     ${evaluation.flowEvaluation.challengeToSkillRatio}`)
  console.log(
    `  Zone:               ${evaluation.flowEvaluation.flowZone} (coherence ${evaluation.flowEvaluation.flowChannelCoherence})`,
  )
  console.log(
    `  Arousal:            ${evaluation.flowEvaluation.yerkesDodsonArousalPct}% (optimal target ${evaluation.flowEvaluation.optimalArousalTargetPct}%, Yerkes-Dodson 1908)`,
  )
  console.log(
    `  Flow corridor:      ${evaluation.flowEvaluation.isWithinFlowCorridor ? 'yes' : 'no'}`,
  )
  console.log(`  ${evaluation.flowEvaluation.guidance}`)
  console.log('─'.repeat(65))
  console.log(`Intervention:         ${evaluation.recommendedIntervention}`)
  console.log(
    `Scaffold Stage:       ${evaluation.recommendedScaffoldStage.title} (Pollock, Chandler & Sweller 2002)`,
  )
  console.log(
    `FSRS Modulation:      stability x${evaluation.fsrsModulation.stabilityMultiplier} | difficulty ${
      evaluation.fsrsModulation.difficultyDelta >= 0 ? '+' : ''
    }${evaluation.fsrsModulation.difficultyDelta} | interval x${evaluation.fsrsModulation.recommendedIntervalFactor}`,
  )
  if (evaluation.narrativeDiagnostics.length > 0) {
    console.log('Diagnostics:')
    for (const diagnostic of evaluation.narrativeDiagnostics) console.log(`  - ${diagnostic}`)
  }
}

/**
 * `clt` CLI command — full comprehensive Cognitive Load engine access from the
 * terminal. Why: closes the parity gap where the CLI could only read stored
 * telemetry (`focus load`) but never ran the tripartite/Paas/flow engine that
 * the web app and headless server use. Units/invariants: latencies are in
 * milliseconds (baseline falls back to the 4000ms population default), effort
 * uses the Paas (1992) 1-9 Likert scale, mastery/difficulty are fractions in
 * [0, 1], and every load figure is in Cowan (2001) chunks against the
 * 4.0-chunk capacity. Invalid flag values are rejected (exit code 1) rather
 * than silently clamped, matching the web handler's zod rejection behavior.
 */
export function cognitiveLoadCommand(args: string[]): void {
  const sub = args[0] || 'benchmarks'

  if (sub === 'benchmarks' || sub === 'list') {
    const scenarios = Object.values(CALIBRATED_COGNITIVE_LOAD_SCENARIOS)
    if (hasFlag(args, '--json')) {
      console.log(
        JSON.stringify({
          ok: true,
          capacityLimit: COWAN_CAPACITY_LIMIT_CHUNKS,
          scenarios: scenarios.map((s) => ({
            id: s.id,
            title: s.title,
            elementInteractivityScore: s.elementInteractivityScore,
          })),
        }),
      )
      return
    }
    console.log(`\nCalibrated Cognitive Load Benchmark Scenarios (${scenarios.length} available)`)
    console.log(`Working-memory capacity limit: ${COWAN_CAPACITY_LIMIT_CHUNKS} chunks (Cowan 2001)`)
    console.log('═'.repeat(65))
    for (const scenario of scenarios) {
      console.log(`- ${scenario.title} (${scenario.id})`)
      console.log(`  Domain:        ${scenario.domain}`)
      console.log(
        `  Interactivity: ${scenario.elementInteractivityScore}/10 simultaneous elements (Sweller 1988)`,
      )
      console.log('─'.repeat(65))
    }
    console.log('Run `learning-hub clt evaluate --scenario <id> …` for the full engine.')
    return
  }

  if (sub === 'evaluate') {
    // Bounds mirror the web handler's TelemetrySchema exactly; null = invalid.
    const latency = parseBoundedNumber(args, '--latency', { min: 0, max: 3_600_000 }) ?? 3500
    const baseline = parseBoundedNumber(args, '--baseline', { min: 1, max: 3_600_000 })
    const backspaces =
      parseBoundedNumber(args, '--backspaces', { min: 0, max: 1000, integer: true }) ?? 0
    const errors = parseBoundedNumber(args, '--errors', { min: 0, max: 5, integer: true }) ?? 0
    const effort = parseBoundedNumber(args, '--effort', { min: 1, max: 9 })
    const elements = parseBoundedNumber(args, '--elements', { min: 1, max: 20, integer: true })
    const mastery = parseBoundedNumber(args, '--mastery', { min: 0, max: 1 })
    const difficulty = parseBoundedNumber(args, '--difficulty', { min: 0, max: 1 })

    const invalid = [
      ['--latency', latency],
      ['--baseline', baseline],
      ['--backspaces', backspaces],
      ['--errors', errors],
      ['--effort', effort],
      ['--elements', elements],
      ['--mastery', mastery],
      ['--difficulty', difficulty],
    ].filter(([, v]) => v === null)
    if (invalid.length > 0) {
      console.error(
        `Invalid numeric value for: ${invalid.map(([f]) => f).join(', ')}. ` +
          'Ranges: --latency 0..3600000 ms | --baseline >0..3600000 ms | --backspaces 0..1000 | ' +
          '--errors 0..5 | --effort 1..9 | --elements 1..20 | --mastery 0..1 | --difficulty 0..1',
      )
      process.exitCode = 1
      return
    }

    const scenarioId = parseFlag(args, '--scenario') || DEFAULT_SCENARIO_ID
    const scenario =
      CALIBRATED_COGNITIVE_LOAD_SCENARIOS[scenarioId] ??
      CALIBRATED_COGNITIVE_LOAD_SCENARIOS[DEFAULT_SCENARIO_ID]!
    if (scenario.id !== scenarioId) {
      console.error(`Unknown scenario "${scenarioId}" — falling back to "${scenario.id}".`)
    }

    const evaluation = evaluateComprehensiveCognitiveLoad({
      responseLatencyMs: latency,
      // Omitted baseline falls through to the engine's 4000ms population
      // default. `?? undefined` only normalizes the type — null values were
      // already rejected by the invalid-flag guard above.
      baselineLatencyMs: baseline ?? undefined,
      backspaceCount: backspaces,
      recentErrorsInLast5Cards: errors,
      // Paas (1992) rating; engine derives one from the load index when omitted.
      subjectiveMentalEffortRating: effort ?? undefined,
      // Web-handler fallbacks: scenario interactivity, mastery 0.7, difficulty 0.75.
      taskElementCount: elements ?? scenario.elementInteractivityScore,
      learnerDomainMastery: mastery ?? 0.7,
      targetTaskDifficulty: difficulty ?? 0.75,
    })

    if (hasFlag(args, '--json')) {
      console.log(JSON.stringify({ ok: true, scenarioId: scenario.id, evaluation }))
      return
    }
    printEvaluation(scenario.id, evaluation)
    return
  }

  console.log('Usage: learning-hub clt [benchmarks|evaluate]')
  console.log('  benchmarks [--json]             list calibrated scenarios + Cowan (2001) capacity')
  console.log(
    '  evaluate [--latency 3500] [--baseline 4000] [--backspaces 0] [--errors 0] [--json]',
  )
  console.log('           [--effort 1-9] [--elements 1-20] [--mastery 0-1] [--difficulty 0-1]')
  console.log('           [--scenario <id>]')
  console.log(
    '                                  run the comprehensive CLT engine on session telemetry',
  )
}

/**
 * Registered CLI command group for the Cognitive Load Theory studio.
 *
 * What: the `clt` command (subcommands `benchmarks` | `evaluate`) wired into
 * the built-in command table. Why: host parity with the MCP
 * `cognitive_load_*` tools and the web `/api/cognitive-load` handler — one
 * engine, every host. Invariants: pure engine calls over
 * `@learning-hub/core` (cognitive-load domain); no DB access, no raw fetch,
 * no node builtins; output is deterministic for identical flag inputs.
 */
export const cognitiveLoadCommands: RegisteredCommand[] = [
  {
    name: 'clt',
    description:
      'Sweller (1988/2011) tripartite cognitive load, Paas (1992) efficiency & flow balancer',
    usage: '[benchmarks|evaluate]',
    run: (runArgs) => cognitiveLoadCommand(runArgs),
  },
]
