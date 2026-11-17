import { describe, expect, it } from 'vitest'
import {
  analyzeDualCoding,
  calculateDualCodingRetention,
  dualCodingAnalysisSchema,
  recommendDualCodingPrompt,
} from '../src/dualcoding/index.js'

describe('Allan Paivio Dual Coding Theory Comprehensive Suite', () => {
  describe('Mathematical Retrieval Probability Model (Paivio 1971, Mayer 2001)', () => {
    it('calculates composite dual retention P = 1 - (1 - Rv)(1 - Rimg)', () => {
      // Rv = 0.70, Rimg = 0.70
      // P(forget) = 0.30 * 0.30 = 0.09 -> Composite = 0.91
      const ret = calculateDualCodingRetention(0.7, 0.7)
      expect(ret.compositeRetention).toBe(0.91)
      expect(ret.singleChannelForgetting).toBe(0.3)
      expect(ret.dualChannelForgetting).toBe(0.09)
      expect(ret.reductionFactor).toBeCloseTo(3.33, 1)
    })

    it('returns single channel retention when visual channel is zero', () => {
      const ret = calculateDualCodingRetention(0.75, 0.0)
      expect(ret.compositeRetention).toBe(0.75)
      expect(ret.reductionFactor).toBe(1.0)
    })

    it('clamps retention boundaries within [0, 1]', () => {
      const high = calculateDualCodingRetention(1.5, 1.2)
      expect(high.compositeRetention).toBeGreaterThanOrEqual(0.999)

      const low = calculateDualCodingRetention(-0.5, -0.2)
      expect(low.compositeRetention).toBe(0.0)
    })
  })

  describe('Modality Recommendation Heuristics', () => {
    it('recommends sketch_diagram for procedural and step flows', () => {
      const res = recommendDualCodingPrompt(
        'The cycle involves three sequential phases: phosphorylation, cleavage, and then oxidation.',
      )
      expect(res.modality).toBe('sketch_diagram')
      expect(res.suggestion).toContain('flow diagram')
    })

    it('recommends spatial_map for comparative versus and hierarchical structures', () => {
      const res = recommendDualCodingPrompt(
        'The fundamental difference versus supervised learning is the lack of label categories.',
      )
      expect(res.modality).toBe('spatial_map')
      expect(res.suggestion).toContain('spatial')
    })

    it('recommends sensory_metaphor for abstract mathematical theorems and axioms', () => {
      const res = recommendDualCodingPrompt(
        'By applying the central limit theorem axiom, the sum of independent variables converges.',
      )
      expect(res.modality).toBe('sensory_metaphor')
      expect(res.suggestion).toContain('tangible physical metaphor')
    })

    it('recommends concrete_exemplar for descriptive definitions', () => {
      const res = recommendDualCodingPrompt(
        'Mitochondria generate ATP through cellular respiration.',
      )
      expect(res.modality).toBe('concrete_exemplar')
    })
  })

  describe('Comprehensive Dual Coding Analysis Engine', () => {
    it('evaluates text with diagram present as dual-coded with elevated composite retention', () => {
      const analysis = analyzeDualCoding({
        cardId: 101,
        text: 'Action potential propagation across the node of Ranvier.',
        hasDiagram: true,
        verbalRetention: 0.65,
        visualRetention: 0.8,
      })

      expect(dualCodingAnalysisSchema.safeParse(analysis).success).toBe(true)
      expect(analysis.isDualCoded).toBe(true)
      expect(analysis.compositeRetention).toBeGreaterThan(analysis.verbalRetention)
      expect(analysis.forgettingReductionFactor).toBeGreaterThan(1.5)
      expect(analysis.visualPromptSuggestion).toBeDefined()
    })

    it('evaluates text-only card as non-dual-coded with standard baseline retention', () => {
      const analysis = analyzeDualCoding({
        cardId: 102,
        text: 'Definitions of discrete cosine transforms.',
        hasDiagram: false,
        hasImage: false,
      })

      expect(analysis.isDualCoded).toBe(false)
      expect(analysis.visualRetention).toBe(0)
      expect(analysis.forgettingReductionFactor).toBe(1.0)
    })
  })
})
