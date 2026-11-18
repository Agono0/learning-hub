/**
 * @file apps/web/tests/spatial-cognition-integration.test.ts
 * @description Integration tests for Spatial Cognition & Mental Rotation Model-Checking Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  calculateSpatialVisualizationMetrics,
  generateFSRSSpatialDeck,
  MULTIDISCIPLINARY_SPATIAL_SCENARIOS,
  type RotationPerformanceAttempt,
} from '@learning-hub/core/spatial'
import { SpatialCognitionHUD } from '../src/ui/SpatialCognitionHUD'
import { SpatialCognitionStudio } from '../src/components/SpatialCognitionStudio'
import SpatialCognitionPage from '../app/spatial/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'

describe('Spatial Cognition & Mental Rotation Studio Web Integration', () => {
  it('renders SpatialCognitionHUD correctly in server context', () => {
    const attempts: RotationPerformanceAttempt[] = [
      {
        trialId: 't1',
        userResponseCongruent: true,
        isCorrect: true,
        reactionTimeMs: 1250,
        angularDisparityDeg: 60,
      },
      {
        trialId: 't2',
        userResponseCongruent: false,
        isCorrect: true,
        reactionTimeMs: 1480,
        angularDisparityDeg: 120,
      },
    ]

    const metrics = calculateSpatialVisualizationMetrics(attempts, 0.88, 0.1)

    const html = renderToString(
      React.createElement(SpatialCognitionHUD, {
        metrics,
        currentDisparityDeg: 60,
        measuredReactionTimeMs: 1250,
        expectedReactionTimeMs: 1220,
        isCongruentStimulus: true,
      }),
    )

    expect(html).toContain('Spatial Cognition Telemetry')
    expect(html).toContain('SVI Index')
    expect(html).toContain('Rotation Speed')
    expect(html).toContain('Kinematics')
    expect(html).toContain('Chirality Acc.')
    expect(html).toContain('Disparity:')
    expect(html).toContain('Congruent (SO3)')
    expect(html).toContain('Reaction Time Latency:')
    expect(html).toContain('1250')
    expect(html).toContain('Predicted:')
    expect(html).toContain('1220')
  })

  it('renders SpatialCognitionStudio with tabs, SVG viewers and interactive controls', () => {
    const html = renderToString(React.createElement(SpatialCognitionStudio))

    // Tab buttons
    expect(html).toContain('Shepard-Metzler Crucible')
    expect(html).toContain('Hegarty Kinematics')
    expect(html).toContain('STEM Spatial Lab')
    expect(html).toContain('FSRS Spatial Deck')

    // Crucible panel content
    expect(html).toContain('3D Mental Rotation &amp; Chiral Enantiomer Crucible')
    expect(html).toContain('Reference Target Figure (A)')
    expect(html).toContain('Comparison Figure (B)')
    expect(html).toContain('Congruent (SO3 Rotated)')
    expect(html).toContain('Mirror Enantiomer (Chiral)')

    // Polycube stimulus selector
    expect(html).toContain('Shepard-Metzler Dual-Bend Arm α')

    // SVG Canvas elements
    expect(html).toContain('<svg')
    expect(html).toContain('<polygon')
  })

  it('renders SpatialCognitionPage Next.js route entrypoint without crashing', () => {
    const html = renderToString(React.createElement(SpatialCognitionPage))
    expect(html).toContain('Spatial Cognition Telemetry')
    expect(html).toContain('Shepard-Metzler Crucible')
  })

  it('verifies that /spatial is correctly registered in navigation model', () => {
    const spatialItem = ALL_NAV_ITEMS.find((item) => item.href === '/spatial')
    expect(spatialItem).toBeDefined()
    expect(spatialItem?.label).toBe('Spatial Cognition')
    expect(spatialItem?.icon).toBeDefined()
  })

  it('renders multidisciplinary scenario definitions into studio state', () => {
    expect(MULTIDISCIPLINARY_SPATIAL_SCENARIOS.length).toBe(5)
    const titles = MULTIDISCIPLINARY_SPATIAL_SCENARIOS.map((s) => s.title)
    expect(titles.some((t) => t.includes('Stereochemistry'))).toBe(true)
    expect(titles.some((t) => t.includes('Epicyclic Planetary Gear Train'))).toBe(true)
    expect(titles.some((t) => t.includes('Structural Geology'))).toBe(true)
    expect(titles.some((t) => t.includes('Neuroanatomy'))).toBe(true)
    expect(titles.some((t) => t.includes('Robotics'))).toBe(true)
  })

  it('renders FSRS spatial flashcard deck with valid question prompts', () => {
    const deck = generateFSRSSpatialDeck()
    expect(deck.length).toBeGreaterThanOrEqual(5)
    deck.forEach((card) => {
      expect(card.id).toBeDefined()
      expect(card.question.length).toBeGreaterThan(10)
      expect(card.options.length).toBeGreaterThanOrEqual(2)
      expect(card.explanation.length).toBeGreaterThan(15)
    })
  })
})
