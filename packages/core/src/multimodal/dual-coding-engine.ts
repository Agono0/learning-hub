/**
 * @file dual-coding-engine.ts
 * @module @learning-hub/core/multimodal
 * @description Paivio (1971, 1986) Dual-Coding Theory (DCT) & Mayer (2001, 2014) Cognitive Theory of Multimedia Learning (CTML) Engine.
 *
 * Grounded in:
 * 1. Allan Paivio (1971, 1986, 1991) "Dual Coding Theory and Education"
 *    - Orthogonal verbal (Logogens) and non-verbal/pictorial (Imagens) cognitive subsystems.
 *    - Structural representations vs Referential associative inter-connections.
 *    - Additive recall hypothesis: Concepts encoded across both channels achieve ~2x retrieval accessibility.
 * 2. Richard E. Mayer (2001, 2014, 2021) "Cognitive Theory of Multimedia Learning"
 *    - 12 Research-validated multimedia principles (Spatial Contiguity, Coherence, Signaling, Redundancy, Segmenting, Modality).
 *    - Split-attention minimization and spatial integration auditing.
 * 3. John Sweller (2011) "Cognitive Load Theory in Multimedia Learning"
 *    - Extraneous cognitive load minimization through integrated diagrammatic schematization.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// 1. Zod Schemas & Types
// ---------------------------------------------------------------------------

export const logogenModalityEnum = z.enum([
  'verbal_proposition',
  'mathematical_formula',
  'syntactic_rule',
  'mechanistic_thesis',
])
export type LogogenModality = z.infer<typeof logogenModalityEnum>

export const imagenShapeEnum = z.enum([
  'geometric_node',
  'directional_vector',
  'spatial_boundary',
  'state_box',
  'feedback_loop',
])
export type ImagenShape = z.infer<typeof imagenShapeEnum>

export const referentialTypeEnum = z.enum([
  'illustrates', // Logogen proposition is depicted by Imagen
  'spatializes', // Abstract sequence mapped to visual topology
  'grounds', // Formal formula grounded in concrete diagram
  'isomorphic_mapping', // Structural identity between verbal rule and spatial form
])
export type ReferentialType = z.infer<typeof referentialTypeEnum>

export const logogenNodeSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  modality: logogenModalityEnum,
  importanceWeight: z.number().min(0).max(1).default(0.8),
  keyTokens: z.array(z.string()).default([]),
})
export type LogogenNode = z.infer<typeof logogenNodeSchema>

export const imagenNodeSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  shape: imagenShapeEnum,
  /** Normalized coordinates 0-100 on canvas viewBox */
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(5).max(60).default(20),
  height: z.number().min(5).max(60).default(12),
  colorTone: z.enum(['cyan', 'emerald', 'amber', 'violet', 'rose', 'neutral']).default('cyan'),
  iconSymbol: z.string().default('box'),
  signalingHighlight: z.boolean().default(false),
})
export type ImagenNode = z.infer<typeof imagenNodeSchema>

export const referentialConnectionSchema = z.object({
  id: z.string(),
  logogenId: z.string(),
  imagenId: z.string(),
  relation: referentialTypeEnum,
  couplingStrength: z.number().min(0).max(1).default(0.85),
  /** Distance in normalized coordinates between verbal text and visual shape */
  spatialSeparationDistance: z.number().min(0).max(141.4), // max sqrt(100^2 + 100^2)
  isIntegratedCaption: z.boolean(),
})
export type ReferentialConnection = z.infer<typeof referentialConnectionSchema>

export const dualCodingSchemaItemSchema = z.object({
  id: z.string(),
  domain: z.enum(['distributed_systems', 'neuroscience', 'machine_learning', 'psychometrics']),
  title: z.string(),
  coreConcept: z.string(),
  summary: z.string(),
  logogens: z.array(logogenNodeSchema),
  imagens: z.array(imagenNodeSchema),
  referentialLinks: z.array(referentialConnectionSchema),
  stageSteps: z.array(z.string()).default([]),
})
export type DualCodingSchemaItem = z.infer<typeof dualCodingSchemaItemSchema>

