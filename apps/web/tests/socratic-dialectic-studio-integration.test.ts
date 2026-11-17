import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import { ToulminArgumentHUD } from '../src/ui/ToulminArgumentHUD'
import { SocraticDialecticStudio } from '../src/components/SocraticDialecticStudio'
import { DEEP_DIALECTIC_CASES } from '@learning-hub/core/dialectic'

describe('Socratic Dialectic Studio & Toulmin Argumentation Surfaces', () => {
  const sampleCase = DEEP_DIALECTIC_CASES[0]!
  const sampleGraph = sampleCase.defaultGraph

  describe('ToulminArgumentHUD Component', () => {
    it('renders topic, epistemic rigor percentage gauge, and Bloom Level 6 badge', () => {
      const html = renderToString(
        React.createElement(ToulminArgumentHUD, {
          graph: sampleGraph,
        }),
      )

      expect(html).toContain(sampleGraph.topic)
      expect(html).toContain('Toulmin Argument Model')
      expect(html).toContain('Epistemic Rigor')
      expect(html).toContain('Bloom Level 6: Evaluated')
      expect(html).toContain('Grounding Ratio')
      expect(html).toContain('Warrant Backing')
      expect(html).toContain('Boundary Defeaters')
    })

    it('renders individual Toulmin elements with color-coded badges and texts', () => {
      const html = renderToString(
        React.createElement(ToulminArgumentHUD, {
          graph: sampleGraph,
        }),
      )

      expect(html).toContain('Claim')
      expect(html).toContain('Grounds')
      expect(html).toContain('Warrant')
      expect(html).toContain('Backing')
      expect(html).toContain('Rebuttal')

      // Assert that actual text from nodes appears
      expect(html).toContain('Hume’s Is-Ought Distinction')
    })

    it('renders export cards action button when onExportCards is provided', () => {
      const html = renderToString(
        React.createElement(ToulminArgumentHUD, {
          graph: sampleGraph,
          onExportCards: () => {},
        }),
      )

      expect(html).toContain('Export Cards')
    })
  })

  describe('SocraticDialecticStudio Component', () => {
    it('renders studio header, topic selector, and audio cue toggle', () => {
      const html = renderToString(
        React.createElement(SocraticDialecticStudio, {
          initialCaseSlug: sampleCase.slug,
        }),
      )

      expect(html).toContain('The Orthogonality Thesis')
      expect(html).toContain('Instrumental Convergence')
      expect(html).toContain('AI Safety')
      expect(html).toContain('Philosophy of Mind')
      expect(html).toContain('Socratic Dialectic Arena &amp; Toulmin Argumentation Model')
      expect(html).toContain('Toggle Audio Cues')
    })

    it('renders workspace tabs for transcript, toulmin graph, lakatos lab, and protege', () => {
      const html = renderToString(
        React.createElement(SocraticDialecticStudio, {
          initialCaseSlug: sampleCase.slug,
        }),
      )

      expect(html).toContain('Arena Transcript &amp; Fallacy Spotter')
      expect(html).toContain('Toulmin Argument HUD &amp; Graph')
      expect(html).toContain('Lakatos Socratic Lab')
      expect(html).toContain('Protégé Peer (Alex)')
    })

    it('renders fallacy spotter radar and closing verdict synthesis bar', () => {
      const html = renderToString(
        React.createElement(SocraticDialecticStudio, {
          initialCaseSlug: sampleCase.slug,
        }),
      )

      expect(html).toContain('Fallacy Spotter Radar')
      expect(html).toContain('Flag Fallacy &amp; Score')
      expect(html).toContain('Learner Closing Verdict (Bloom Level 6 Synthesis)')
      expect(html).toContain('Evaluate Verdict')
      expect(html).toContain('Deck Bridge')
    })
  })
})
