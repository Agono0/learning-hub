/**
 * Cognitive Load Theory (CLT) & Flow State MCP Tools
 *
 * Exposes the comprehensive CLT engine (packages/core/cognitive-load) to
 * external AI agents — the SAME `evaluateComprehensiveCognitiveLoad` call the
 * web handler (apps/web/src/server/handlers/cognitive-load/route.ts) and the
 * headless server (apps/server/src/routes/cognitive.ts POST /cognitive/load/evaluate)
 * make, with the SAME result shape (host-parity contract). Pure engine
 * surfaces over packages/core: no DB access, no telemetry reads — callers
 * supply session telemetry directly.
 *
 * Research grounding (matches the core engine, packages/core/src/cognitive-load/
 * intrinsic-load-engine.ts):
 * - Sweller (1988, 2011) tripartite load decomposition: intrinsic /
 *   extraneous / germane working-memory chunks.
 * - Cowan (2001) working-memory capacity boundary of 4 ± 1 chunks.
 * - Paas (1992) 1-9 mental-effort scale + Paas & Van Merriënboer (1993)
 *   2D instructional-efficiency score E = (z_perf − z_effort) / √2.
 * - Csikszentmihalyi (1990) flow channel + Yerkes-Dodson (1908) arousal
 *   inverted-U balancing challenge against mastery.
 * - Pollock, Chandler & Sweller (2002) isolated-elements scaffolding continuum.
 *
 * Tools (complement the stored-telemetry `cognitive_load_report` in
 * ./telemetry-audio, which only reads persisted revlog telemetry):
 * 1. cognitive_load_benchmarks — the calibrated benchmark scenarios + capacity
 * 2. cognitive_load_evaluate  — full tripartite + Paas + flow evaluation
 */

import { z } from 'zod'
// Same engine names the web handler imports (from the /cognitive-load subpath
// there); here the root barrel is used because every sibling tool file does
// and it resolves identically under tsx, Node and the bundlers.
import {
  CALIBRATED_COGNITIVE_LOAD_SCENARIOS,
  evaluateComprehensiveCognitiveLoad,
} from '@learning-hub/core'
import { json, tool, type RegisteredTool } from '../tool-kit'

/** Cowan (2001) working-memory chunk capacity — the engine's decomposition bound. */
const COWAN_CAPACITY_LIMIT_CHUNKS = 4.0

/** Default benchmark scenario used when `scenarioId` is unknown (web-handler parity). */
const DEFAULT_SCENARIO_ID = 'distributed_paxos_consensus'

/**
 * MCP tool group: comprehensive Cognitive Load Theory evaluation.
 *
 * What: benchmark-scenario listing plus a stateless telemetry→evaluation
 * surface over `evaluateComprehensiveCognitiveLoad`. Why: closes the parity
 * gap where MCP could only read the stored `cognitive_load_report` telemetry
 * but never ran the full tripartite/Paas/flow engine. Units/invariants:
 * latency args are milliseconds, effort is the Paas (1992) 1-9 Likert scale,
 * mastery/difficulty are fractions in [0, 1], and every load figure is in
 * Cowan (2001) chunks bounded by the 4.0-chunk capacity limit. Result
 * envelopes mirror the headless `POST /cognitive/load/*` handlers (`ok`
 * boolean + engine payload) so hosts can be diffed by the parity tests.
 */