export interface MayerComplianceAudit {
  overallComplianceScore: number // 0 to 100
  spatialContiguityScore: number // 0 to 100 (penalizes split attention when distance > 25)
  coherencePurityScore: number // 0 to 100 (ratio of essential to extraneous elements)
  signalingSalienceScore: number // 0 to 100 (presence of visual emphasis cues)
  segmentingModularityScore: number // 0 to 100 (steps/chunking)
  identifiedViolations: string[]
  evidenceBasedRecommendations: string[]
}

export interface DualCodingMetrics {
  logogenCount: number
  imagenCount: number
  referentialLinkCount: number
  dualCodingBalanceRatio: number // 0 (completely lopsided) to 1.0 (perfectly balanced)
  referentialDensity: number // Average referential links per cognitive entity
  dualCodingRetentionMultiplier: number // 1.25x to 2.35x Paivio additive boost
  status:
    | 'purely_verbal_vulnerable'
    | 'purely_visual_unanchored'
    | 'partially_dual_coded'
    | 'optimally_dual_coded'
}

// ---------------------------------------------------------------------------
// 2. Metrics & Cognitive Calculations
// ---------------------------------------------------------------------------

/**
 * Calculates Paivio Dual-Coding Index and additive retention multiplier.
 * Grounded in Paivio's additive memory hypothesis:
 * Dual retrieval probability: P(Recall) = P(Logogen) + P(Imagen) - P(Logogen)*P(Imagen)
 */
export function calculateDualCodingMetrics(item: DualCodingSchemaItem): DualCodingMetrics {
  const logogenCount = item.logogens.length
  const imagenCount = item.imagens.length
  const referentialLinkCount = item.referentialLinks.length

  const totalNodes = logogenCount + imagenCount
  if (totalNodes === 0) {
    return {
      logogenCount: 0,
      imagenCount: 0,
      referentialLinkCount: 0,
      dualCodingBalanceRatio: 0,
      referentialDensity: 0,
      dualCodingRetentionMultiplier: 1.0,
      status: 'partially_dual_coded',
    }
  }

  // Balance ratio: 1.0 when counts are equal; drops towards 0 when lopsided
  const diff = Math.abs(logogenCount - imagenCount)
  const dualCodingBalanceRatio = Number((1.0 - diff / totalNodes).toFixed(2))

  // Geometric mean normalizer for referential density
  const theoreticalMaxLinks = Math.max(1, logogenCount * imagenCount)
  const referentialDensity = Number(
    Math.min(1.0, referentialLinkCount / Math.sqrt(theoreticalMaxLinks)).toFixed(2),
  )

  // Status classification
  let status: DualCodingMetrics['status'] = 'partially_dual_coded'
  if (logogenCount >= 2 && imagenCount === 0) {
    status = 'purely_verbal_vulnerable'
  } else if (imagenCount >= 2 && logogenCount === 0) {
    status = 'purely_visual_unanchored'
  } else if (dualCodingBalanceRatio >= 0.65 && referentialDensity >= 0.5) {
    status = 'optimally_dual_coded'
  }

  // Multiplier scales from 1.25 to 2.35 based on balance, referential links, and coupling
  const avgCoupling =
    item.referentialLinks.length > 0
      ? item.referentialLinks.reduce((acc, l) => acc + l.couplingStrength, 0) /
        item.referentialLinks.length
      : 0.5

  const additiveBoost =
    1.0 + 0.65 * dualCodingBalanceRatio + 0.45 * referentialDensity * avgCoupling
  const dualCodingRetentionMultiplier = Number(
    Math.min(2.35, Math.max(1.15, additiveBoost)).toFixed(2),
  )

  return {
    logogenCount,
    imagenCount,
    referentialLinkCount,
    dualCodingBalanceRatio,
    referentialDensity,
    dualCodingRetentionMultiplier,
    status,
  }
}

