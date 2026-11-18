/**
 * @file apps/web/tests/srl-studio-integration.test.ts
 * @description Integration tests for Self-Regulated Learning (SRL) & Metacognitive Matrix Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_SRL_CHALLENGES,
  CANONICAL_CAUSAL_ATTRIBUTIONS,
  SelfRegulatedLearningSession,
} from '@learning-hub/core/srl'
import { SelfRegulatedLearningHUD } from '../src/ui/SelfRegulatedLearningHUD'
import { SelfRegulatedLearningStudio } from '../src/components/SelfRegulatedLearningStudio'
import SelfRegulatedLearningPage from '../app/srl/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'

describe('Self-Regulated Learning & Metacognitive Matrix Studio Web Integration', () => {
  it('renders SelfRegulatedLearningHUD correctly in server context', () => {
    const session = new SelfRegulatedLearningSession('distributed_systems_consensus')
    const metrics = session.getMetrics()
    const challenge = session.getChallenge()

    const html = renderToString(
      React.createElement(SelfRegulatedLearningHUD, {
        activePhase: session.getActivePhase(),
        metrics,
        challengeTitle: challenge.title,
      }),
    )

    expect(html).toContain('Zimmerman &amp; Pintrich Self-Regulated Learning HUD')
    expect(html).toContain('Formal Verification of Raft')
    expect(html).toContain('SRL Maturity Index')
    expect(html).toContain('Forethought Quality')
    expect(html).toContain('Volitional Control')
    expect(html).toContain('Attribution Resilience')
    expect(html).toContain('GAS Attainment')
  })

  it('renders SelfRegulatedLearningStudio with active challenge and 4 tabs', () => {
    const html = renderToString(React.createElement(SelfRegulatedLearningStudio))

    expect(html).toContain('Self-Regulated Learning &amp; Metacognitive Matrix Studio')
    expect(html).toContain('Barry Zimmerman (2000)')
    expect(html).toContain('Paul Pintrich (2004)')
    expect(html).toContain('Philip Winne (1998)')
    expect(html).toContain('Bernard Weiner (1986)')
    expect(html).toContain('Phase 1: Forethought &amp; Task Analysis')
    expect(html).toContain('Phase 2: Performance &amp; Volition')
    expect(html).toContain('Phase 3: Self-Reflection &amp; Attribution')
    expect(html).toContain('FSRS Regulatory Deck')
    expect(html).toContain('Mastery-Approach (Optimal)')
    expect(html).toContain('COPES Task Decomposition')
  })

  it('renders the complete SelfRegulatedLearningPage with header and action badges', () => {
    const html = renderToString(React.createElement(SelfRegulatedLearningPage))

    expect(html).toContain('Zimmerman (2000)')
    expect(html).toContain('COPES Architecture')
    expect(html).toContain('Volitional Control')
    expect(html).toContain('Weiner Attribution')
    expect(html).toContain('FSRS Regulatory Deck')
  })

  it('confirms /srl route is registered in navigation model', () => {
    const item = ALL_NAV_ITEMS.find((i) => i.href === '/srl')
    expect(item).toBeDefined()
    expect(item?.label).toBe('Self-Regulated Learning')
    expect(item?.icon).toBeDefined()
  })

  it('verifies all 4 calibrated challenges exist with complete COPES and checkpoints', () => {
    expect(Object.keys(CALIBRATED_SRL_CHALLENGES)).toEqual([
      'distributed_systems_consensus',
      'deep_learning_transformer_attention',
      'cellular_biochemistry_krebs',
      'algorithmic_game_theory_auctions',
    ])

    for (const challenge of Object.values(CALIBRATED_SRL_CHALLENGES)) {
      expect(challenge.volitionalCheckpoints.length).toBeGreaterThanOrEqual(2)
      expect(challenge.attributionOptions.length).toBeGreaterThanOrEqual(3)
      expect(challenge.defaultCopes.conditions).toBeTruthy()
      expect(challenge.defaultCopes.operations).toBeTruthy()
      expect(challenge.defaultCopes.products).toBeTruthy()
      expect(challenge.defaultCopes.evaluations).toBeTruthy()
      expect(challenge.defaultCopes.standards).toBeTruthy()
      expect(challenge.expertForethoughtHeuristic).toBeTruthy()
      expect(challenge.expertSelfReflectionPrompt).toBeTruthy()
    }
  })

  it('verifies Weiner attribution taxonomy completeness and adaptiveness ratings', () => {
    expect(CANONICAL_CAUSAL_ATTRIBUTIONS.strategic_effort.adaptiveScore).toBe(1.0)
    expect(CANONICAL_CAUSAL_ATTRIBUTIONS.inherent_genius.adaptiveScore).toBeLessThan(0.3)
    expect(CANONICAL_CAUSAL_ATTRIBUTIONS.arbitrary_luck.adaptiveScore).toBe(0.1)
  })
})