export const cognitiveLoadTools: RegisteredTool[] = [
  // ── 1. Calibrated benchmark scenarios + capacity limit ──
  tool(
    'cognitive_load_benchmarks',
    'Lists the calibrated Cognitive Load Theory benchmark scenarios (Sweller 1988/2011) with id, title and element-interactivity score (1-10 interacting elements), plus the Cowan (2001) working-memory capacity limit of 4 chunks. Scenario ids feed cognitive_load_evaluate.',
    {},
    async () => {
      const scenarios = Object.values(CALIBRATED_COGNITIVE_LOAD_SCENARIOS)
      return json({
        ok: true,
        capacityLimit: COWAN_CAPACITY_LIMIT_CHUNKS, // Cowan (2001) working-memory chunk capacity
        count: scenarios.length,
        scenarios: scenarios.map((s) => ({
          id: s.id,
          title: s.title,
          elementInteractivityScore: s.elementInteractivityScore,
        })),
      })
    },
  ),

  // ── 2. Comprehensive tripartite + Paas + flow evaluation ──
  tool(
    'cognitive_load_evaluate',
    'Evaluates real-time session telemetry with the comprehensive Cognitive Load engine: Sweller (1988, 2011) tripartite decomposition (intrinsic/extraneous/germane chunks vs the Cowan (2001) 4-chunk capacity), Paas (1992) 2D instructional efficiency, Csikszentmihalyi (1990) flow-channel + Yerkes-Dodson (1908) arousal balance, recommended micro-intervention and Pollock-Chandler-Sweller (2002) scaffold stage, and FSRS-6 stability/difficulty modulation.',
    {
      responseLatencyMs: z
        .number()
        .min(0)
        .max(3_600_000)
        .default(3500)
        .describe('Current response latency in milliseconds (0 to 1h; default 3500ms)'),
      baselineLatencyMs: z
        .number()
        .positive()
        .max(3_600_000)
        .optional()
        .describe(
          'Learner personal baseline latency in ms; omit for the 4000ms population default',
        ),
      backspaceCount: z
        .number()
        .int()
        .min(0)
        .max(1000)
        .default(0)
        .describe('Edit churn (backspaces/deletes) on the current response'),
      recentErrorsInLast5Cards: z
        .number()
        .int()
        .min(0)
        .max(5)
        .default(0)
        .describe('Failed grades among the last 5 cards (0-5)'),
      subjectiveMentalEffortRating: z
        .number()
        .min(1)
        .max(9)
        .optional()
        .describe(
          'Paas (1992) self-rated mental effort (1-9); derived from the load index when omitted',
        ),
      taskElementCount: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Simultaneously interacting conceptual elements; defaults to the scenario score'),
      learnerDomainMastery: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('Domain mastery fraction 0.0-1.0; defaults to 0.7 (web-handler parity)'),
      targetTaskDifficulty: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('Target task difficulty fraction 0.0-1.0; defaults to 0.75'),
      scenarioId: z
        .string()
        .default(DEFAULT_SCENARIO_ID)
        .describe(
          'Benchmark scenario id (see cognitive_load_benchmarks); unknown ids fall back to ' +
            DEFAULT_SCENARIO_ID,
        ),
    },
    async ({
      responseLatencyMs,
      baselineLatencyMs,
      backspaceCount,
      recentErrorsInLast5Cards,
      subjectiveMentalEffortRating,
      taskElementCount,
      learnerDomainMastery,
      targetTaskDifficulty,
      scenarioId,
    }) => {
      // Web-handler parity: unknown scenario ids resolve to the calibrated
      // Paxos consensus benchmark instead of failing the evaluation.
      const scenario =
        CALIBRATED_COGNITIVE_LOAD_SCENARIOS[scenarioId] ??
        CALIBRATED_COGNITIVE_LOAD_SCENARIOS[DEFAULT_SCENARIO_ID]!

      const evaluation = evaluateComprehensiveCognitiveLoad({
        responseLatencyMs,
        baselineLatencyMs,
        // No keystrokeTimestamps arg (headless-route parity): jitter is
        // derived server-side from latency + churn only.
        backspaceCount,
        recentErrorsInLast5Cards,
        subjectiveMentalEffortRating,
        taskElementCount: taskElementCount ?? scenario.elementInteractivityScore,
        learnerDomainMastery: learnerDomainMastery ?? 0.7,
        targetTaskDifficulty: targetTaskDifficulty ?? 0.75,
      })

      return json({
        ok: true,
        scenarioId: scenario.id,
        evaluation,
      })
    },
  ),
]
