/**
 * @file types.ts
 * @description Knowledge Space Theory (KST) & Adaptive Prerequisite Graph Studio Types & Zod Schemas
 *
 * Grounded in the mathematical foundation of Knowledge Space Theory:
 * 1. Jean-Paul Doignon & Jean-Claude Falmagne (1985) - "Spaces for the Assessment of Knowledge",
 *    International Journal of Man-Machine Studies, 23(2), 175-196.
 * 2. Jean-Claude Falmagne & Jean-Paul Doignon (1988) - "A Class of Markov Chains for Adaptive Assessment",
 *    Journal of Mathematical Psychology, 32(3), 232-254.
 * 3. Jean-Paul Doignon & Jean-Claude Falmagne (1999) - "Knowledge Spaces", Springer-Verlag.
 * 4. Jean-Claude Falmagne & Jean-Paul Doignon (2011) - "Learning Spaces: Interdisciplinary Applied Mathematics", Springer.
 * 5. Dietrich Albert & Josef Lukas (1999) - "Knowledge Spaces: Theories, Empirical Research, Applications", LEA.
 * 6. Garrett Birkhoff (1937) - Representation theorem establishing the bijection between finite
 *    quasi-orders (surmise relations) and finite distributive lattices (quasi-ordinal knowledge spaces).
 *
 * @module @learning-hub/core/knowledge-space
 */

import { z } from 'zod'

// ============================================================================
// 1. ATOMIC KST ITEM & PREREQUISITE SCHEMAS
// ============================================================================

export const KSTItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  domain: z.string().min(1),
  difficulty: z.number().min(0).max(1).default(0.5),
  estimatedTimeMinutes: z.number().int().positive().default(5),
  slipProbability: z.number().min(0.01).max(0.49).default(0.1),
  guessProbability: z.number().min(0.01).max(0.49).default(0.15),
  tags: z.array(z.string()).default([]),
  skillsRequired: z.array(z.string()).default([]),
  prompt: z.string().min(1),
  solution: z.string().min(1),
  options: z.array(z.string()).optional(),
  correctOptionIndex: z.number().int().min(0).optional(),
})
export type KSTItem = z.infer<typeof KSTItemSchema>

/**
 * Elementary Surmise / Prerequisite Relation.
 * p <= q denotes that knowledge of item q surmises knowledge of item p.
 * That is, mastery of q requires prior mastery of prerequisite p.
 */
export const SurmiseRelationSchema = z.object({
  prerequisiteId: z.string().min(1),
  targetId: z.string().min(1),
  confidence: z.number().min(0).max(1).default(1.0),
  rationale: z.string().default('Direct prerequisite dependency'),
})
export type SurmiseRelation = z.infer<typeof SurmiseRelationSchema>

/**
 * Surmise Clause representing AND/OR prerequisite structures.
 * A target item q may be mastered via multiple alternative learning pathways (clauses).
 * For example: [[p1, p2], [p3]] means mastering (p1 AND p2) OR mastering (p3) allows learning q.
 */
export const SurmiseClauseSchema = z.object({
  targetId: z.string().min(1),
  clauses: z.array(z.array(z.string().min(1))).min(1),
})
export type SurmiseClause = z.infer<typeof SurmiseClauseSchema>

export const SurmiseSystemSchema = z.object({
  items: z.array(KSTItemSchema),
  clauses: z.array(SurmiseClauseSchema),
})
export type SurmiseSystem = z.infer<typeof SurmiseSystemSchema>

// ============================================================================
// 2. KNOWLEDGE STATES & STRUCTURE SCHEMAS
// ============================================================================

export const KnowledgeStateSchema = z.object({
  stateId: z.string().min(1),
  itemIds: z.array(z.string()),
  level: z.number().int().min(0),
})
export type KnowledgeState = z.infer<typeof KnowledgeStateSchema>

export const KnowledgeStructureSchema = z.object({
  domainId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  domainItems: z.array(KSTItemSchema),
  states: z.array(KnowledgeStateSchema),
  isKnowledgeSpace: z.boolean(),
  isQuasiOrdinal: z.boolean(),
  isWellGraded: z.boolean(),
  learningPathsCount: z.number().int().min(0),
})
export type KnowledgeStructure = z.infer<typeof KnowledgeStructureSchema>

/**
 * Inner and Outer Fringes (Doignon & Falmagne 1999).
 * - Inner fringe K⁻: Mastered items whose individual removal leaves a valid knowledge state.
 *   Represents the most advanced frontier of the learner's current knowledge.
 * - Outer fringe K⁺: Unmastered items whose individual addition produces a valid knowledge state.
 *   Represents the learner's immediate Zone of Proximal Development (ZPD in KST).
 */
