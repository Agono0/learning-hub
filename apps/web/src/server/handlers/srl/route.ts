/**
 * @file apps/web/src/server/handlers/srl/route.ts
 * @description Runtime-neutral API handler for Self-Regulated Learning (SRL) & Zimmerman Metacognitive Matrix.
 *
 * Implements:
 * - GET /api/srl — Retrieves active SRL profile, Zimmerman cyclic state, and MSLQ items.
 * - POST /api/srl — Evaluates forethought, volition sessions, reflections, and MSLQ scoring.
 *
 * Adheres strictly to AGENTS.md Rule 2 (runtime-neutral, zero node:* imports)
 * and Rule 5 (Zod validation at boundaries).
 */

import { z } from 'zod'
import {
  ForethoughtPlanSchema,
  VolitionalControlSessionSchema,
  SelfReflectionEvaluationSchema,
  SRLCyclicProfileSchema,
  evaluateForethought,
  analyzeVolitionalControl,
  evaluateCausalAttributions,
  scoreMSLQ,
  computeZimmermanCyclicIndex,
  STANDARD_MSLQ_ITEMS,
  type SRLCyclicProfile,
} from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const SRLActionSchema = z.object({
  action: z.enum([
    'evaluate_forethought',
    'analyze_volition',
    'evaluate_reflection',
    'score_mslq',
    'compute_cyclic_index',
  ]),
  plan: ForethoughtPlanSchema.optional(),
  session: VolitionalControlSessionSchema.optional(),
  reflection: SelfReflectionEvaluationSchema.optional(),
  responses: z.record(z.string(), z.number()).optional(),
  profile: SRLCyclicProfileSchema.optional(),
})

// In-memory runtime session profile (resets on server restart or seeded on first request)
const activeProfile: SRLCyclicProfile = {
  id: 'srl_profile_default',
  userId: 'user_active',
  forethoughtPlans: [
    {
      id: 'plan_active',
      targetSkillOrTopic: 'Graph Neural Networks & Message Passing',
      proximalSubgoals: [
        'Derive permutation equivariance in node embeddings',
        'Code a 2-layer GCN spectral convolution layer in PyTorch',
        'Test over-smoothing mitigation using residual skip connections',
      ],
      distalOutcome:
        'Design robust GNN architectures capable of node classification on citation benchmarks',
      strategicPlans: [
        {
          id: 'strat_1',
          strategy: 'retrieval_practice',
          rationale: 'Active recall of adjacency matrix normalization without reference',
          plannedMinutes: 25,
          completed: false,
        },
        {
          id: 'strat_2',
          strategy: 'dual_coding',
          rationale: 'Draw computational graph of k-hop neighborhood aggregation',
          plannedMinutes: 20,
          completed: false,
        },
        {
          id: 'strat_3',
          strategy: 'elaboration',
          rationale:
            'Contrast Weisfeiler-Lehman 1-WL isomorphism test with spatial message passing',
          plannedMinutes: 15,
          completed: false,
        },
      ],
      selfEfficacyRating: 80,
      expectedDifficulty: 4,
      intrinsicInterest: 9,
      goalOrientation: 'mastery_approach',
      createdAt: new Date().toISOString(),
    },
  ],
  volitionalSessions: [
    {
      id: 'vol_active',
      forethoughtPlanId: 'plan_active',
      startedAt: new Date().toISOString(),
      durationMinutes: 60,
      distractionTally: 1,
      activeFocusMinutes: 54,
      attentionInterventions: [
        {
          id: 'int_1',
          timestamp: new Date().toISOString(),
          trigger: 'mind_wandering',
          interventionStrategy:
            'Perform deliberate 3-breath grounding and write down immediate math step',
          resolved: true,
          latencySeconds: 15,
        },
      ],
      selfInstructionPromptsUsed: [
        'Focus purely on the node normalization step.',
        'One layer at a time: input features to latent representation.',
      ],
      perceivedCognitiveLoad: 6,
    },
  ],
  reflections: [
    {
      id: 'ref_active',
      volitionalSessionId: 'vol_active',
      masteryStandardScore: 85,
      observedPerformanceScore: 82,
      performanceDiscrepancy: -3,
      attributions: [
        {
          id: 'attr_1',
          outcomeDescription: 'Derived permutation equivariance with precision',
          outcomeValence: 'success',
          category: 'strategy',
          locus: 'internal',
          stability: 'unstable',
          controllability: 'controllable',
          justification: 'Dual coding graph visualization made neighborhood permutation obvious.',
        },
        {
          id: 'attr_2',
          outcomeDescription: 'Slight delay during symmetric normalized Laplacian calculation',
          outcomeValence: 'partial_success',
          category: 'effort',
          locus: 'internal',
          stability: 'unstable',
          controllability: 'controllable',
          justification: 'Did not write out degree matrix beforehand; need procedural checklist.',
        },
      ],
      selfSatisfactionRating: 8,
      adaptiveInferences: {
        maintainStrategies: true,
        strategyModifications: [
          'Pre-compute diagonal matrices before entering message passing loop',
        ],
        proximalTargetForNextForethought:
          'Implement Graph Attention Network (GAT) multi-head attention',
      },
      defensiveReactionDetected: false,
      createdAt: new Date().toISOString(),
    },
  ],
  lastUpdated: new Date().toISOString(),
}

