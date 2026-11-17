/**
 * @file dual-coding-studio-integration.test.ts
 * @description Web SSR integration tests for Paivio Dual-Coding HUD and Studio components.
 */

import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import { DualCodingHUD } from '../src/ui/DualCodingHUD'
import { DualCodingStudio } from '../src/components/DualCodingStudio'
import {
  auditMayerCompliance,
  calculateDualCodingMetrics,
  CALIBRATED_DUAL_CODING_SCHEMATA,
} from '@learning-hub/core/multimodal/dual-coding-engine'

describe('Dual-Coding & Visuospatial Schematization Web Integration', () => {
  const schema = CALIBRATED_DUAL_CODING_SCHEMATA['bft_consensus_quorum']!
  const metrics = calculateDualCodingMetrics(schema)
  const audit = auditMayerCompliance(schema)

  describe('DualCodingHUD Component', () => {
    it('renders Dual-Channel Balance, Mayer CTML score, and referential links', () => {
      const html = renderToString(
        React.createElement(DualCodingHUD, {
          metrics,
          audit,
          activeLogogenId: 'log_bft_n_size',
          activeImagenId: 'img_quorum_a',
        }),
      )

      expect(html).toContain('Dual-Coding &amp; Mayer CTML HUD')
      expect(html).toContain('Paivio (1971) Additive Dual-Channel Model')
      expect(html).toContain('Verbal (Logogens)')
      expect(html).toContain('Visual (Imagens)')
      expect(html).toContain('Mayer CTML Compliance Score')
      expect(html).toContain('Spatial Contiguity')
      expect(html).toContain('Coherence Purity')
      expect(html).toContain('Signaling Salience')
      expect(html).toContain('Segmenting Steps')
      expect(html).toContain('Optimally Dual-Coded')
    })
  })

  describe('DualCodingStudio Component', () => {
    it('renders visual schematizer, logogens list, and workspace tabs', () => {
      const html = renderToString(React.createElement(DualCodingStudio, {}))

      expect(html).toContain('Visual Schematizer')
      expect(html).toContain('Mayer CTML Audit')
      expect(html).toContain('Segmented Tour')
      expect(html).toContain('FSRS Cards')
      expect(html).toContain('Verbal Logogens')
      expect(html).toContain('Visuospatial Imagens Canvas')
      expect(html).toContain('Total replica nodes must satisfy')
    })
  })
})
