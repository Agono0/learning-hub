/**
 * @file desirable-difficulty-studio-integration.test.ts
 * @description Web integration tests for Bjork & Slamecka Desirable Difficulty HUD and Studio components.
 */

import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import { DesirableDifficultyHUD } from '../src/ui/DesirableDifficultyHUD'
import { DesirableDifficultyStudio } from '../src/components/DesirableDifficultyStudio'
import {
  CALIBRATED_GENERATION_CHALLENGES,
  calculateStorageHalfLifeHours,
  calculateStorageStrengthDelta,
  classifyBjorkQuadrant,
} from '@learning-hub/core/generation'

describe('Desirable Difficulties & Generative Retrieval Web Integration', () => {
  const challenge = CALIBRATED_GENERATION_CHALLENGES['raft_consensus_invariants']!
  const memoryState = {
    conceptId: challenge.id,
    conceptTitle: challenge.title,
    storageStrength: challenge.initialStorageStrength,
    retrievalStrength: challenge.initialRetrievalStrength,
    lastRetrievedAt: new Date().toISOString(),
    quadrant: classifyBjorkQuadrant(
      challenge.initialStorageStrength,
      challenge.initialRetrievalStrength,
    ),
    projectedStorageDelta: calculateStorageStrengthDelta({
      storageStrength: challenge.initialStorageStrength,
      retrievalStrength: challenge.initialRetrievalStrength,
      tier: 'stem_completion',
      isCorrect: true,
    }),
    estimatedHalfLifeHours: calculateStorageHalfLifeHours(challenge.initialStorageStrength),
  }

  describe('DesirableDifficultyHUD Component', () => {
    it('renders 2D phase space, storage and retrieval gauges, and tier indicators', () => {
      const html = renderToString(
        React.createElement(DesirableDifficultyHUD, {
          memoryState,
          activeTier: 'stem_completion',
        }),
      )

      expect(html).toContain('Desirable Difficulty Matrix')
      expect(html).toContain('Bjork &amp; Bjork (2011) Disuse Theory')
      expect(html).toContain('Storage Strength')
      expect(html).toContain('Retrieval Strength')
      expect(html).toContain('Cognitive Effort Index')
      expect(html).toContain('Storage Gain (ΔSS)')
      expect(html).toContain('Slamecka (1978) Generative Ladder')
      expect(html).toContain('Desirable Difficulty Target')
    })
  })

  describe('DesirableDifficultyStudio Component', () => {
    it('renders generative ladder workspace, tier buttons, and challenge prompts', () => {
      const html = renderToString(React.createElement(DesirableDifficultyStudio, {}))

      expect(html).toContain('Generative Ladder')
      expect(html).toContain('Bjork SS/RS Matrix')
      expect(html).toContain('Testing Crucible')
      expect(html).toContain('FSRS Deck')
      expect(html).toContain('Tier')
      expect(html).toContain('Stem Completion')
      expect(html).toContain('Your Generative Formulation')
      expect(html).toContain('Evaluate Retrieval Attempt')
    })
  })
})
