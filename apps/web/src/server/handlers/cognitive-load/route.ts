/**
 * @file apps/web/src/server/handlers/cognitive-load/route.ts
 * @description Runtime-neutral API handler for Cognitive Load Theory (CLT) & Flow State Balancer Studio.
 *
 * Implements:
 * - GET /api/cognitive-load — Retrieves calibrated benchmark scenarios and baseline cognitive load profiles.
 * - POST /api/cognitive-load — Evaluates telemetry into tripartite load, Paas 2D efficiency,
 *                             Csikszentmihalyi flow channel, Pollock scaffolding, and FSRS-6 modulation.
 *
 * Strictly adheres to AGENTS.md Rule 2 (runtime-neutral, zero node:* imports)
 * and Rule 5 (Zod validation at boundaries).
 */

import { z } from 'zod'
import {
  CALIBRATED_COGNITIVE_LOAD_SCENARIOS,
  evaluateComprehensiveCognitiveLoad,
} from '@learning-hub/core/cognitive-load'
import { readJson, withRoute } from '@/lib/api'

const TelemetrySchema = z.object({
  responseLatencyMs: z.number().min(0).max(3_600_000).default(3500),
  baselineLatencyMs: z.number().positive().max(3_600_000).optional(),
  keystrokeTimestamps: z.array(z.number().min(0)).max(5000).optional(),
  backspaceCount: z.number().int().min(0).max(1000).default(0),
  recentErrorsInLast5Cards: z.number().int().min(0).max(5).default(0),
  subjectiveMentalEffortRating: z.number().min(1).max(9).optional(),
  taskElementCount: z.number().min(1).max(20).optional(),
  learnerDomainMastery: z.number().min(0).max(1).optional(),
  targetTaskDifficulty: z.number().min(0).max(1).optional(),
})

const CognitiveLoadRequestSchema = z.object({
  action: z
    .enum(['evaluate_telemetry', 'benchmark_scenario', 'pollock_scaffold'])
    .default('evaluate_telemetry'),
  scenarioId: z.string().default('distributed_paxos_consensus'),
  telemetry: TelemetrySchema.optional(),
  stageIndex: z.number().int().min(1).max(3).optional(),
})

export const GET = withRoute(async () => {
  return Response.json({
    success: true,
    capacityLimit: 4.0, // Cowan (2001) working memory chunk capacity
    benchmarks: CALIBRATED_COGNITIVE_LOAD_SCENARIOS,
    baselineProfiles: {
      optimal_flow: {
        title: 'Optimal Flow State Profile',
        responseLatencyMs: 3400,
        baselineLatencyMs: 4000,
        keystrokeTimestamps: [0, 140, 290, 430, 580, 720],
        backspaceCount: 0,
        recentErrorsInLast5Cards: 0,
        subjectiveMentalEffortRating: 4,
        taskElementCount: 4,
        learnerDomainMastery: 0.8,
        targetTaskDifficulty: 0.82,
      },
      cognitive_thrashing: {
        title: 'Critical Cognitive Thrashing Profile',
        responseLatencyMs: 14500,
        baselineLatencyMs: 3800,
        keystrokeTimestamps: [0, 200, 1800, 2000, 3600, 4800],
        backspaceCount: 8,
        recentErrorsInLast5Cards: 3,
        subjectiveMentalEffortRating: 9,
        taskElementCount: 9,
        learnerDomainMastery: 0.2,
        targetTaskDifficulty: 0.9,
      },
      cognitive_underload: {
        title: 'Boredom / Underload Profile',
        responseLatencyMs: 750,
        baselineLatencyMs: 4000,
        keystrokeTimestamps: [0, 90, 180, 270],
        backspaceCount: 0,
        recentErrorsInLast5Cards: 0,
        subjectiveMentalEffortRating: 1,
        taskElementCount: 2,
        learnerDomainMastery: 0.95,
        targetTaskDifficulty: 0.35,
      },
    },
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, CognitiveLoadRequestSchema)
  const scenario =
    CALIBRATED_COGNITIVE_LOAD_SCENARIOS[body.scenarioId] ??
    CALIBRATED_COGNITIVE_LOAD_SCENARIOS['distributed_paxos_consensus']!

  const telemetry = body.telemetry ?? {
    responseLatencyMs: 3800,
    baselineLatencyMs: 4000,
    backspaceCount: 1,
    recentErrorsInLast5Cards: 0,
    taskElementCount: scenario.elementInteractivityScore,
    learnerDomainMastery: 0.7,
    targetTaskDifficulty: 0.75,
  }

  // Sort keystrokes if present to ensure proper interval calculations
  const sortedKeystrokes = telemetry.keystrokeTimestamps
    ? [...telemetry.keystrokeTimestamps].sort((a, b) => a - b)
    : undefined

  const evaluation = evaluateComprehensiveCognitiveLoad({
    responseLatencyMs: telemetry.responseLatencyMs,
    baselineLatencyMs: telemetry.baselineLatencyMs,
    keystrokeTimestamps: sortedKeystrokes,
    backspaceCount: telemetry.backspaceCount,
    recentErrorsInLast5Cards: telemetry.recentErrorsInLast5Cards,
    subjectiveMentalEffortRating: telemetry.subjectiveMentalEffortRating,
    taskElementCount: telemetry.taskElementCount ?? scenario.elementInteractivityScore,
    learnerDomainMastery: telemetry.learnerDomainMastery ?? 0.7,
    targetTaskDifficulty: telemetry.targetTaskDifficulty ?? 0.75,
  })

  // Pollock isolated elements stage progression
  const requestedStageIndex = body.stageIndex ?? evaluation.recommendedScaffoldStage.phaseIndex
  const activeScaffoldStage =
    scenario.defaultScaffoldStages.find((s) => s.phaseIndex === requestedStageIndex) ??
    scenario.defaultScaffoldStages[0]!

  return Response.json({
    success: true,
    action: body.action,
    scenarioId: scenario.id,
    evaluation,
    activeScaffoldStage,
  })
})
