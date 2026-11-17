/**
 * @file interleaving-studio-integration.test.ts
 * @description Web SSR integration tests for Rohrer-Taylor Interleaving HUD and
 * Structural Invariance Studio components.
 */

import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import { InterleavingHUD } from '../src/ui/InterleavingHUD'
import { InterleavingStudio } from '../src/components/InterleavingStudio'
import {
  CALIBRATED_INVARIANCE_CATEGORIES,
  CALIBRATED_INVARIANCE_PROBLEMS,
  computeCategoryContrastMatrix,
  computeDiscriminationTelemetry,
  computeSequenceMetrics,
  generateContrastSchedule,
} from '@learning-hub/core/interleaving/structural-invariance-engine'

describe('Interleaved Problem Solving & Structural Invariance Web Integration', () => {
  const categories = CALIBRATED_INVARIANCE_CATEGORIES
  const problems = CALIBRATED_INVARIANCE_PROBLEMS
  const { schedule } = generateContrastSchedule(problems, categories, { mode: 'interleaved' })
  const sequenceMetrics = computeSequenceMetrics(schedule, categories, problems)
  const contrastMatrix = computeCategoryContrastMatrix(categories, problems)
  const telemetry = computeDiscriminationTelemetry(
    [
      {
        problemId: 'rate_pipes_pool',
        trueCategoryId: 'rate_completion',
        chosenCategoryId: 'partwhole_proportion',
        reactionMs: 1400,
      },
      {
        problemId: 'prop_trains_occupancy',
        trueCategoryId: 'partwhole_proportion',
        chosenCategoryId: 'partwhole_proportion',
        reactionMs: 900,
      },
    ],
    categories,
    problems,
  )

  describe('InterleavingHUD Component', () => {
    it('renders accuracy, entropy, confusion matrix and contrast pair telemetry', () => {
      const html = renderToString(
        React.createElement(InterleavingHUD, {
          telemetry,
          sequenceMetrics,
          categories,
          contrastMatrix,
          practiceAccuracy: 0.5,
        }),
      )

      expect(html).toContain('Interleaving &amp; Discrimination HUD')
      expect(html).toContain('Rohrer &amp; Taylor (2007)')
      expect(html).toContain('Discrimination Accuracy')
      expect(html).toContain('50%')
      expect(html).toContain('Category Entropy')
      expect(html).toContain('Surface Bias')
      expect(html).toContain('Category Confusion Matrix')
      expect(html).toContain('Top Confusions')
      expect(html).toContain('Sharpest Contrast Pair')
      expect(html).toContain('Practice feels hard at')
    })

    it('renders the empty-matrix placeholder before any attempts', () => {
      const empty = computeDiscriminationTelemetry([], categories, problems)
      const html = renderToString(
        React.createElement(InterleavingHUD, {
          telemetry: empty,
          sequenceMetrics,
          categories,
          contrastMatrix,
          practiceAccuracy: 0,
        }),
      )
      expect(html).toContain('awaiting attempts')
      expect(html).toContain('Answer discrimination drills to populate the confusion matrix.')
    })
  })

  describe('InterleavingStudio Component', () => {
    it('renders the drill workbench, schedule comparator, and tabs', () => {
      const html = renderToString(React.createElement(InterleavingStudio, {}))

      expect(html).toContain('Practice Schedule')
      expect(html).toContain('Interleaved (shuffled)')
      expect(html).toContain('Blocked (comparator)')
      expect(html).toContain('Discrimination Drill')
      expect(html).toContain('Contrast Matrix')
      expect(html).toContain('FSRS Deck')
      expect(html).toContain('identify the deep structure')
      expect(html).toContain('How to use this studio')
    })

    it('renders the calibrated counter-balanced problem and all four category choices', () => {
      const html = renderToString(React.createElement(InterleavingStudio, {}))

      // All four category buttons with their discrimination hints
      expect(html).toContain('Combined Work-Rate Completion')
      expect(html).toContain('Part-Whole Direct Proportion')
      expect(html).toContain('Geometric Decay Summation')
      expect(html).toContain('Inclusion-Exclusion Overlap')
      // The surface story never names the structure
      expect(html).toContain('role="group"')
    })
  })

  describe('Calibrated curriculum SSR invariants', () => {
    it('exposes contrast matrix data through the engine import path', () => {
      expect(contrastMatrix).toHaveLength(6)
      for (const cell of contrastMatrix) {
        expect(cell.structuralDistance).toBe(1)
        expect(cell.contrastUtility).toBeGreaterThan(0)
      }
    })
  })
})
