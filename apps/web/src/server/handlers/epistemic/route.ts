/**
 * @file apps/web/src/server/handlers/epistemic/route.ts
 * @description Runtime-neutral API handler for Epistemic Network Analysis (ENA) Studio.
 *
 * Implements:
 * - GET /api/epistemic — Retrieves active epistemic discourse model and standard codes.
 * - POST /api/epistemic — Recomputes ENA model from utterances, detects gaps, or bridges to curriculum.
 *
 * Adheres strictly to AGENTS.md Rule 2 (runtime-neutral, zero node:* imports)
 * and Rule 5 (Zod validation at boundaries).
 */

import { z } from 'zod'
import {
  EpistemicCodeSchema,
  DiscourseUtteranceSchema,
  StanzaWindowConfigSchema,
  STANDARD_EPISTEMIC_CODES,
  buildEpistemicDiscourseModel,
  bridgeEpistemicToCurriculum,
  type EpistemicDiscourseModel,
} from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const EpistemicActionSchema = z.object({
  action: z.enum(['build_model', 'bridge_curriculum']).default('build_model'),
  title: z.string().optional(),
  domain: z.string().optional(),
  utterances: z.array(DiscourseUtteranceSchema).optional(),
  codes: z.array(EpistemicCodeSchema).optional(),
  config: StanzaWindowConfigSchema.optional(),
  baseMastery: z.number().min(0).max(1).optional(),
})

// In-memory runtime session model
const activeModel: EpistemicDiscourseModel = buildEpistemicDiscourseModel(
  'epistemic_model_default',
  'Amdahls Law & Concurrent Concurrency Analysis',
  'Computer Systems & Parallel Computing',
  [
    {
      id: 'utt_1',
      unitId: 'unit_1',
      conversationId: 'conv_1',
      lineIndex: 0,
      timestamp: new Date().toISOString(),
      speaker: 'Learner',
      text: 'According to Amdahls Law, the theoretical speedup of a program using multiple processors is strictly bounded by the sequential fraction.',
      appliedCodes: ['code_domain_principle', 'code_causal_reasoning'],
    },
    {
      id: 'utt_2',
      unitId: 'unit_1',
      conversationId: 'conv_1',
      lineIndex: 1,
      timestamp: new Date().toISOString(),
      speaker: 'Tutor',
      text: 'How does your benchmark run on 16 threads compare with that predicted theoretical limit?',
      appliedCodes: ['code_empirical_evidence'],
    },
    {
      id: 'utt_3',
      unitId: 'unit_1',
      conversationId: 'conv_1',
      lineIndex: 2,
      timestamp: new Date().toISOString(),
      speaker: 'Learner',
      text: 'The throughput plateaued at 4.2x speedup because lock contention in the global heap allocator dominated the sequential portion.',
      appliedCodes: [
        'code_empirical_evidence',
        'code_causal_reasoning',
        'code_procedural_execution',
      ],
    },
    {
      id: 'utt_4',
      unitId: 'unit_1',
      conversationId: 'conv_1',
      lineIndex: 3,
      timestamp: new Date().toISOString(),
      speaker: 'Learner',
      text: 'Let me double check whether false sharing on cache lines could be distorting these thread latency metrics.',
      appliedCodes: ['code_metacognitive_check', 'code_counterfactual_critique'],
    },
  ],
  STANDARD_EPISTEMIC_CODES,
)

export const GET = withRoute(async () => {
  return Response.json({
    model: activeModel,
    standardCodes: STANDARD_EPISTEMIC_CODES,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, EpistemicActionSchema)

  if (body.action === 'bridge_curriculum') {
    const base = body.baseMastery ?? 0.75
    const bridge = bridgeEpistemicToCurriculum(activeModel, base)
    return Response.json({ bridge })
  }

  // Action: build_model
  const utterances = body.utterances || activeModel.utterances
  const codes = body.codes || activeModel.codes
  const title = body.title || activeModel.title
  const domain = body.domain || activeModel.domain

  const newModel = buildEpistemicDiscourseModel(activeModel.id, title, domain, utterances, codes)

  // Update activeModel reference properties
  Object.assign(activeModel, newModel)

  return Response.json({
    model: activeModel,
    status: 'success',
  })
})
