import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import { ConceptInspectorHUD } from '../src/ui/ConceptInspectorHUD'
import { ConstellationStudio } from '../src/components/ConstellationStudio'
import { InteractiveMindmapStudio } from '../src/components/InteractiveMindmapStudio'
import type { ConstellationNode, ConstellationEdge } from '@learning-hub/core/knowledge-graph'

describe('Spatial Constellation & Mindmap Workbench Integration Surfaces', () => {
  describe('ConceptInspectorHUD Component', () => {
    const sampleNode = {
      id: 'concept-backpropagation',
      title: 'Backpropagation & Gradient Descent',
      description: 'Calculus chain rule applied to neural network weight optimization.',
      domain: 'Machine Learning',
      masteryProbability: 0.88,
      retentionProbability: 0.92,
      fsrsStabilityDays: 14.2,
      totalReviews: 12,
      lastPracticedDaysAgo: 2,
      tags: ['deep-learning', 'calculus'],
    }

    it('renders concept details, domain badge, and BKT mastery metrics', () => {
      const html = renderToString(
        React.createElement(ConceptInspectorHUD, {
          node: sampleNode,
        }),
      )

      expect(html).toContain('Backpropagation &amp; Gradient Descent')
      expect(html).toContain('Machine Learning')
      expect(html).toMatch(/88.*%/)
      expect(html).toMatch(/14\.2.*d/)
      expect(html).toMatch(/92.*%/)
    })

    it('renders bottleneck alert badge when concept is flagged as critical prerequisite bottleneck', () => {
      const html = renderToString(
        React.createElement(ConceptInspectorHUD, {
          node: sampleNode,
          isBottleneck: true,
          bottleneckReason: 'Blocks 5 downstream deep learning architectures',
        }),
      )

      expect(html).toContain('Curriculum Bottleneck')
      expect(html).toContain('Blocks 5 downstream deep learning architectures')
    })

    it('renders interactive action buttons when handlers are provided', () => {
      const html = renderToString(
        React.createElement(ConceptInspectorHUD, {
          node: sampleNode,
          onLaunchRemedialDrill: () => {},
          onExploreLearningPath: () => {},
        }),
      )

      expect(html).toContain('Targeted Drill')
      expect(html).toContain('Learning Trail')
    })
  })

  describe('ConstellationStudio Component', () => {
    const mockNodes: ConstellationNode[] = [
      {
        id: 'c1',
        title: 'Linear Algebra Foundations',
        domain: 'Mathematics',
        mastery: 0.95,
        retention: 0.9,
        x: 300,
        y: 200,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        mass: 1.5,
        radius: 16,
      },
      {
        id: 'c2',
        title: 'Eigenvalues & SVD',
        domain: 'Mathematics',
        mastery: 0.65,
        retention: 0.7,
        x: 450,
        y: 250,
        z: 30,
        vx: 0,
        vy: 0,
        vz: 0,
        mass: 1.5,
        radius: 14,
      },
    ]

    const mockEdges: ConstellationEdge[] = [
      { sourceId: 'c1', targetId: 'c2', strength: 0.9, type: 'prerequisite' },
    ]

    it('renders studio workbench header, 2D Galaxy vs 3D Orbit view switchers, and canvas', () => {
      const html = renderToString(
        React.createElement(ConstellationStudio, {
          initialNodes: mockNodes,
          initialEdges: mockEdges,
        }),
      )

      expect(html).toContain('Concept Constellation Workbench')
      expect(html).toContain('2D Galaxy')
      expect(html).toContain('3D Orbit')
      expect(html).toMatch(/Physics.*Live/)
      expect(html).toContain('<canvas')
    })

    it('renders sound and fullscreen accessibility controls', () => {
      const html = renderToString(
        React.createElement(ConstellationStudio, {
          initialNodes: mockNodes,
          initialEdges: mockEdges,
        }),
      )

      expect(html).toContain('Toggle Celestial Soundscape')
      expect(html).toContain('Toggle Fullscreen')
    })
  })

  describe('InteractiveMindmapStudio Component', () => {
    const sampleMarkdown = `# Quantum Mechanics
- Wave-Particle Duality
  - De Broglie Wavelength: Relates momentum to wave characteristics
  - Photoelectric Effect: Photon quantization proof
- Uncertainty Principle
  - Position-Momentum: Cannot measure both with arbitrary precision`

    it('renders interactive mindmap workbench canvas and layout buttons', () => {
      const html = renderToString(
        React.createElement(InteractiveMindmapStudio, {
          initialTitle: 'Quantum Mechanics',
          initialMarkdown: sampleMarkdown,
        }),
      )

      expect(html).toContain('Quantum Mechanics')
      expect(html).toContain('Card Miner')
      expect(html).toContain('SVG')
      expect(html).toContain('Outline Source')
      expect(html).toContain('Wave-Particle Du')
      expect(html).toContain('Photoelectric Ef')
    })

    it('renders zoom controls and canvas reset button', () => {
      const html = renderToString(
        React.createElement(InteractiveMindmapStudio, {
          initialTitle: 'Quantum Mechanics',
          initialMarkdown: sampleMarkdown,
        }),
      )

      expect(html).toMatch(/100.*%/)
      expect(html).toContain('Reset')
    })
  })
})
