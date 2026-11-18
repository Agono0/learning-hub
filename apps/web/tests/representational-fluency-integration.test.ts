/**
 * @file apps/web/tests/representational-fluency-integration.test.ts
 * @description Integration tests for Multi-Representational Fluency & Representational Competence Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_REPRESENTATIONAL_PROBLEMS,
  CANONICAL_MODALITY_CATALOG,
  calculateCrossModalCoherenceScore,
  calculateRepresentationalCoordinationGap,
  calculateRepresentationalFluencyIndex,
} from '@learning-hub/core/representation'
import { RepresentationalFluencyHUD } from '../src/ui/RepresentationalFluencyHUD'
import { RepresentationalFluencyStudio } from '../src/components/RepresentationalFluencyStudio'
import RepresentationsPage from '../app/representations/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'

describe('Multi-Representational Fluency Studio Web Integration', () => {
  it('renders RepresentationalFluencyHUD correctly in server context', () => {
    const problem = CALIBRATED_REPRESENTATIONAL_PROBLEMS[0]
    const gap = calculateRepresentationalCoordinationGap({
      totalChallenges: 3,
      correctChallenges: 2,
      exploredModalitiesCount: 4,
    })
    const coherence = calculateCrossModalCoherenceScore({
      totalChallenges: 3,
      correctChallenges: 2,
      averageTranslationLatencyMs: 3500,
    })
    const fluencyIndex = calculateRepresentationalFluencyIndex({
      totalChallenges: 3,
      correctChallenges: 2,
      exploredModalitiesCount: 4,
      crossModalCoherenceScore: coherence,
      representationalCoordinationGap: gap,
    })

    const html = renderToString(
      React.createElement(RepresentationalFluencyHUD, {
        activeModality: 'symbolic_formal',
        metrics: {
          problemId: problem.id,
          exploredModalities: [
            'symbolic_formal',
            'computational_code',
            'visual_geometric',
            'concrete_physical',
          ],
          completedChallengeIds: ['ent_trans_1', 'ent_trans_2'],
          correctChallengeIds: ['ent_trans_1', 'ent_trans_2'],
          averageTranslationLatencyMs: 3500,
          representationalCoordinationGap: gap,
          crossModalCoherenceScore: coherence,
          representationalFluencyIndex: fluencyIndex,
        },
        problemTitle: problem.title,
      }),
    )

    expect(html).toContain('Representational Fluency HUD')
    expect(html).toContain('Ainsworth DeFT · Lesh Model')
    expect(html).toContain('Shannon Information Entropy')
    expect(html).toContain('Fluency Index')
    expect(html).toContain('Coordination Gap')
    expect(html).toContain('Cross-Modal Coherence')
    expect(html).toContain('Modalities Explored')
  })

  it('renders RepresentationalFluencyStudio with active problem and 3 views', () => {
    const html = renderToString(React.createElement(RepresentationalFluencyStudio))

    expect(html).toContain('Multi-Representational Fluency Studio')
    expect(html).toContain('Ainsworth DeFT · Lesh 5-Mode Model')
    expect(html).toContain('Cross-Modal Representational Competence')
    expect(html).toContain('1. Multi-Modal Explorer')
    expect(html).toContain('2. Translation Crucible')
    expect(html).toContain('3. FSRS Translation Deck')
    expect(html).toContain('Shannon Entropy')
    expect(html).toContain('Kalman Filter')
    expect(html).toContain('Fourier Transform')
    expect(html).toContain('Backpropagation')
  })

  it('renders the complete RepresentationsPage route component', () => {
    const html = renderToString(React.createElement(RepresentationsPage))

    expect(html).toContain('Representational Fluency HUD')
    expect(html).toContain('DeFT Cognitive Coordination')
    expect(html).toContain('Primary:')
  })

  it('registers /representations correctly in global navigation with Boxes icon', () => {
    const navItem = ALL_NAV_ITEMS.find((item) => item.href === '/representations')
    expect(navItem).toBeDefined()
    expect(navItem?.label).toBe('Multi-Representational')
    expect(navItem?.icon).toBeDefined()
  })

  it('verifies that all modalities in CANONICAL_MODALITY_CATALOG have labels and strengths', () => {
    const modalities = Object.keys(CANONICAL_MODALITY_CATALOG)
    expect(modalities.length).toBe(5)
    for (const key of modalities) {
      const entry = CANONICAL_MODALITY_CATALOG[key as keyof typeof CANONICAL_MODALITY_CATALOG]
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.leshEquivalent.length).toBeGreaterThan(0)
      expect(entry.primaryStrength.length).toBeGreaterThan(0)
    }
  })

  it('renders problem selector tabs for all 4 calibrated problems', () => {
    const html = renderToString(React.createElement(RepresentationalFluencyStudio))
    expect(html).toContain('Shannon Entropy')
    expect(html).toContain('Kalman Filter')
    expect(html).toContain('Fourier Transform')
    expect(html).toContain('Backpropagation')
  })
})
