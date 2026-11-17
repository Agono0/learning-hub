import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import { FadedScaffoldingHUD } from '../src/ui/FadedScaffoldingHUD'
import { WorkedExampleStudio } from '../src/components/WorkedExampleStudio'
import { calculateCognitiveLoad } from '@learning-hub/core/scaffolding'

describe('Cognitive Load & Worked-Example Scaffolding Web Surfaces', () => {
  const load = calculateCognitiveLoad({
    elementInteractivity: 4,
    stage: 2,
    learnerExpertise: 0.0,
    hasSubgoalLabels: true,
  })

  describe('FadedScaffoldingHUD Component', () => {
    it('renders intrinsic, extraneous, and germane load meters and stage buttons', () => {
      const html = renderToString(
        React.createElement(FadedScaffoldingHUD, {
          stage: 2,
          strategy: 'backward',
          cognitiveLoad: load,
          elementInteractivity: 4,
          domain: 'distributed_systems',
          problemTitle: 'Raft Leader Election',
          activeStepIndex: 2,
          totalSteps: 4,
        }),
      )

      expect(html).toContain('Cognitive Load Theory')
      expect(html).toContain('Intrinsic Load (IL)')
      expect(html).toContain('Extraneous Load (EL)')
      expect(html).toContain('Germane Load (GL)')
      expect(html).toContain('Working Memory Budget')
      expect(html).toContain('Stage 1: Expert Model')
      expect(html).toContain('Stage 2: Backward Faded')
      expect(html).toContain('Backward (Atkinson)')
    })

    it('renders cognitive overload warning when total load exceeds working memory capacity', () => {
      const overloadedLoad = calculateCognitiveLoad({
        elementInteractivity: 5,
        stage: 4,
        learnerExpertise: -1.5,
        splitAttentionPresent: true,
      })

      const html = renderToString(
        React.createElement(FadedScaffoldingHUD, {
          stage: 4,
          strategy: 'backward',
          cognitiveLoad: overloadedLoad,
          elementInteractivity: 5,
          domain: 'distributed_systems',
          problemTitle: 'Raft Leader Election',
          activeStepIndex: 1,
          totalSteps: 4,
        }),
      )

      expect(html).toContain('Cognitive Overload Risk')
    })
  })

  describe('WorkedExampleStudio Component', () => {
    it('renders problem statement, sub-goal chunks, and workspace tabs', () => {
      const html = renderToString(
        React.createElement(WorkedExampleStudio, {
          initialProblemId: 'raft_leader_election',
          initialStage: 2,
        }),
      )

      expect(html).toContain('Calibrated Problem:')
      expect(html).toContain('Derivation &amp; Scaffolding Canvas')
      expect(html).toContain('Self-Explanation Lab')
      expect(html).toContain('Erroneous Example Crucible')
      expect(html).toContain('FSRS Flashcard Bridge')
      expect(html).toContain('Establish Quorum Intersection Invariant')
    })
  })
})