/**
 * Evaluates CTML (Cognitive Theory of Multimedia Learning) Compliance against Mayer's principles:
 * 1. Multimedia Principle
 * 2. Spatial Contiguity Principle
 * 3. Coherence Principle
 * 4. Signaling Principle
 * 5. Segmenting Principle
 */
export function auditMayerCompliance(item: DualCodingSchemaItem): MayerComplianceAudit {
  const violations: string[] = []
  const recommendations: string[] = []

  // 1. Multimedia check
  const hasLogogens = item.logogens.length > 0
  const hasImagens = item.imagens.length > 0
  if (!hasLogogens) {
    violations.push(
      'Multimedia Principle: Absent verbal explanation lemmas (pure visual diagram lacks semantic anchoring).',
    )
    recommendations.push(
      'Add core verbal propositions explaining the mechanisms depicted in the diagram.',
    )
  }
  if (!hasImagens) {
    violations.push(
      'Multimedia Principle: Pure text with zero visuospatial schematics (high risk of split-attention and cognitive overload).',
    )
    recommendations.push(
      'Create geometric state boxes or directional vectors to visualize state transitions.',
    )
  }

  // 2. Spatial Contiguity check
  let spatialContiguityScore = 100
  if (item.referentialLinks.length > 0) {
    let unintegratedCount = 0
    let totalSeparation = 0

    for (const link of item.referentialLinks) {
      totalSeparation += link.spatialSeparationDistance
      if (!link.isIntegratedCaption && link.spatialSeparationDistance > 30) {
        unintegratedCount++
      }
    }

    const avgDistance = totalSeparation / item.referentialLinks.length
    if (avgDistance > 35 || unintegratedCount > 0) {
      spatialContiguityScore = Math.max(
        30,
        Math.round(100 - avgDistance * 1.5 - unintegratedCount * 10),
      )
      violations.push(
        `Spatial Contiguity Principle: ${unintegratedCount} referential links exhibit excessive separation (>30% canvas span), causing split-attention.`,
      )
      recommendations.push(
        'Reposition verbal captions directly adjacent to or inside the corresponding visual components.',
      )
    }
  } else if (hasLogogens && hasImagens) {
    spatialContiguityScore = 40
    violations.push(
      'Spatial Contiguity Principle: Verbal and visual elements exist in isolation with no explicit referential linkages.',
    )
    recommendations.push(
      'Connect logogen statements to corresponding visual nodes with referential relation links.',
    )
  }

  // 3. Coherence Principle (avoid seductive details)
  const extraneousImagens = item.imagens.filter(
    (img) => img.shape === 'spatial_boundary' && !img.label.trim(),
  )
  const coherencePurityScore = Math.max(50, Math.round(100 - extraneousImagens.length * 20))
  if (extraneousImagens.length > 0) {
    violations.push(
      `Coherence Principle: Detected ${extraneousImagens.length} unlabeled visual artifacts adding extraneous cognitive load.`,
    )
    recommendations.push(
      'Remove or label decorative geometric containers to preserve germane cognitive resources.',
    )
  }

  // 4. Signaling Principle (visual highlighting on essential elements)
  const signaledCount = item.imagens.filter((img) => img.signalingHighlight).length
  const signalingRatio = item.imagens.length > 0 ? signaledCount / item.imagens.length : 0
  const signalingSalienceScore =
    item.imagens.length === 0 ? 50 : Math.round(Math.min(100, signalingRatio * 150 + 40))
  if (item.imagens.length >= 3 && signaledCount === 0) {
    violations.push(
      'Signaling Principle: Diagram lacks visual emphasis cues highlighting the focal bottleneck or active state.',
    )
    recommendations.push(
      'Apply signaling highlights (e.g. glowing border or distinct color tone) to the central operational node.',
    )
  }

  // 5. Segmenting Principle
  const segmentingModularityScore =
    item.stageSteps && item.stageSteps.length >= 2 ? 100 : item.stageSteps.length === 1 ? 75 : 55
  if (!item.stageSteps || item.stageSteps.length < 2) {
    recommendations.push(
      'Deconstruct complex multi-stage phenomena into segmented chronological steps to facilitate learner pacing.',
    )
  }

  // Overall CTML Compliance Score
  const overallComplianceScore = Math.round(
    0.3 * spatialContiguityScore +
      0.25 * coherencePurityScore +
      0.2 * signalingSalienceScore +
      0.25 * segmentingModularityScore,
  )

  return {
    overallComplianceScore,
    spatialContiguityScore,
    coherencePurityScore,
    signalingSalienceScore,
    segmentingModularityScore,
    identifiedViolations: violations,
    evidenceBasedRecommendations: recommendations,
  }
}