export async function GET() {
  const cyclicResult = computeZimmermanCyclicIndex(activeProfile)

  return Response.json({
    profile: activeProfile,
    cyclicResult,
    standardItems: STANDARD_MSLQ_ITEMS,
    forethoughtPlan: activeProfile.forethoughtPlans[activeProfile.forethoughtPlans.length - 1],
    volitionalSession:
      activeProfile.volitionalSessions[activeProfile.volitionalSessions.length - 1],
    reflection: activeProfile.reflections[activeProfile.reflections.length - 1],
    mslqProfile: activeProfile.latestMSLQProfile,
  })
}

export async function POST(req: Request) {
  const body = await readJson(req, SRLActionSchema)

  if (body.action === 'evaluate_forethought') {
    if (!body.plan) {
      return Response.json({ error: 'Missing forethought plan in request' }, { status: 400 })
    }
    const evaluation = evaluateForethought(body.plan)
    // Replace or push plan
    activeProfile.forethoughtPlans = [
      ...activeProfile.forethoughtPlans.filter((p) => p.id !== body.plan!.id),
      body.plan,
    ]
    activeProfile.lastUpdated = new Date().toISOString()
    const cyclicResult = computeZimmermanCyclicIndex(activeProfile)

    return Response.json({
      evaluation,
      cyclicResult,
      profile: activeProfile,
    })
  }

  if (body.action === 'analyze_volition') {
    if (!body.session) {
      return Response.json({ error: 'Missing volitional session in request' }, { status: 400 })
    }
    const evaluation = analyzeVolitionalControl(body.session)
    activeProfile.volitionalSessions = [
      ...activeProfile.volitionalSessions.filter((s) => s.id !== body.session!.id),
      body.session,
    ]
    activeProfile.lastUpdated = new Date().toISOString()
    const cyclicResult = computeZimmermanCyclicIndex(activeProfile)

    return Response.json({
      evaluation,
      cyclicResult,
      profile: activeProfile,
    })
  }

  if (body.action === 'evaluate_reflection') {
    if (!body.reflection) {
      return Response.json({ error: 'Missing self reflection in request' }, { status: 400 })
    }
    const evaluation = evaluateCausalAttributions(body.reflection.attributions)
    activeProfile.reflections = [
      ...activeProfile.reflections.filter((r) => r.id !== body.reflection!.id),
      body.reflection,
    ]
    activeProfile.lastUpdated = new Date().toISOString()
    const cyclicResult = computeZimmermanCyclicIndex(activeProfile)

    return Response.json({
      evaluation,
      cyclicResult,
      profile: activeProfile,
    })
  }

  if (body.action === 'score_mslq') {
    if (!body.responses) {
      return Response.json({ error: 'Missing MSLQ responses in request' }, { status: 400 })
    }
    const profile = scoreMSLQ(body.responses)
    activeProfile.latestMSLQProfile = profile
    activeProfile.lastUpdated = new Date().toISOString()
    const cyclicResult = computeZimmermanCyclicIndex(activeProfile)

    return Response.json({
      profile,
      cyclicResult,
      activeProfile,
    })
  }

  if (body.action === 'compute_cyclic_index') {
    const prof = body.profile || activeProfile
    const cyclicResult = computeZimmermanCyclicIndex(prof)
    return Response.json({ cyclicResult })
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 })
}

export const getHandler = withRoute(GET)
export const postHandler = withRoute(POST)
