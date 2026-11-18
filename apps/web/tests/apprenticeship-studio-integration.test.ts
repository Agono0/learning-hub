/**
 * @file apps/web/tests/apprenticeship-studio-integration.test.ts
 * @description Integration tests for Cognitive Apprenticeship & Expert Modeling Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_APPRENTICESHIP_SUITES,
  CognitiveApprenticeshipSession,
} from '@learning-hub/core/apprenticeship'
import { CognitiveApprenticeshipHUD } from '../src/ui/CognitiveApprenticeshipHUD'
import { CognitiveApprenticeshipStudio } from '../src/components/CognitiveApprenticeshipStudio'
import CognitiveApprenticeshipPage from '../app/apprenticeship/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'

describe('Cognitive Apprenticeship Studio Web Integration', () => {
  it('renders CognitiveApprenticeshipHUD correctly in server context', () => {
    const session = new CognitiveApprenticeshipSession('distributed_consensus_raft')
    const metrics = session.getMetrics()

    const html = renderToString(
      React.createElement(CognitiveApprenticeshipHUD, {
        currentStage: session.getCurrentStage(),
        metrics,
      }),
    )

    expect(html).toContain('Cognitive Apprenticeship Status')
    expect(html).toContain('Peripheral Observer')
    expect(html).toContain('Tacit Extraction')
    expect(html).toContain('Fading Index')
    expect(html).toContain('1. Modeling')
    expect(html).toContain('6. Exploration')
  })

  it('renders CognitiveApprenticeshipStudio with active suite and think-aloud tabs', () => {
    const html = renderToString(React.createElement(CognitiveApprenticeshipStudio))

    expect(html).toContain('Cognitive Apprenticeship &amp; Expert Modeling Studio')
    expect(html).toContain('Expert Think-Aloud Traces')
    expect(html).toContain('Articulation Crucible')
    expect(html).toContain('Comparative Reflection')
    expect(html).toContain('FSRS Tacit Deck &amp; Ledger')
    expect(html).toContain('Raft Distributed Consensus')
    expect(html).toContain('Master Modeler Persona')
  })

  it('renders the complete CognitiveApprenticeshipPage with header and action badges', () => {
    const html = renderToString(React.createElement(CognitiveApprenticeshipPage))

    expect(html).toContain('Collins-Brown (1989)')
    expect(html).toContain('LPP Situated Mastery')
    expect(html).toContain('Tacit Extraction')
    expect(html).toContain('Scaffold Fading')
  })

  it('confirms /apprenticeship route is registered in navigation model', () => {
    const item = ALL_NAV_ITEMS.find((i) => i.href === '/apprenticeship')
    expect(item).toBeDefined()
    expect(item?.label).toBe('Cognitive Apprenticeship')
    expect(item?.icon).toBeDefined()
  })

  it('verifies all 3 calibrated suites exist with traces and principles', () => {
    expect(Object.keys(CALIBRATED_APPRENTICESHIP_SUITES)).toEqual([
      'distributed_consensus_raft',
      'zero_knowledge_snarks',
      'aerospace_fault_tolerant_gnc',
    ])

    for (const suite of Object.values(CALIBRATED_APPRENTICESHIP_SUITES)) {
      expect(suite.traces.length).toBeGreaterThan(0)
      expect(suite.principles.length).toBeGreaterThan(0)
      expect(suite.prompts.length).toBeGreaterThan(0)
      expect(suite.reflectionContrasts.length).toBeGreaterThan(0)
    }
  })
})