// ---------------------------------------------------------------------------
// 3. Calibrated Problem Bank: Multi-Disciplinary Dual-Coding Schemata
// ---------------------------------------------------------------------------

export const CALIBRATED_DUAL_CODING_SCHEMATA: Record<string, DualCodingSchemaItem> = {
  bft_consensus_quorum: {
    id: 'bft_consensus_quorum',
    domain: 'distributed_systems',
    title: 'Byzantine Fault Tolerance & Quorum Intersection',
    coreConcept: '3f + 1 Quorum Intersection Invariant',
    summary:
      'In an asynchronous system with f Byzantine nodes, a total network of N >= 3f + 1 nodes and quorum size Q = 2f + 1 guarantees that any two quorums overlap in at least f + 1 nodes, containing at least one honest node.',
    logogens: [
      {
        id: 'log_bft_n_size',
        text: 'Total replica nodes must satisfy N >= 3f + 1 to tolerate f arbitrarily malicious failures.',
        modality: 'mathematical_formula',
        importanceWeight: 0.95,
        keyTokens: ['N >= 3f + 1', 'Byzantine', 'replica'],
      },
      {
        id: 'log_bft_quorum_size',
        text: 'A valid quorum requires Q = 2f + 1 votes to ensure non-blocking liveness while remaining safe.',
        modality: 'verbal_proposition',
        importanceWeight: 0.9,
        keyTokens: ['Q = 2f + 1', 'votes', 'liveness'],
      },
      {
        id: 'log_bft_intersection',
        text: 'Intersection of two quorums: |Q1 ∩ Q2| >= (2f + 1) + (2f + 1) - (3f + 1) = f + 1 nodes.',
        modality: 'mathematical_formula',
        importanceWeight: 1.0,
        keyTokens: ['intersection', 'f + 1', 'honest overlap'],
      },
      {
        id: 'log_bft_honest_witness',
        text: 'Because at most f nodes are Byzantine, an overlap of f + 1 guaranteed nodes must contain >= 1 honest node that refuses equivocation.',
        modality: 'mechanistic_thesis',
        importanceWeight: 0.95,
        keyTokens: ['honest node', 'equivocation', 'safety'],
      },
    ],
    imagens: [
      {
        id: 'img_quorum_a',
        label: 'Quorum Alpha (2f + 1)',
        shape: 'spatial_boundary',
        x: 25,
        y: 40,
        width: 35,
        height: 45,
        colorTone: 'cyan',
        iconSymbol: 'shield',
        signalingHighlight: false,
      },
      {
        id: 'img_quorum_b',
        label: 'Quorum Beta (2f + 1)',
        shape: 'spatial_boundary',
        x: 50,
        y: 40,
        width: 35,
        height: 45,
        colorTone: 'violet',
        iconSymbol: 'shield',
        signalingHighlight: false,
      },
      {
        id: 'img_intersection_lens',
        label: 'Overlap: f + 1 Nodes',
        shape: 'geometric_node',
        x: 55,
        y: 55,
        width: 22,
        height: 18,
        colorTone: 'emerald',
        iconSymbol: 'check-circle',
        signalingHighlight: true,
      },
      {
        id: 'img_byzantine_fault_pool',
        label: 'Byzantine Faults (max f)',
        shape: 'state_box',
        x: 80,
        y: 15,
        width: 18,
        height: 14,
        colorTone: 'rose',
        iconSymbol: 'alert-triangle',
        signalingHighlight: false,
      },
    ],
    referentialLinks: [
      {
        id: 'ref_1',
        logogenId: 'log_bft_quorum_size',
        imagenId: 'img_quorum_a',
        relation: 'illustrates',
        couplingStrength: 0.95,
        spatialSeparationDistance: 12,
        isIntegratedCaption: true,
      },
      {
        id: 'ref_2',
        logogenId: 'log_bft_intersection',
        imagenId: 'img_intersection_lens',
        relation: 'grounds',
        couplingStrength: 1.0,
        spatialSeparationDistance: 8,
        isIntegratedCaption: true,
      },
      {
        id: 'ref_3',
        logogenId: 'log_bft_honest_witness',
        imagenId: 'img_intersection_lens',
        relation: 'isomorphic_mapping',
        couplingStrength: 0.95,
        spatialSeparationDistance: 10,
        isIntegratedCaption: true,
      },
      {
        id: 'ref_4',
        logogenId: 'log_bft_n_size',
        imagenId: 'img_byzantine_fault_pool',
        relation: 'spatializes',
        couplingStrength: 0.85,
        spatialSeparationDistance: 15,
        isIntegratedCaption: true,
      },
    ],
    stageSteps: [
      '1. Client submits transaction proposal to primary leader',
      '2. Primary broadcasts Pre-Prepare message to all replicas',
      '3. Replicas broadcast Prepare and collect Quorum Alpha (2f + 1)',
      '4. Replicas broadcast Commit and verify Quorum Beta intersection contains >= 1 honest witness',
    ],
  },

  action_potential_depolarization: {
    id: 'action_potential_depolarization',
    domain: 'neuroscience',
    title: 'Hodgkin-Huxley Axonal Action Potential',
    coreConcept: 'Voltage-Gated Na+/K+ Conductance Invariant',
    summary:
      'Depolarization past threshold (-55mV) triggers regenerative opening of voltage-gated Na+ channels (inward current). Delayed rectifier K+ channels open to repolarize membrane, causing brief hyperpolarization.',
    logogens: [
      {
        id: 'log_threshold_depol',
        text: 'Membrane depolarization exceeding -55mV opens activation gates of voltage-gated Na+ channels.',
        modality: 'verbal_proposition',
        importanceWeight: 0.9,
        keyTokens: ['-55mV', 'depolarization', 'Na+ channels'],
      },
      {
        id: 'log_na_influx_peak',
        text: 'Massive Na+ influx drives membrane potential toward E_Na (+60mV), peaking at approximately +35mV.',
        modality: 'mathematical_formula',
        importanceWeight: 0.95,
        keyTokens: ['Na+ influx', '+35mV peak', 'E_Na'],
      },
      {
        id: 'log_k_efflux_repol',
        text: 'Na+ inactivation gates close while delayed rectifier K+ channels open, causing massive K+ efflux.',
        modality: 'verbal_proposition',
        importanceWeight: 0.9,
        keyTokens: ['K+ channels', 'efflux', 'repolarization'],
      },
      {
        id: 'log_refractory_undershoot',
        text: 'Slow K+ gate closure creates hyperpolarization undershoot (-75mV) enforcing absolute and relative refractory periods.',
        modality: 'mechanistic_thesis',
        importanceWeight: 0.85,
        keyTokens: ['undershoot', '-75mV', 'refractory period'],
      },
    ],
    imagens: [
      {
        id: 'img_voltage_spike_curve',
        label: 'Axonal Spike Curve (-70mV to +35mV)',
        shape: 'directional_vector',
        x: 45,
        y: 40,
        width: 40,
        height: 35,
        colorTone: 'amber',
        iconSymbol: 'activity',
        signalingHighlight: true,
      },
      {
        id: 'img_na_gate_channel',
        label: 'Voltage-Gated Na+ Channel',
        shape: 'state_box',
        x: 20,
        y: 25,
        width: 20,
        height: 18,
        colorTone: 'cyan',
        iconSymbol: 'zap',
        signalingHighlight: false,
      },
      {
        id: 'img_k_delayed_rectifier',
        label: 'Delayed Rectifier K+ Channel',
        shape: 'state_box',
        x: 75,
        y: 25,
        width: 20,
        height: 18,
        colorTone: 'emerald',
        iconSymbol: 'arrow-down-right',
        signalingHighlight: false,
      },
    ],
    referentialLinks: [
      {
        id: 'ref_hh_1',
        logogenId: 'log_threshold_depol',
        imagenId: 'img_na_gate_channel',
        relation: 'illustrates',
        couplingStrength: 0.9,
        spatialSeparationDistance: 10,
        isIntegratedCaption: true,
      },
      {
        id: 'ref_hh_2',
        logogenId: 'log_na_influx_peak',
        imagenId: 'img_voltage_spike_curve',
        relation: 'spatializes',
        couplingStrength: 0.95,
        spatialSeparationDistance: 9,
        isIntegratedCaption: true,
      },
      {
        id: 'ref_hh_3',
        logogenId: 'log_k_efflux_repol',
        imagenId: 'img_k_delayed_rectifier',
        relation: 'illustrates',
        couplingStrength: 0.9,
        spatialSeparationDistance: 12,
        isIntegratedCaption: true,
      },
    ],
    stageSteps: [
      '1. Resting Membrane Potential maintained at -70mV by Na+/K+ ATPase',
      '2. Excitatory Post-Synaptic Potentials summate to reach -55mV threshold',
      '3. Regenerative positive feedback: Na+ influx causes rapid depolarization to +35mV',
      '4. Na+ inactivation + K+ efflux repolarizes membrane to -75mV hyperpolarization',
    ],
  },
}

