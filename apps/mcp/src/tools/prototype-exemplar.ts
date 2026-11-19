/**
 * Prototype & Exemplar Categorization MCP Tools
 *
 * Exposes the pure categorization engines (Rosch 1975, Reed 1972, Nosofsky
 * 1986 GCM, Ashby & Gott 1988 rules; Landauer & Bjork 1978 / Kang 2016 study
 * planning) to external AI agents — the SAME engine calls the web handler
 * makes, with the SAME result shapes (host-parity contract, verified by
 * apps/web/tests/host-parity-prototype-exemplar.test.ts). No DB access: like
 * the other advanced-learning tools, these are pure engine surfaces over
 * packages/core; persistence stays host-side.
 *
 * Tools:
 * 1. prototype_exemplar_list_scenarios — the 5 canonical category sets
 * 2. prototype_exemplar_evaluate — full session telemetry (TSC/CTS/MCD/CRI)
 * 3. prototype_exemplar_plan — discriminating trials + optional multi-day
 *    study schedule from session history
 * 4. prototype_exemplar_deck — FSRS-calibrated review cards scaled by CRI
 */

import { z } from 'zod'
import { json, tool, type RegisteredTool } from '../tool-kit'
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

export const prototypeExemplarTools: RegisteredTool[] = [
  // ── 1. Canonical category sets ──
  tool(
    'prototype_exemplar_list_scenarios',
    'Lists the canonical categorization category sets (Rosch bird typicality, prototype abstraction, Medin-Schaffer 5-4, Nosofsky attention probe, Ashby-Gott rule boundary) with structure kind, dimensions and framing.',
    {},
    async () => {
      return json({
        count: CANONICAL_CATEGORIZATION_SETS.length,
        scenarios: CANONICAL_CATEGORIZATION_SETS.map((s) => ({
          id: s.id,
          title: s.title,
          domain: s.domain,
          difficulty: s.difficulty,
          structureKind: s.structureKind,
          dimensionLabels: s.dimensionLabels,
          categoryLabels: s.categoryLabels,
          studyItemsCount: s.studyItems.length,
          testItemsCount: s.testItems.length,
          hasExplicitRule: s.decisionRule !== undefined,
          pedagogicalFraming: s.pedagogicalFraming,
        })),
      })
    },
  ),

  // ── 2. Session evaluation ──
  tool(
    'prototype_exemplar_evaluate',
    'Evaluates a completed categorization session: fits prototype (Reed 1972) and exemplar GCM (Nosofsky 1986) models to the learner choices and returns TSC/CTS/MCD/CRI, maturity band, model comparison, divergent items and pedagogical feedback.',
    {
      // Payload shape owned by core; the tool only layers the setId default.
      setId: categorizationSubmissionSchema.shape.setId.default('proto-bird-typicality'),
      typicalityRatings: categorizationSubmissionSchema.shape.typicalityRatings,
      classifications: categorizationSubmissionSchema.shape.classifications,
    },
    async ({ setId, typicalityRatings, classifications }) => {
      const set = findCategorySet(setId)
      const evaluation: CategorizationEvaluation = evaluateCategorizationSession(set, {
        setId: set.id,
        typicalityRatings,
        classifications,
      })
      return json({
        ok: true,
        evaluation,
      })
    },
  ),

  // ── 3. Discriminating trials + multi-day schedule ──
  tool(
    'prototype_exemplar_plan',
    'Plans model-diagnostic trials for a category set (the trials where prototype and exemplar predictions split). With completed-session history attached, ALSO returns the multi-day study schedule: daily frontier block plus expanding retrieval (+1/+3/+7/+14 days, Landauer & Bjork 1978) interleaved on mastered sets (Kang 2016).',
    {
      setId: z.string().default('proto-bird-typicality'),
      maxTrials: z.number().int().min(1).max(24).default(6),
      sessions: z.array(studyPlanSessionSchema).max(500).default([]),
      horizonDays: z.number().int().min(1).max(30).default(10),
      now: z.string().optional().describe('Planning instant (ISO); required for a schedule.'),
    },
    async ({ setId, maxTrials, sessions, horizonDays, now }) => {
      const set = findCategorySet(setId)
      const plan = planDiscriminatingBlock(set, maxTrials)
      let schedule: StudyPlan | null = null
      if (sessions.length > 0) {
        schedule = planCategorizationStudy(sessions, {
          now: now ?? new Date().toISOString(),
          horizonDays,
        })
      }
      return json({
        ok: true,
        plan,
        schedule,
      })
    },
  ),

  // ── 4. FSRS deck synthesis ──
  tool(
    'prototype_exemplar_deck',
    'Synthesizes the 4-card FSRS review deck (typicality gradient, prototype abstraction, exemplar exceptions, attention strategy) with stability scaled by the CRI baseline.',
    {
      setId: z.string().default('proto-bird-typicality'),
      criBaseline: z.number().min(0).max(100).default(50),
    },
    async ({ setId, criBaseline }) => {
      const set = findCategorySet(setId)
      const neutralEvaluation = evaluateCategorizationSession(set, { setId: set.id })
      neutralEvaluation.cri = criBaseline
      const deck = generateCategorizationDeck(set, neutralEvaluation)
      return json({
        ok: true,
        deck,
      })
    },
  ),

  // ── 5-8. Categorization aliases ──
  tool(
    'categorization_list_scenarios',
    'Lists the canonical categorization category sets (Rosch 1975, Medin & Schaffer 1978, Nosofsky 1986, Ashby & Gott 1988).',
    {},
    async () => {
      return json({
        count: CANONICAL_CATEGORIZATION_SETS.length,
        scenarios: CANONICAL_CATEGORIZATION_SETS,
      })
    },
  ),

  tool(
    'categorization_evaluate',
    'Evaluates a completed categorization session: fits prototype (Reed 1972) and exemplar GCM (Nosofsky 1986) models.',
    {
      setId: categorizationSubmissionSchema.shape.setId.default('proto-bird-typicality'),
      typicalityRatings: categorizationSubmissionSchema.shape.typicalityRatings,
      classifications: categorizationSubmissionSchema.shape.classifications,
    },
    async ({ setId, typicalityRatings, classifications }) => {
      const set = findCategorySet(setId)
      const evaluation = evaluateCategorizationSession(set, {
        setId: set.id,
        typicalityRatings,
        classifications,
      })
      return json({ ok: true, evaluation })
    },
  ),

  tool(
    'categorization_plan',
    'Plans model-diagnostic trials + multi-day study schedule for categorization.',
    {
      setId: z.string().default('proto-bird-typicality'),
      maxTrials: z.number().int().min(1).max(24).default(6),
      sessions: z.array(studyPlanSessionSchema).max(500).default([]),
      horizonDays: z.number().int().min(1).max(30).default(10),
      now: z.string().optional(),
    },
    async ({ setId, maxTrials, sessions, horizonDays, now }) => {
      const set = findCategorySet(setId)
      const plan = planDiscriminatingBlock(set, maxTrials)
      let schedule: StudyPlan | null = null
      if (sessions.length > 0) {
        schedule = planCategorizationStudy(sessions, {
          now: now ?? new Date().toISOString(),
          horizonDays,
        })
      }
      return json({ ok: true, plan, schedule })
    },
  ),

  tool(
    'categorization_deck',
    'Synthesizes calibrated FSRS review cards scaled by the Category Retention Index (CRI).',
    {
      setId: z.string().default('proto-bird-typicality'),
      criBaseline: z.number().min(0).max(100).default(50),
    },
    async ({ setId, criBaseline }) => {
      const set = findCategorySet(setId)
      const neutralEvaluation = evaluateCategorizationSession(set, { setId: set.id })
      neutralEvaluation.cri = criBaseline
      const deck = generateCategorizationDeck(set, neutralEvaluation)
      return json({ ok: true, deck })
    },
  ),
]
