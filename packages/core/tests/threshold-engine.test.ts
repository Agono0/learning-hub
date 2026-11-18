import { describe, it, expect } from 'vitest'
import {
  getStandardThresholdConcepts,
  getStandardMimicryProbes,
  computeThresholdSignificanceIndex,
  computeOscillationIndex,
  evaluateLiminalTrajectory,
  bridgeThresholdToCurriculum,
} from '../src/threshold/threshold-engine'

describe('Threshold Concepts & Liminal Space Navigation Engine', () => {
  it('retrieves benchmark threshold concepts with valid 5-criteria Meyer & Land scores', () => {
    const concepts = getStandardThresholdConcepts()
    expect(concepts.length).toBeGreaterThanOrEqual(4)

    const pointers = concepts.find((c) => c.id === 'tc_pointers_memory')
    expect(pointers).toBeDefined()
    expect(pointers?.discipline).toBe('Computer Systems & Software Engineering')
    expect(pointers?.criteriaScores.transformativeScore).toBeGreaterThanOrEqual(0.9)
    expect(pointers?.criteriaScores.irreversibleScore).toBeGreaterThanOrEqual(0.9)
    expect(pointers?.criteriaScores.integrativeScore).toBeGreaterThanOrEqual(0.9)
    expect(pointers?.unlockedDownstreamConcepts.length).toBeGreaterThan(2)

    // Compute TSI
    const tsi = computeThresholdSignificanceIndex(pointers!.criteriaScores)
    expect(tsi).toBeGreaterThan(0.85)
  })

  it('computes oscillation index across historical trajectory evaluations', () => {
    // Stable trajectory: low oscillation
    const stableHistory = [
      {
        timestamp: '2026-11-18T00:00:00Z',
        confidenceScore: 80,
        performanceScore: 78,
        isMimicryDetected: false,
        notes: 'Consistent attempt 1',
      },
      {
        timestamp: '2026-11-18T01:00:00Z',
        confidenceScore: 85,
        performanceScore: 82,
        isMimicryDetected: false,
        notes: 'Consistent attempt 2',
      },
    ]
    const stableOscillation = computeOscillationIndex(stableHistory)
    expect(stableOscillation).toBeLessThan(0.3)

    // Volatile trajectory: high oscillation between overconfidence and collapse
    const volatileHistory = [
      {
        timestamp: '2026-11-18T00:00:00Z',
        confidenceScore: 90,
        performanceScore: 30, // massive gap
        isMimicryDetected: true,
        notes: 'Mimicry illusion',
      },
      {
        timestamp: '2026-11-18T01:00:00Z',
        confidenceScore: 40,
        performanceScore: 40, // collapse
        isMimicryDetected: false,
        notes: 'Post-failure doubt',
      },
    ]
    const volatileOscillation = computeOscillationIndex(volatileHistory)
    expect(volatileOscillation).toBeGreaterThan(0.5)
  })

  it('detects mimicry vs genuine integration under boundary perturbations', () => {
    const probes = getStandardMimicryProbes()
    expect(probes.length).toBeGreaterThanOrEqual(2)

    // Test genuine integration on pointers probe
    const genuineRes = evaluateLiminalTrajectory('tc_pointers_memory', {
      probe_pointers_swap: 'ptr_opt_genuine',
    })
    expect(genuineRes.phase).toBe('POST_LIMINAL_TRANSFORMED')
    expect(genuineRes.canCrossPortal).toBe(true)
    expect(genuineRes.overallFluencyScore).toBe(100)
    expect(genuineRes.mimicryRiskScore).toBe(0)

    // Test mimicry response
    const mimicryRes = evaluateLiminalTrajectory('tc_pointers_memory', {
      probe_pointers_swap: 'ptr_opt_mimicry',
    })
    expect(mimicryRes.phase).toBe('LIMINAL_OSCILLATING')
    expect(mimicryRes.canCrossPortal).toBe(false)
    expect(mimicryRes.mimicryRiskScore).toBe(100)
    expect(mimicryRes.prescribedRemediation).toContain('Liminal Space')

    // Test novice error response
    const noviceRes = evaluateLiminalTrajectory('tc_pointers_memory', {
      probe_pointers_swap: 'ptr_opt_novice',
    })
    expect(noviceRes.phase).toBe('PRE_LIMINAL')
    expect(noviceRes.canCrossPortal).toBe(false)
  })

  it('bridges threshold concept mastery to curriculum gateway transfer multiplier', () => {
    // Post-liminal transformed: full gateway multiplier
    const bridgeTransformed = bridgeThresholdToCurriculum(
      0.75,
      100,
      'POST_LIMINAL_TRANSFORMED',
      'tc_pointers_memory',
    )
    expect(bridgeTransformed.gatewayMultiplier).toBe(1.35)
    expect(bridgeTransformed.modulatedMastery).toBeGreaterThan(0.75)
    expect(bridgeTransformed.unlockedConceptsCount).toBe(4)
    expect(bridgeTransformed.reasoningNotes.some((n) => n.includes('Permanent irreversible'))).toBe(
      true,
    )

    // Pre-liminal bottlenecked
    const bridgePreliminal = bridgeThresholdToCurriculum(
      0.75,
      20,
      'PRE_LIMINAL',
      'tc_pointers_memory',
    )
    expect(bridgePreliminal.gatewayMultiplier).toBe(0.9)
    expect(bridgePreliminal.modulatedMastery).toBeLessThan(0.75)
  })
})