// ---------------------------------------------------------------------------
// 4. Interactive Dual-Coding Session State Machine
// ---------------------------------------------------------------------------

export interface DualCodingSessionState {
  currentSchemaId: string
  activeLogogenId: string | null
  activeImagenId: string | null
  activeStepIndex: number
  schemata: Record<string, DualCodingSchemaItem>
  customModifications: Record<string, Partial<DualCodingSchemaItem>>
}

export class DualCodingSession {
  private state: DualCodingSessionState

  constructor(customSchemata?: Record<string, DualCodingSchemaItem>) {
    const schemata = customSchemata ?? CALIBRATED_DUAL_CODING_SCHEMATA
    const firstId = Object.keys(schemata)[0] ?? ''

    this.state = {
      currentSchemaId: firstId,
      activeLogogenId: null,
      activeImagenId: null,
      activeStepIndex: 0,
      schemata,
      customModifications: {},
    }
  }

  public getState(): Readonly<DualCodingSessionState> {
    return { ...this.state }
  }

  public getCurrentSchema(): DualCodingSchemaItem | null {
    const base = this.state.schemata[this.state.currentSchemaId]
    if (!base) return null
    const mod = this.state.customModifications[base.id]
    return mod ? { ...base, ...mod } : base
  }

  public selectSchema(schemaId: string): void {
    if (!this.state.schemata[schemaId]) return
    this.state.currentSchemaId = schemaId
    this.state.activeLogogenId = null
    this.state.activeImagenId = null
    this.state.activeStepIndex = 0
  }

