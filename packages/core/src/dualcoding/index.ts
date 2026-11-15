import { z } from 'zod'

/**
 * Dual Coding Theory Engine (Allan Paivio 1971, 1986; Clark & Paivio 1991; Mayer 2001).
 *
 * Information processed through both the verbal subsystem (linguistic, propositional)
 * and the non-verbal subsystem (imagistic, spatial, sensory) forms two independent
 * memory traces.
 *
 * Retrieval probability model:
 *   P(retrieval) = 1 - (1 - R_v) * (1 - R_img)
 *   P(forgetting) = (1 - R_v) * (1 - R_img)
 *
 * Even with modest retention in each channel (e.g. 70% each), the dual-coded retention
 * probability reaches 1 - (0.30 * 0.30) = 91%, delivering a 2.3x reduction in forgetting.
 */

export const dualCodingModalitySchema = z.enum([
  'sketch_diagram',
  'spatial_map',
  'sensory_metaphor',
  'concrete_exemplar',
])

export type DualCodingModality = z.infer<typeof dualCodingModalitySchema>

export const dualCodeItemSchema = z.object({
  id: z.string().min(1),
  cardId: z.number().int().positive().optional(),
  verbalText: z.string().min(1),
  visualAnchor: z.string().min(1),
  modality: dualCodingModalitySchema,
  spatialCoordinates: z
    .object({
      x: z.number(),
      y: z.number(),
      z: z.number().optional(),
    })
    .optional(),
  verbalRetention: z.number().min(0).max(1).default(0.7),
  visualRetention: z.number().min(0).max(1).default(0.75),
  createdAt: z.string().datetime().optional(),
})

export type DualCodeItem = z.infer<typeof dualCodeItemSchema>

export const dualCodingAnalysisSchema = z.object({
  cardId: z.number().int().positive().optional(),
  isDualCoded: z.boolean(),
  verbalRetention: z.number().min(0).max(1),
  visualRetention: z.number().min(0).max(1),
  compositeRetention: z.number().min(0).max(1),
  forgettingReductionFactor: z.number().positive(),
  recommendedModality: dualCodingModalitySchema,
  visualPromptSuggestion: z.string(),
})

export type DualCodingAnalysis = z.infer<typeof dualCodingAnalysisSchema>

/**
 * Calculates dual-coded composite retention and forgetting reduction.
 *
 * @param verbalRetention - probability of verbal retrieval (0 to 1)
 * @param visualRetention - probability of visual imagery retrieval (0 to 1)
 * @returns Composite probability of retrieving through either channel
 */
export function calculateDualCodingRetention(
  verbalRetention: number,
  visualRetention: number,
): {
  compositeRetention: number
  singleChannelForgetting: number
  dualChannelForgetting: number
  reductionFactor: number
} {
  const v = Math.min(1, Math.max(0, verbalRetention))
  const img = Math.min(1, Math.max(0, visualRetention))

  const singleForget = 1 - v
  const dualForget = Math.max(0.001, (1 - v) * (1 - img))
  const composite = 1 - dualForget
  const reductionFactor = singleForget > 0 ? singleForget / dualForget : 1

  return {
    compositeRetention: Math.round(composite * 1000) / 1000,
    singleChannelForgetting: Math.round(singleForget * 1000) / 1000,
    dualChannelForgetting: Math.round(dualForget * 1000) / 1000,
    reductionFactor: Math.round(reductionFactor * 100) / 100,
  }
}

/**
 * Heuristically inspects card text and determines the ideal non-verbal modality
 * and actionable prompt to turn text-only content into a dual-coded memory unit.
 */
export function recommendDualCodingPrompt(text: string): {
  modality: DualCodingModality
  suggestion: string
} {
  const lower = text.toLowerCase()

  // Process / flow / step keywords -> sketch diagram
  if (
    lower.includes('process') ||
    lower.includes('step') ||
    lower.includes('cycle') ||
    lower.includes('phase') ||
    lower.includes('then') ||
    lower.includes('flow')
  ) {
    return {
      modality: 'sketch_diagram',
      suggestion:
        'Draw a 3-stage flow diagram with directional arrows connecting the sequential transformations.',
    }
  }

  // Hierarchy / relationship / categorization -> spatial map
  if (
    lower.includes('versus') ||
    lower.includes('vs') ||
    lower.includes('category') ||
    lower.includes('types of') ||
    lower.includes('difference') ||
    lower.includes('consists of')
  ) {
    return {
      modality: 'spatial_map',
      suggestion:
        'Sketch a 2x2 matrix or hierarchical branch diagram comparing the contrasting attributes spatially.',
    }
  }

  // Abstract / mathematical / logical rules -> sensory metaphor
  if (
    lower.includes('theorem') ||
    lower.includes('proof') ||
    lower.includes('abstract') ||
    lower.includes('axiom') ||
    lower.includes('rule') ||
    lower.includes('principle')
  ) {
    return {
      modality: 'sensory_metaphor',
      suggestion:
        'Ground this abstract rule in a tangible physical metaphor (e.g. a balance scale, water reservoir, or spring).',
    }
  }

  // Concrete facts / definitions -> concrete exemplar
  return {
    modality: 'concrete_exemplar',
    suggestion:
      'Pair this definition with a concrete real-world photograph, icon, or specific historical example.',
  }
}

/**
 * Analyzes whether an item is currently dual-coded and produces a quantitative evaluation.
 */
export function analyzeDualCoding(params: {
  cardId?: number
  text: string
  hasImage?: boolean
  hasDiagram?: boolean
  verbalRetention?: number
  visualRetention?: number
}): DualCodingAnalysis {
  const isDualCoded = Boolean(params.hasImage || params.hasDiagram)
  const v = params.verbalRetention ?? 0.7
  const img = isDualCoded ? (params.visualRetention ?? 0.8) : 0

  const { compositeRetention, reductionFactor } = calculateDualCodingRetention(v, img)
  const rec = recommendDualCodingPrompt(params.text)

  return {
    cardId: params.cardId,
    isDualCoded,
    verbalRetention: v,
    visualRetention: img,
    compositeRetention,
    forgettingReductionFactor: reductionFactor,
    recommendedModality: rec.modality,
    visualPromptSuggestion: rec.suggestion,
  }
}
