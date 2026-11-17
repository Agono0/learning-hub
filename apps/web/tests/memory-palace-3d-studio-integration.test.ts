import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import { SpatialLocusHUD } from '../src/ui/SpatialLocusHUD'
import { MemoryPalace3DStudio } from '../src/components/MemoryPalace3DStudio'
import type { SpatialLocus } from '@learning-hub/core/spatial'

describe('Memory Palace 3D Studio & WebXR Integration Surfaces', () => {
  describe('SpatialLocusHUD Component', () => {
    const sampleLocus: SpatialLocus = {
      id: 'locus-hippocampus',
      title: 'Hippocampal Circuitry & CA1 Pyramidal Cells',
      position: [3.5, 0.8, -4.0],
      rotationY: Math.PI / 2,
      assetType: 'pedestal_plaque',
      contentPreview: 'Trisynaptic loop: Entorhinal cortex -> Dentate Gyrus -> CA3 -> CA1',
    }

    const sampleCard = {
      front: 'What is the canonical trisynaptic circuit pathway of the hippocampus?',
      back: 'Entorhinal cortex (perforant path) -> Dentate Gyrus (mossy fibers) -> CA3 (Schaffer collaterals) -> CA1.',
    }

    it('renders locus title, asset type badge, and spatial retention bonus', () => {
      const html = renderToString(
        React.createElement(SpatialLocusHUD, {
          locus: sampleLocus,
          distanceMeters: 2.1,
          stereoPan: 0.45,
          retentionBonusMultiplier: 1.28,
          cardContent: sampleCard,
        }),
      )

      expect(html).toContain('Hippocampal Circuitry &amp; CA1 Pyramidal Cells')
      expect(html).toContain('Pedestal Plaque')
      expect(html).toMatch(/1\.28.*Spatial Retention/)
      expect(html).toMatch(/2\.1.*m away/)
      expect(html).toContain('45% Right')
    })

    it('renders front card prompt and reveal answer button', () => {
      const html = renderToString(
        React.createElement(SpatialLocusHUD, {
          locus: sampleLocus,
          distanceMeters: 1.5,
          cardContent: sampleCard,
        }),
      )

      expect(html).toContain('What is the canonical trisynaptic circuit pathway')
      expect(html).toContain('Reveal Answer')
    })

    it('renders tour action button when onStartTour handler is provided', () => {
      const html = renderToString(
        React.createElement(SpatialLocusHUD, {
          locus: sampleLocus,
          distanceMeters: 1.8,
          onStartTour: () => {},
        }),
      )

      expect(html).toContain('Start Guided Tour from Here')
    })
  })

  describe('MemoryPalace3DStudio Component', () => {
    const mockLoci: SpatialLocus[] = [
      {
        id: 'loc-1',
        title: 'Long-Term Potentiation',
        position: [3.0, 0.8, 3.0],
        rotationY: 0,
        assetType: 'pedestal_plaque',
      },
      {
        id: 'loc-2',
        title: 'Synaptic Tagging',
        position: [-3.0, 0.8, 3.0],
        rotationY: Math.PI,
        assetType: 'holographic_orb',
      },
    ]

    it('renders 3D studio header, palace title, and room archetype selector', () => {
      const html = renderToString(
        React.createElement(MemoryPalace3DStudio, {
          palaceTitle: 'Neurobiology of Memory',
          initialArchetype: 'roman_villa',
          initialLoci: mockLoci,
        }),
      )

      expect(html).toContain('Neurobiology of Memory')
      expect(html).toContain('3D Spatial Memory Palace &amp; WebXR Immersive Loci Walkthrough')
      expect(html).toContain('Roman Villa')
      expect(html).toContain('Modern Gallery')
      expect(html).toContain('Cyber Sanctum')
      expect(html).toContain('Renaissance Library')
      expect(html).toContain('Zen Monastery')
    })

    it('renders guided tour controls and on-screen directional navigation pad', () => {
      const html = renderToString(
        React.createElement(MemoryPalace3DStudio, {
          palaceTitle: 'Neurobiology of Memory',
          initialLoci: mockLoci,
        }),
      )

      expect(html).toContain('Guided Tour')
      expect(html).toContain('Toggle Spatial Audio')
      expect(html).toContain('Reset Position')
      expect(html).toContain('Walk Forward (W)')
      expect(html).toContain('Strafe Left (A)')
      expect(html).toContain('Strafe Right (D)')
      expect(html).toContain('Walk Backward (S)')
    })

    it('renders cognitive Method of Loci retention multiplier and progress bar in footer', () => {
      const html = renderToString(
        React.createElement(MemoryPalace3DStudio, {
          palaceTitle: 'Neurobiology of Memory',
          initialLoci: mockLoci,
        }),
      )

      expect(html).toContain('Method of Loci Multiplier:')
      expect(html).toContain('Lapse Reduction:')
      expect(html).toContain('Loci Progress:')
    })
  })
})