  public selectLogogen(logogenId: string | null): void {
    this.state.activeLogogenId = logogenId
    if (logogenId) {
      // Find connected imagen
      const schema = this.getCurrentSchema()
      if (schema) {
        const link = schema.referentialLinks.find((l) => l.logogenId === logogenId)
        if (link) this.state.activeImagenId = link.imagenId
      }
    }
  }

  public selectImagen(imagenId: string | null): void {
    this.state.activeImagenId = imagenId
    if (imagenId) {
      // Find connected logogen
      const schema = this.getCurrentSchema()
      if (schema) {
        const link = schema.referentialLinks.find((l) => l.imagenId === imagenId)
        if (link) this.state.activeLogogenId = link.logogenId
      }
    }
  }

  public setActiveStep(stepIndex: number): void {
    this.state.activeStepIndex = Math.max(0, stepIndex)
  }

  public addReferentialLink(link: ReferentialConnection): void {
    const schema = this.getCurrentSchema()
    if (!schema) return
    const updatedLinks = [...schema.referentialLinks, link]
    this.state.customModifications[schema.id] = {
      referentialLinks: updatedLinks,
    }
  }
}

// ---------------------------------------------------------------------------
// 5. FSRS Multimodal Flashcard Generation Bridge
// ---------------------------------------------------------------------------

