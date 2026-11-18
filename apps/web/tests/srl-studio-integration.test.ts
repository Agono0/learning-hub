import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { GET, POST } from '../src/server/handlers/srl/route'
import { SelfRegulatedLearningHUD } from '../src/ui/SelfRegulatedLearningHUD'

describe('Self-Regulated Learning (SRL) & Zimmerman Studio Integration', () => {
  it('GET /api/srl returns initialized Zimmerman cyclic profile and standard MSLQ items', async () => {
    const res = await GET()
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.profile).toBeDefined()
    expect(data.cyclicResult).toBeDefined()
    expect(data.cyclicResult.compositeSRLIndex).toBeGreaterThanOrEqual(50)
    expect(data.standardItems.length).toBe(15)
    expect(data.forethoughtPlan).toBeDefined()
    expect(data.volitionalSession).toBeDefined()
    expect(data.reflection).toBeDefined()
  })

  it('POST /api/srl evaluate_forethought evaluates task analysis & efficacy calibration', async () => {
    const plan = {
      id: 'plan_test_integration',
      targetSkillOrTopic: 'Category Theory in Functional Programming',
      proximalSubgoals: [
        'Formulate Functor and Monad axioms',
        'Implement Kleisli composition in TypeScript',
      ],
      distalOutcome: 'Model abstract compositional architectures mathematically',
      strategicPlans: [
        {
          id: 'sp_1',
          strategy: 'retrieval_practice',
          rationale: 'Recall natural transformations from memory',
          plannedMinutes: 30,
          completed: false,
        },
        {
          id: 'sp_2',
          strategy: 'dual_coding',
          rationale: 'Commutative diagram visualizations',
          plannedMinutes: 20,
          completed: false,
        },
      ],
      selfEfficacyRating: 85,
      expectedDifficulty: 4,
      intrinsicInterest: 9,
      goalOrientation: 'mastery_approach',
      createdAt: new Date().toISOString(),
    }

    const req = new Request('http://localhost:3000/api/srl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'evaluate_forethought',
        plan,
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.evaluation).toBeDefined()
    expect(data.evaluation.forethoughtQualityScore).toBeGreaterThanOrEqual(80)
    expect(data.evaluation.calibrationDiagnosis).toBe('calibrated')
    expect(data.cyclicResult).toBeDefined()
  })

  it('POST /api/srl evaluate_reflection assesses Weiner attributions and growth mindset', async () => {
    const reflection = {
      id: 'ref_test_integration',
      volitionalSessionId: 'vol_active',
      masteryStandardScore: 80,
      observedPerformanceScore: 85,
      performanceDiscrepancy: 5,
      attributions: [
        {
          id: 'attr_1',
          outcomeDescription: 'Constructed Yoneda lemma proof successfully',
          outcomeValence: 'success',
          category: 'strategy',
          locus: 'internal',
          stability: 'unstable',
          controllability: 'controllable',
          justification: 'Commutative diagrams visualized natural bijection clearly.',
        },
      ],
      selfSatisfactionRating: 9,
      adaptiveInferences: {
        maintainStrategies: true,
        strategyModifications: [],
        proximalTargetForNextForethought: 'Adjunctions and monoidal categories',
      },
      defensiveReactionDetected: false,
      createdAt: new Date().toISOString(),
    }

    const req = new Request('http://localhost:3000/api/srl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'evaluate_reflection',
        reflection,
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.evaluation).toBeDefined()
    expect(data.evaluation.controllableInternalRatio).toBe(100)
    expect(data.evaluation.isGrowthMindsetOriented).toBe(true)
    expect(data.evaluation.learnedHelplessnessRisk).toBe(false)
  })

  it('POST /api/srl score_mslq scores Pintrich normative subscales and flags bottlenecks', async () => {
    const responses = {
      mslq_1: 7,
      mslq_2: 3,
      mslq_3: 7,
      mslq_4: 7,
      mslq_5: 6,
      mslq_6: 2,
      mslq_7: 3,
      mslq_8: 7,
      mslq_9: 6,
      mslq_10: 7,
      mslq_11: 7,
      mslq_12: 6,
      mslq_13: 6,
      mslq_14: 5,
      mslq_15: 6,
    }

    const req = new Request('http://localhost:3000/api/srl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'score_mslq',
        responses,
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.profile).toBeDefined()
    expect(data.profile.overallMetacognitiveIndex).toBeGreaterThanOrEqual(80)
    expect(data.profile.scales.intrinsic_goal_orientation.rawMean).toBe(7)
  })

  it('renders SelfRegulatedLearningHUD correctly via SSR without runtime error', () => {
    const html = renderToString(
      React.createElement(SelfRegulatedLearningHUD, {
        forethoughtScore: 85,
        volitionalScore: 78,
        selfReflectionScore: 82,
        compositeIndex: 82,
        maturityLevel: 'proficient',
        controllableAttributionRatio: 100,
        topStrength: 'Intrinsic Goal Orientation',
        criticalBottleneck: undefined,
        activePhase: 'forethought',
      }),
    )

    expect(html).toContain('Zimmerman Metacognitive Matrix')
    expect(html).toContain('Cyclical Self-Regulation Engine')
    expect(html).toContain('82%')
    expect(html).toContain('PROFICIENT')
    expect(html).toContain('1. Forethought')
    expect(html).toContain('2. Volition')
    expect(html).toContain('3. Self-Reflection')
  })
})
