/**
 * @file interleaving-studio-integration.test.ts
 * @description SSR and component integration tests for Interleaved Problem Solving & Structural Invariance Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { InterleavingHUD } from '../src/ui/InterleavingHUD'
import { InterleavingStudio } from '../src/components/InterleavingStudio'
import { CALIBRATED_INTERLEAVED_PROBLEMS } from '@learning-hub/core/interleaving/structural-invariance-engine'

describe('Interleaving & Structural Invariance Web Integration', () => {
  it('renders InterleavingHUD with Rohrer Index, immunity percentage, and mode badge', () => {
    const html = renderToString(
      React.createElement(InterleavingHUD, {
        metrics: {
          totalAttempts: 5,
          correctCategories: 4,
          decoyTrapsFellInto: 1,
          averageDiscriminationScore: 82,
          averageResponseTimeMs: 11500,
          rohrerDiscriminationIndex: 78,
          surfaceFeatureImmunityRate: 0.8,
        },
        currentProblemIndex: 2,
        totalProblems: 6,
        activeCategoryName: 'dynamic_programming',
        activeMode: 'adaptive_contrast',
      }),
    )

    expect(html).toContain('Rohrer Index (RDI)')
    expect(html).toContain('78')
    expect(html).toContain('Decoy Immunity')
    expect(html).toContain('80%')
    expect(html).toContain('Adaptive Contrast Juxtaposition')
    expect(html).toContain('DYNAMIC PROGRAMMING')
  })

  it('renders InterleavingStudio with problem statement, surface narrative, and tabs', () => {
    const html = renderToString(
      React.createElement(InterleavingStudio, {
        initialProblems: CALIBRATED_INTERLEAVED_PROBLEMS,
      }),
    )

    expect(html).toContain('Discrimination Arena')
    expect(html).toContain('Invariance Mutator')
    expect(html).toContain('Confusion Matrix')
    expect(html).toContain('FSRS Contrast Deck')
    expect(html).toContain('Problem Description')
    expect(html).toContain('Category Discrimination Choice')
  })
})