export interface FSRSDualCodedCard {
  id: string
  front: string
  back: string
  tags: string[]
  suggestedInitialStability: number // Scaled by Dual-Coding retention multiplier (1.4x to 2.2x)
  suggestedInitialDifficulty: number
  metadata: {
    schemaId: string
    dualCodingIndex: number
    mayerComplianceScore: number
    retentionMultiplier: number
    domain: string
  }
}

export function exportDualCodedCards(schema: DualCodingSchemaItem): FSRSDualCodedCard[] {
  const metrics = calculateDualCodingMetrics(schema)
  const audit = auditMayerCompliance(schema)
  const initialStability = Number((3.0 * metrics.dualCodingRetentionMultiplier).toFixed(1))

  const cards: FSRSDualCodedCard[] = []

  // 1. Referential Synthesis Card
  cards.push({
    id: `card_dct_synth_${schema.id}`,
    front: `[Dual-Coding Synthesis: ${schema.domain.toUpperCase()}]\n\n**Core Concept:** ${schema.coreConcept}\n\n*Visuospatial Anchor:* How does the diagrammatic structure connect with the verbal thesis?`,
    back: `**Mechanistic Thesis:**\n${schema.summary}\n\n**Key Referential Mappings:**\n${schema.referentialLinks
      .map((l) => {
        const log = schema.logogens.find((item) => item.id === l.logogenId)?.text
        const img = schema.imagens.find((item) => item.id === l.imagenId)?.label
        return `• [${img}] ${l.relation} ➔ "${log}"`
      })
      .join(
        '\n',
      )}\n\n**Dual-Coding Multiplier:** ${metrics.dualCodingRetentionMultiplier}x | **Mayer CTML Score:** ${audit.overallComplianceScore}/100`,
    tags: ['dual-coding', 'multimodal', schema.domain, metrics.status],
    suggestedInitialStability: initialStability,
    suggestedInitialDifficulty: 5.0,
    metadata: {
      schemaId: schema.id,
      dualCodingIndex: Math.round(metrics.dualCodingBalanceRatio * 100),
      mayerComplianceScore: audit.overallComplianceScore,
      retentionMultiplier: metrics.dualCodingRetentionMultiplier,
      domain: schema.domain,
    },
  })

  // 2. Individual Logogen <-> Imagen Grounding Cards
  for (const link of schema.referentialLinks) {
    const log = schema.logogens.find((l) => l.id === link.logogenId)
    const img = schema.imagens.find((i) => i.id === link.imagenId)
    if (!log || !img) continue

    cards.push({
      id: `card_dct_ground_${schema.id}_${link.id}`,
      front: `[Dual-Coding Referential Grounding: ${schema.coreConcept}]\n\n**Diagram Component:** [${img.label}] (${img.colorTone.toUpperCase()} ${img.shape.replace('_', ' ')})\n\n*Question:* What precise mechanistic proposition does this component ground?`,
      back: `**Grounded Proposition:**\n${log.text}\n\n**Referential Relation:** ${link.relation} (Coupling: ${Math.round(link.couplingStrength * 100)}%)\n\n**Context:** ${schema.title}`,
      tags: ['dual-coding', 'referential-grounding', schema.domain],
      suggestedInitialStability: Number((2.8 * metrics.dualCodingRetentionMultiplier).toFixed(1)),
      suggestedInitialDifficulty: 5.2,
      metadata: {
        schemaId: schema.id,
        dualCodingIndex: Math.round(metrics.dualCodingBalanceRatio * 100),
        mayerComplianceScore: audit.overallComplianceScore,
        retentionMultiplier: metrics.dualCodingRetentionMultiplier,
        domain: schema.domain,
      },
    })
  }

  return cards
}
