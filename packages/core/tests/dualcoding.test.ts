import { describe, expect, it } from 'vitest'
import {
  analyzeDualCoding,
  calculateDualCodingRetention,
  dualCodeItemSchema,
  recommendDualCodingPrompt,
} from '../src/dualcoding'

describe('Dual Coding Theory Engine', () => {
  it('validates a well-formed dual-coded memory unit schema', () => {
    const item = {
      id: 'dc-1',
      cardId: 101,
      verbalText: 'The citric acid cycle generates ATP through oxidative phosphorylation.',
      visualAnchor: '3-stage circular metabolic diagram with labeled mitochondrial matrix.',
      modality: 'sketch_diagram' as const,
      spatialCoordinates: { x: 120, y: 340, z: 0 },
      verbalRetention: 0.72,
      visualRetention: 0.85,
    }

    const parsed = dualCodeItemSchema.parse(item)
    expect(parsed.id).toBe('dc-1')
    expect(parsed.modality).toBe('sketch_diagram')
    expect(parsed.verbalRetention).toBe(0.72)
  })

  it('correctly calculates composite dual-coding retention based on Paivio formula', () => {
    // With Rv = 0.7 and Rimg = 0.8:
    // P(forget) = (1 - 0.7) * (1 - 0.8) = 0.3 * 0.2 = 0.06
    // Composite retention = 1 - 0.06 = 0.94
    // Reduction factor = 0.3 / 0.06 = 5.0x
    const res = calculateDualCodingRetention(0.7, 0.8)
    expect(res.compositeRetention).toBe(0.94)
    expect(res.singleChannelForgetting).toBe(0.3)
    expect(res.dualChannelForgetting).toBe(0.06)
    expect(res.reductionFactor).toBe(5)
  })

  it('recommends appropriate non-verbal modality based on semantic cues', () => {
    const flowRec = recommendDualCodingPrompt('Explain the 4-phase process of cellular mitosis.')
    expect(flowRec.modality).toBe('sketch_diagram')
    expect(flowRec.suggestion).toContain('flow diagram')

    const mapRec = recommendDualCodingPrompt(
      'Contrast Monolithic architecture versus Microservices architecture.',
    )
    expect(mapRec.modality).toBe('spatial_map')
    expect(mapRec.suggestion).toContain('matrix')

    const metaRec = recommendDualCodingPrompt(
      'State the Second Law of Thermodynamics and the axiom of entropy.',
    )
    expect(metaRec.modality).toBe('sensory_metaphor')
    expect(metaRec.suggestion).toContain('metaphor')

    const exRec = recommendDualCodingPrompt('The Rosetta Stone discovered in 1799.')
    expect(exRec.modality).toBe('concrete_exemplar')
  })

  it('analyzes text-only vs dual-coded items correctly', () => {
    const unencoded = analyzeDualCoding({
      cardId: 55,
      text: 'Describe the Calvin cycle steps.',
      hasImage: false,
    })
    expect(unencoded.isDualCoded).toBe(false)
    expect(unencoded.compositeRetention).toBe(0.7)
    expect(unencoded.forgettingReductionFactor).toBe(1)

    const dualCoded = analyzeDualCoding({
      cardId: 55,
      text: 'Describe the Calvin cycle steps.',
      hasImage: true,
      verbalRetention: 0.7,
      visualRetention: 0.8,
    })
    expect(dualCoded.isDualCoded).toBe(true)
    expect(dualCoded.compositeRetention).toBe(0.94)
    expect(dualCoded.forgettingReductionFactor).toBeGreaterThan(1)
  })
})
