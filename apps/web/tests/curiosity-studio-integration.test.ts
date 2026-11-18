/**
 * @file apps/web/tests/curiosity-studio-integration.test.ts
 * @description Integration tests for Epistemic Curiosity & Information Gap Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CALIBRATED_CURIOSITY_MYSTERIES, InformationGapSession } from '@learning-hub/core/curiosity'
import { InformationGapHUD } from '../src/ui/InformationGapHUD'
import { InformationGapStudio } from '../src/components/InformationGapStudio'
import EpistemicCuriosityPage from '../app/curiosity/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'

describe('Epistemic Curiosity & Information Gap Studio Web Integration', () => {
  it('renders InformationGapHUD correctly in server context', () => {
    const session = new InformationGapSession('quantum_delayed_choice_eraser')
    const metrics = session.getMetrics()
    const mystery = session.getMystery()

    const html = renderToString(
      React.createElement(InformationGapHUD, {
        metrics,
        collativeVariable: mystery.collativeVariable,
        currentMysteryTitle: mystery.title,
      }),
    )

    expect(html).toContain('Loewenstein Information Gap &amp; Epistemic Curiosity HUD')
    expect(html).toContain('The Delayed-Choice Quantum Eraser Paradox')
    expect(html).toContain('Epistemic Tension')
    expect(html).toContain('Memory Multiplier')
    expect(html).toContain('Gap Narrowing')
    expect(html).toContain('Perceived Knowledge (k)')
    expect(html).toContain('Incongruity Variable')
  })

  it('renders InformationGapStudio with active mystery and 4 tabs', () => {
    const html = renderToString(React.createElement(InformationGapStudio))

    expect(html).toContain('Epistemic Curiosity &amp; Information Gap Studio')
    expect(html).toContain('George Loewenstein (1994)')
    expect(html).toContain('Daniel Berlyne (1960)')
    expect(html).toContain('Min Jeong Kang et al. (2009 Neuron)')
    expect(html).toContain('Paradox Hook &amp; Clues')
    expect(html).toContain('Incongruity Crucible')
    expect(html).toContain('Collative Variables &amp; Dopamine')
    expect(html).toContain('FSRS Curiosity Deck')
    expect(html).toContain('The Delayed-Choice Quantum Eraser Paradox')
  })

  it('renders the complete EpistemicCuriosityPage with header and action badges', () => {
    const html = renderToString(React.createElement(EpistemicCuriosityPage))

    expect(html).toContain('Loewenstein (1994)')
    expect(html).toContain('Berlyne Collatives')
    expect(html).toContain('Kang Dopamine Boost (1.85x)')
    expect(html).toContain('FSRS Epistemic Deck')
  })

  it('confirms /curiosity route is registered in navigation model', () => {
    const item = ALL_NAV_ITEMS.find((i) => i.href === '/curiosity')
    expect(item).toBeDefined()
    expect(item?.label).toBe('Epistemic Curiosity')
    expect(item?.icon).toBeDefined()
  })

  it('verifies all 4 calibrated mysteries exist with complete clues and resolver options', () => {
    expect(Object.keys(CALIBRATED_CURIOSITY_MYSTERIES)).toEqual([
      'quantum_delayed_choice_eraser',
      'synthetic_cdo_gaussian_copula',
      'antagonistic_pleiotropy_senescence',
      'fermi_paradox_great_filter',
    ])

    for (const mystery of Object.values(CALIBRATED_CURIOSITY_MYSTERIES)) {
      expect(mystery.clues.length).toBeGreaterThanOrEqual(3)
      expect(mystery.resolverOptions.length).toBeGreaterThanOrEqual(2)
      expect(mystery.paradoxHook).toBeTruthy()
      expect(mystery.initialIntuitionTrap).toBeTruthy()
      expect(mystery.epistemicDeprivationQuestion).toBeTruthy()
      expect(mystery.deepScientificExplanation).toBeTruthy()
    }
  })
})