export const FringesSchema = z.object({
  stateId: z.string().min(1),
  innerFringe: z.array(z.string()),
  outerFringe: z.array(z.string()),
})
export type Fringes = z.infer<typeof FringesSchema>

export const KSTLearningPathStepSchema = z.object({
  step: z.number().int().min(0),
  addedItemId: z.string(),
  stateId: z.string(),
  stateSize: z.number().int().min(0),
})
export type KSTLearningPathStep = z.infer<typeof KSTLearningPathStepSchema>

export const KSTLearningPathSchema = z.object({
  id: z.string().min(1),
  steps: z.array(KSTLearningPathStepSchema),
})
export type KSTLearningPath = z.infer<typeof KSTLearningPathSchema>

// ============================================================================
// 3. ADAPTIVE MARKOVIAN ASSESSMENT SCHEMAS
// ============================================================================

export const AssessmentResponseStepSchema = z.object({
  step: z.number().int().min(1),
  itemId: z.string().min(1),
  isCorrect: z.boolean(),
  responseTimeMs: z.number().int().nonnegative().default(0),
  priorEntropy: z.number(),
  posteriorEntropy: z.number(),
  entropyDelta: z.number(),
  suggestedNextItem: z.string().nullable().optional(),
})
export type AssessmentResponseStep = z.infer<typeof AssessmentResponseStepSchema>

export const AdaptiveAssessmentSessionSchema = z.object({
  sessionId: z.string().min(1),
  domainId: z.string().min(1),
  step: z.number().int().min(0),
  history: z.array(AssessmentResponseStepSchema),
  stateProbabilities: z.record(z.string(), z.number()),
  itemMasteryProbabilities: z.record(z.string(), z.number()),
  currentEntropy: z.number(),
  mostLikelyStateId: z.string(),
  confidence: z.number(),
  nextSuggestedItemId: z.string().nullable(),
  isTerminated: z.boolean(),
  terminationReason: z.enum([
    'in_progress',
    'entropy_threshold',
    'confidence_threshold',
    'max_steps',
    'manual',
  ]),
})
export type AdaptiveAssessmentSession = z.infer<typeof AdaptiveAssessmentSessionSchema>

export const LearnerDiagnosisSchema = z.object({
  diagnosedState: KnowledgeStateSchema,
  confidence: z.number(),
  entropy: z.number(),
  innerFringe: z.array(z.string()),
  outerFringe: z.array(z.string()),
  masteredItems: z.array(KSTItemSchema),
  readyToLearnItems: z.array(KSTItemSchema),
  prerequisiteGaps: z.array(
    z.object({
      itemId: z.string(),
      missingPrerequisites: z.array(z.string()),
    }),
  ),
})
export type LearnerDiagnosis = z.infer<typeof LearnerDiagnosisSchema>

// ============================================================================
// 4. FSRS-6 CALIBRATED DECK GENERATION SCHEMAS
// ============================================================================

export const KSTCardTypeEnum = z.enum([
  'inner_fringe_retention',
  'outer_fringe_acquisition',
  'surmise_invariant',
  'slip_misconception',
])
export type KSTCardType = z.infer<typeof KSTCardTypeEnum>

export const KSTCardGenerationConfigSchema = z.object({
  targetStateId: z.string().nullable().optional(),
  includeInnerFringe: z.boolean().default(true),
  includeOuterFringe: z.boolean().default(true),
  includePrerequisiteInvariants: z.boolean().default(true),
  includeSlipDiagnostic: z.boolean().default(true),
  maxCards: z.number().int().positive().default(20),
})
export type KSTCardGenerationConfig = z.infer<typeof KSTCardGenerationConfigSchema>

export const KSTCalibratedCardSchema = z.object({
  id: z.string().min(1),
  front: z.string().min(1),
  back: z.string().min(1),
  cardType: KSTCardTypeEnum,
  targetItemId: z.string(),
  prerequisiteItemIds: z.array(z.string()).default([]),
  stability: z.number().positive(),
  difficulty: z.number().min(1).max(10),
  fsrsParameters: z.object({
    stability: z.number().positive(),
    difficulty: z.number().min(1).max(10),
  }),
  tags: z.array(z.string()).default([]),
})
export type KSTCalibratedCard = z.infer<typeof KSTCalibratedCardSchema>
