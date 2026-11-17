/**
 * Unit Tests for Cognitive Load & Element Interactivity Engine
 *
 * Verifies John Sweller's Cognitive Load Theory (Sweller 1988, 2011),
 * Pollock et al. (2002) Isolated-Elements Effect,
 * and Paas (1992) Instructional Efficiency Metric.
 */

import { describe, expect, it } from 'vitest'
import {
  analyzeElementInteractivity,
  calculateInstructionalEfficiency,
  CALIBRATED_INTERACTIVITY_SUITES,
  ElementInteractivitySession,
} from '../src/interactivity/element-interactivity-engine'

describe('Cognitive Load & Element Interactivity Engine', () => {
  it('analyzes topological interactivity and proves novice cognitive overload vs expert schema chunking', () => {
    const suite = CALIBRATED_INTERACTIVITY_SUITES.raft_consensus_protocol
    const analysis = analyzeElementInteractivity(suite, 1.0)

    expect(analysis.totalElements).toBe(5)
    expect(analysis.totalInteractions).toBe(4)
    expect(analysis.couplingDensity).toBe(0.4) // 4 / 10
    expect(analysis.maxTransitiveDepth).toBeGreaterThanOrEqual(3)
    expect(analysis.interactivityIndex).toBeGreaterThanOrEqual(60)

    // Novice load without chunking exceeds working memory threshold
    expect(analysis.estimatedNoviceLoad.isOverloaded).toBe(true)
    expect(analysis.estimatedNoviceLoad.totalLoad).toBeGreaterThan(suite.workingMemoryThreshold)
    expect(analysis.estimatedNoviceLoad.tier).toBe('extreme')

    // Expert schema chunking drastically reduces intrinsic load to within capacity
    expect(analysis.estimatedExpertChunkedLoad.isOverloaded).toBe(false)
    expect(analysis.estimatedExpertChunkedLoad.totalLoad).toBeLessThanOrEqual(
      suite.workingMemoryThreshold,
    )
    expect(analysis.estimatedExpertChunkedLoad.remainingCapacity).toBeGreaterThan(0)
  })

  it('calculates Paas instructional efficiency metric and classifies cognitive states', () => {
    // 1. Optimal Automation: High performance (95), low mental effort (2)
    const optimal = calculateInstructionalEfficiency(2, 95)
    expect(optimal.efficiency).toBeGreaterThan(1.0)
    expect(optimal.classification).toBe('optimal_automation')

    // 2. Cognitive Overload: Low performance (30), extreme mental effort (9)
    const overload = calculateInstructionalEfficiency(9, 30)
    expect(overload.efficiency).toBeLessThan(-1.0)
    expect(overload.classification).toBe('cognitive_overload')

    // 3. Under-engaged: Low performance (15), low mental effort (2)
    const underEngaged = calculateInstructionalEfficiency(2, 15)
    expect(underEngaged.efficiency).toBeLessThan(-0.5)
    expect(underEngaged.classification).toBe('under_engaged')

    // 4. Effortful Mastery: High performance (90), high mental effort (8)
    const effortful = calculateInstructionalEfficiency(8, 90)
    expect(effortful.classification).toBe('effortful_mastery')
  })

  it('manages 3-phase scaffold progression from isolated elements to systemic synthesis', () => {
    const session = new ElementInteractivitySession('raft_consensus_protocol')
    const suite = session.getSuite()

    expect(session.getCurrentPhase()).toBe('isolated_elements')

    // Complete isolated elements
    for (const el of suite.elements) {
      session.recordIsolatedAnswer(el.id, true, 3)
    }

    // Auto-advances to pairwise coupling phase
    expect(session.getCurrentPhase()).toBe('pairwise_coupling')

    // Complete pairwise edges
    for (const edge of suite.edges) {
      session.recordPairwiseAnswer(edge.sourceElementId, edge.targetElementId, true, 4)
    }

    // Auto-advances to systemic synthesis phase
    expect(session.getCurrentPhase()).toBe('systemic_synthesis')

    // Complete cascade scenario
    for (const scen of suite.cascadeScenarios) {
      session.recordSystemicAnswer(scen.id, true, 5)
    }

    const progress = session.getProgress()
    expect(progress.overallChunkingScore).toBe(1.0)
    expect(progress.isFullyChunked).toBe(true)

    // Export FSRS cards
    const cards = session.exportFSRSCards()
    expect(cards.length).toBe(
      suite.elements.length + suite.edges.length + suite.cascadeScenarios.length,
    )

    const isoCard = cards.find((c) => c.cardType === 'isolated_element')
    expect(isoCard).toBeDefined()
    expect(isoCard?.recommendedStabilityMultiplier).toBeGreaterThan(1.0)

    const sysCard = cards.find((c) => c.cardType === 'systemic_synthesis')
    expect(sysCard).toBeDefined()
    expect(sysCard?.recommendedStabilityMultiplier).toBeGreaterThanOrEqual(1.3)
  })

  it('evaluates cardiovascular hemodynamics physiological regulatory loop', () => {
    const suite = CALIBRATED_INTERACTIVITY_SUITES.cardiovascular_hemodynamics
    const analysis = analyzeElementInteractivity(suite, 0.5)

    expect(suite.elements.length).toBe(4)
    expect(suite.edges.length).toBe(3)
    expect(analysis.estimatedNoviceLoad.isOverloaded).toBe(true)

    const session = new ElementInteractivitySession('cardiovascular_hemodynamics')
    session.recordIsolatedAnswer('elem_venous_return', true, 2)
    session.recordIsolatedAnswer('elem_frank_starling', true, 3)

    const progress = session.getProgress()
    expect(progress.isolatedMastery['elem_venous_return']).toBe(true)
    expect(progress.isolatedMastery['elem_frank_starling']).toBe(true)
    expect(progress.overallChunkingScore).toBeGreaterThan(0)
  })

  it('handles isolated elements without interactions and verifies minimum boundary loads', () => {
    const minimalSuite = {
      id: 'minimal_vocab',
      title: 'Isolated Vocabulary Pairs',
      domain: 'Language Acquisition',
      executiveSummary: 'Low element interactivity material where items do not interact.',
      workingMemoryThreshold: 4.0,
      elements: [
        {
          id: 'v1',
          label: 'Apple / Pomme',
          description: 'Noun definition',
          domain: 'Vocabulary',
          intrinsicComplexity: 1,
          isolatedDefinition: 'Apple is pomme in French',
          testPrompt: 'What is pomme?',
          correctSolution: 'Apple',
          distractorSolutions: ['Pear', 'Orange', 'Grape'],
        },
        {
          id: 'v2',
          label: 'Cat / Chat',
          description: 'Noun definition',
          domain: 'Vocabulary',
          intrinsicComplexity: 1,
          isolatedDefinition: 'Cat is chat in French',
          testPrompt: 'What is chat?',
          correctSolution: 'Cat',
          distractorSolutions: ['Dog', 'Bird', 'Fish'],
        },
      ],
      edges: [],
      cascadeScenarios: [],
    }

    const analysis = analyzeElementInteractivity(minimalSuite, 0.5)
    expect(analysis.totalElements).toBe(2)
    expect(analysis.totalInteractions).toBe(0)
    expect(analysis.couplingDensity).toBe(0.0)
    expect(analysis.maxTransitiveDepth).toBe(1)
    expect(analysis.estimatedNoviceLoad.isOverloaded).toBe(false)
    expect(analysis.estimatedNoviceLoad.tier).toBe('low')
  })

  it('computes FSRS stability adjustments across low vs high chunking learner regimes', () => {
    const session = new ElementInteractivitySession('raft_consensus_protocol')
    const unmasteredCards = session.exportFSRSCards(4.0)

    // With zero mastery, stability multiplier is discounted below 1.0
    for (const card of unmasteredCards) {
      expect(card.recommendedStabilityMultiplier).toBeLessThanOrEqual(1.0)
    }

    // Fully master the session
    const suite = session.getSuite()
    for (const el of suite.elements) session.recordIsolatedAnswer(el.id, true, 3)
    for (const edge of suite.edges)
      session.recordPairwiseAnswer(edge.sourceElementId, edge.targetElementId, true, 4)
    for (const scen of suite.cascadeScenarios) session.recordSystemicAnswer(scen.id, true, 4)

    const masteredCards = session.exportFSRSCards(4.0)
    for (const card of masteredCards) {
      expect(card.recommendedStabilityMultiplier).toBeGreaterThanOrEqual(1.15)
    }
  })
})
