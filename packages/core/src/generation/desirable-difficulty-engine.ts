/**
 * @file desirable-difficulty-engine.ts
 * @module @learning-hub/core/generation
 * @description Desirable Difficulties & Multi-Ladder Retrieval Generation Engine.
 *
 * Grounded in:
 * 1. Robert A. Bjork & Elizabeth L. Bjork (1992, 2011) "A New Theory of Disuse and an Overview of the Role of Retrieval Practice"
 *    - Storage Strength (SS) vs Retrieval Strength (RS).
 *    - Asymmetry principle: When Retrieval Strength is low (retrieval is effortful), successful retrieval
 *      maximizes increments to Storage Strength (ΔSS).
 *    - When Retrieval Strength is high (perceptual fluency / easy access), practice produces negligible storage gains.
 * 2. Norman J. Slamecka & Peter Graf (1978) "The Generation Effect"
 *    - 4-Rung Generation Difficulty Ladder:
 *      Rung 1: Semantic Cued Stem Completion (low friction)
 *      Rung 2: Scrambled Anagram Reconstruction (moderate friction)
 *      Rung 3: Reverse Inquiry / Socratic Inversion (high friction)
 *      Rung 4: Semantic Analogy & Cross-Domain Isomorphism (maximum friction)
 * 3. Jeffrey D. Karpicke & Henry L. Roediger III (2008) "The Critical Importance of Retrieval Practice in Long-Term Retention"
 *    - Direct testing effect vs passive study rereading.
 *    - Cognitive Effort Index (CEI) & Generative Retention Multiplier (ρ).
 */

import { z } from 'zod'
import { computeSimilarity, type GenerationTier } from './shared'

// ---------------------------------------------------------------------------
// 1. Types & Zod Schemas
// ---------------------------------------------------------------------------

export const bjorkQuadrantEnum = z.enum([
  'high_ss_high_rs', // Overlearned / Active Focus (high storage, immediate access)
  'high_ss_low_rs', // Ideal Desirable Difficulty Target (high storage, needs effortful retrieval)
  'low_ss_low_rs', // Novice / Deeply Extinct (needs basic scaffolding)
  'low_ss_high_rs', // Perceptual Fluency Illusion Trap (just read/crammed, access without storage)
])

export type BjorkQuadrant = z.infer<typeof bjorkQuadrantEnum>

export const bjorkMemoryStateSchema = z.object({
  conceptId: z.string(),
  conceptTitle: string(),
  /** Storage Strength (SS): 1 to 100. Entrenchment & inter-association in long-term memory */
  storageStrength: z.number().min(1).max(100),
  /** Retrieval Strength (RS): 0 to 1. Current momentary accessibility */
  retrievalStrength: z.number().min(0).max(1),
  lastRetrievedAt: z.string(),
  quadrant: bjorkQuadrantEnum,
  /** Projected storage strength gain if retrieved successfully right now */
  projectedStorageDelta: z.number(),
  estimatedHalfLifeHours: z.number(),
})

function string(): z.ZodString {
  return z.string()
}

export type BjorkMemoryState = z.infer<typeof bjorkMemoryStateSchema>

export interface RungDefinition {
  challengePrompt: string
  cue: string
  targetExpected: string
  referenceSolution: string
  scrambledFragments?: string[]
}

export interface GenerativeChallengeItem {
  id: string
  domain: 'distributed_systems' | 'cognitive_science' | 'algorithms' | 'quantum_physics'
  title: string
  concept: string
  canonicalDefinition: string
  rungs: Record<GenerationTier, RungDefinition>
  analogyDomain: string
  initialStorageStrength: number
  initialRetrievalStrength: number
}

export interface GenerativeEvaluationTelemetry {
  tier: GenerationTier
  tierLevel: number
  similarityScore: number
  isCorrect: boolean
  cognitiveEffortIndex: number // 0 to 100
  storageStrengthBefore: number
  storageStrengthAfter: number
  storageDelta: number
  retrievalStrengthBefore: number
  retrievalStrengthAfter: number
  retentionMultiplier: number // Scales FSRS stability (1.2x to 2.5x)
  isDesirablyDifficult: boolean // Retrieval strength was low (< 0.6) and retrieval succeeded
  feedbackMessage: string
}

// ---------------------------------------------------------------------------
// 2. Bjork Storage Strength vs Retrieval Strength Dynamics
// ---------------------------------------------------------------------------

/**
 * Classifies memory into one of Bjork's 4 quadrants based on SS and RS thresholds.
 */
export function classifyBjorkQuadrant(
  storageStrength: number,
  retrievalStrength: number,
): BjorkQuadrant {
  const isHighSS = storageStrength >= 50
  const isHighRS = retrievalStrength >= 0.5

  if (isHighSS && isHighRS) return 'high_ss_high_rs'
  if (isHighSS && !isHighRS) return 'high_ss_low_rs'
  if (!isHighSS && !isHighRS) return 'low_ss_low_rs'
  return 'low_ss_high_rs'
}

/**
 * Calculates decay half-life in hours as a function of Storage Strength.
 * Half-life grows super-linearly with storage strength:
 * Half-life = 24 * (1 + SS / 12)^1.35
 */
export function calculateStorageHalfLifeHours(storageStrength: number): number {
  const normSS = Math.max(1, Math.min(100, storageStrength))
  const halfLife = 24 * Math.pow(1 + normSS / 12, 1.35)
  return Number(halfLife.toFixed(1))
}

/**
 * Computes retrieval strength decay over elapsed hours given current storage strength:
 * RS(t) = initialRS * (0.5)^(t / halfLife)
 */
export function calculateRetrievalStrengthDecay(
  initialRS: number,
  storageStrength: number,
  elapsedHours: number,
): number {
  if (elapsedHours <= 0) return initialRS
  const halfLife = calculateStorageHalfLifeHours(storageStrength)
  const decayed = initialRS * Math.pow(0.5, elapsedHours / halfLife)
  return Number(Math.max(0, Math.min(1, decayed)).toFixed(3))
}

/**
 * Calculates increment to Storage Strength (ΔSS) upon retrieval attempt:
 * Invariant (Bjork 1992): The lower the current Retrieval Strength, the greater the Storage increment!
 * When RS ≈ 1 (fluency trap), ΔSS is minimal.
 * When RS < 0.4 (desirably difficult), ΔSS is maximal.
 * Higher generation rungs provide greater cognitive friction multipliers.
 */
export function calculateStorageStrengthDelta(params: {
  storageStrength: number
  retrievalStrength: number
  tier: GenerationTier
  isCorrect: boolean
}): number {
  const { storageStrength, retrievalStrength, tier, isCorrect } = params

  const tierMultipliers: Record<GenerationTier, number> = {
    stem_completion: 1.25,
    semantic_anagram: 1.6,
    reverse_query: 2.0,
    analogy_synthesis: 2.5,
  }

  const tierMultiplier = tierMultipliers[tier]
  // Remaining headroom: storage strength has diminishing returns approaching 100
  const headroom = (100 - storageStrength) / 100

  if (isCorrect) {
    // Inverse retrieval strength weighting: (1.05 - RS)
    const difficultyFactor = Math.max(0.1, 1.05 - retrievalStrength)
    const delta = 12 * tierMultiplier * difficultyFactor * headroom
    return Number(Math.max(0.5, delta).toFixed(2))
  } else {
    // Failed retrieval attempt still activates memory traces and primes subsequent correction
    const delta = 3.5 * tierMultiplier * headroom
    return Number(Math.max(0.2, delta).toFixed(2))
  }
}

/**
 * Computes Cognitive Effort Index (CEI: 0 to 100) based on tier friction, latency, and similarity.
 */
export function calculateCognitiveEffortIndex(params: {
  tier: GenerationTier
  latencyMs: number
  similarityScore: number
}): number {
  const { tier, latencyMs, similarityScore } = params

  const tierBaseEffort: Record<GenerationTier, number> = {
    stem_completion: 25,
    semantic_anagram: 45,
    reverse_query: 70,
    analogy_synthesis: 90,
  }

  const base = tierBaseEffort[tier]
  // Latency component: optimal deliberate effort is ~2000-8000ms
  const latencyEffort = Math.min(20, (latencyMs / 1000) * 2.5)
  // Accuracy component: close answers reflect effortful search
  const accuracyEffort = similarityScore >= 0.7 ? 10 : 0

  const total = Math.min(100, Math.round(base + latencyEffort + accuracyEffort))
  return total
}

// ---------------------------------------------------------------------------
// 3. Calibrated Multi-Ladder Problem Bank
// ---------------------------------------------------------------------------

export const CALIBRATED_GENERATION_CHALLENGES: Record<string, GenerativeChallengeItem> = {
  raft_consensus_invariants: {
    id: 'raft_consensus_invariants',
    domain: 'distributed_systems',
    title: 'Raft State Machine & Leader Completeness',
    concept: 'Leader Completeness Invariant',
    canonicalDefinition:
      'If a log entry is committed in a given term, then that entry will be present in the logs of the leaders for all higher-numbered terms.',
    analogyDomain: 'Political Election & Archival History',
    initialStorageStrength: 65,
    initialRetrievalStrength: 0.35, // High SS / Low RS: Ideal desirable difficulty target!
    rungs: {
      stem_completion: {
        challengePrompt:
          'Reconstruct the masked vowels and phonemes in the Raft safety property below:',
        cue: 'First and last letters are preserved as retrieval cues.',
        targetExpected:
          'If a log entry is committed in a given term, then that entry will be present in the logs of the leaders for all higher-numbered terms.',
        referenceSolution:
          'If a log entry is committed in a given term, then that entry will be present in the logs of the leaders for all higher-numbered terms.',
      },
      semantic_anagram: {
        challengePrompt:
          'Unscramble the syntactic fragments into the exact statement of Leader Completeness:',
        cue: 'Arrange by precondition (committed entry in term T) -> consequence (present in leaders T+1..N).',
        targetExpected: 'committed log entry in given term present in logs of all future leaders',
        referenceSolution:
          'committed log entry in given term present in logs of all future leaders',
        scrambledFragments: [
          'in logs of all future leaders',
          'in a given term',
          'if a log entry is committed',
          'then that entry will be present',
        ],
      },
      reverse_query: {
        challengePrompt:
          'Formulate the exact question or failure scenario that necessitated the Leader Completeness property:',
        cue: 'Focus on what catastrophic inconsistency would occur if an elected leader lacked committed past entries.',
        targetExpected:
          'What invariant prevents an elected Raft leader from overwriting or discarding state machine commands already acknowledged as committed to clients?',
        referenceSolution:
          'What invariant prevents an elected Raft leader from overwriting or discarding state machine commands already acknowledged as committed to clients?',
      },
      analogy_synthesis: {
        challengePrompt:
          'Synthesize an everyday social or physical analogy for Raft Leader Completeness, and specify where the analogy breaks:',
        cue: 'Think of presidential transitions, constitutional amendments, or legal precedent.',
        targetExpected:
          'A newly elected president cannot unilaterally erase ratified laws without constitutional majority consensus.',
        referenceSolution:
          'Like a supreme court justice who must recognize all past ratified precedents; an elected leader cannot claim authority without proving possession of all previously committed statutes.',
      },
    },
  },

  brian_koriat_fluency: {
    id: 'brian_koriat_fluency',
    domain: 'cognitive_science',
    title: 'Koriat & Bjork Illusions of Competence',
    concept: 'Perceptual Fluency Illusion',
    canonicalDefinition:
      'Learners mistakenly interpret the subjective ease of processing text during study as evidence of high future retrieval accessibility.',
    analogyDomain: 'GPS Navigation vs Autonomous Route Recall',
    initialStorageStrength: 30,
    initialRetrievalStrength: 0.85, // Low SS / High RS: The classic Fluency Illusion Trap!
    rungs: {
      stem_completion: {
        challengePrompt: 'Fill in the stem-masked definition of the fluency illusion:',
        cue: 'Anchored by phonemic initials and finals.',
        targetExpected:
          'Learners mistakenly interpret the subjective ease of processing text during study as evidence of high future retrieval accessibility.',
        referenceSolution:
          'Learners mistakenly interpret the subjective ease of processing text during study as evidence of high future retrieval accessibility.',
      },
      semantic_anagram: {
        challengePrompt:
          'Reorder the scrambled cognitive terms into the causal mechanism of the illusion of competence:',
        cue: 'Processing ease during study is mistaken for long-term storage.',
        targetExpected:
          'subjective processing ease during reading mistaken for durable recall memory',
        referenceSolution:
          'subjective processing ease during reading mistaken for durable recall memory',
        scrambledFragments: [
          'mistaken for durable recall',
          'subjective processing ease',
          'during passive reading',
          'in future test contexts',
        ],
      },
      reverse_query: {
        challengePrompt:
          'What experimental question led Koriat and Bjork (2005) to discover the illusion of competence?',
        cue: 'Invert the finding into the experimental manipulation comparing study judgments vs test recall.',
        targetExpected:
          'Why do learners systematically predict near-perfect future recall when answers are visible during study, but fail during unassisted retrieval?',
        referenceSolution:
          'Why do learners systematically predict near-perfect future recall when answers are visible during study, but fail during unassisted retrieval?',
      },
      analogy_synthesis: {
        challengePrompt:
          'Create a real-world technological or physical metaphor for perceptual fluency illusion:',
        cue: 'Think of watching an expert athlete or musician vs performing it yourself.',
        targetExpected:
          'Watching a virtuoso violinist and feeling that playing Paganini looks easy, until you pick up the bow yourself.',
        referenceSolution:
          'Driving with turn-by-turn GPS: you feel confident navigating because every turn is signaled in real-time, but without the GPS you have no mental map of the city.',
      },
    },
  },

  transformer_self_attention: {
    id: 'transformer_self_attention',
    domain: 'algorithms',
    title: 'Transformer Scaled Dot-Product Attention',
    concept: 'Scaled Dot-Product Matrix Formulation',
    canonicalDefinition:
      'Attention(Q, K, V) = softmax((Q K^T) / sqrt(d_k)) V, scaling by the square root of key dimension to prevent gradient vanishing under large dot products.',
    analogyDomain: 'Database Hash Join & Weighted Voting',
    initialStorageStrength: 75,
    initialRetrievalStrength: 0.25, // High SS / Low RS: Prime desirable difficulty candidate
    rungs: {
      stem_completion: {
        challengePrompt:
          'Complete the mathematical formulation and mechanistic explanation for scaling factor sqrt(d_k):',
        cue: 'Softmax temperature normalization over dot-product variance.',
        targetExpected: 'Attention(Q, K, V) = softmax((Q K^T) / sqrt(d_k)) V',
        referenceSolution: 'Attention(Q, K, V) = softmax((Q K^T) / sqrt(d_k)) V',
      },
      semantic_anagram: {
        challengePrompt:
          'Assemble the mathematical components of attention into their algebraic execution order:',
        cue: 'Queries multiply transposed Keys, scale by sqrt(d_k), normalize with softmax, weight Values.',
        targetExpected:
          'Queries times Key transpose divided by square root dimension normalized by softmax times Values',
        referenceSolution:
          'Queries times Key transpose divided by square root dimension normalized by softmax times Values',
        scrambledFragments: [
          'normalized by softmax',
          'Queries times Key transpose',
          'multiplied by Values matrix',
          'divided by square root key dimension',
        ],
      },
      reverse_query: {
        challengePrompt:
          'What mathematical instability occurs if the scaling denominator sqrt(d_k) is omitted in large transformer heads?',
        cue: 'Think of variance of sum of independent products and softmax saturation.',
        targetExpected:
          'Why does omitting the square root scaling factor cause dot products to grow large in magnitude, pushing softmax into regions with vanishingly small gradients?',
        referenceSolution:
          'Why does omitting the square root scaling factor cause dot products to grow large in magnitude, pushing softmax into regions with vanishingly small gradients?',
      },
      analogy_synthesis: {
        challengePrompt:
          'Formulate a concrete real-world analogy for Query, Key, and Value interactions:',
        cue: 'Think of a search engine, library card catalog, or patent database.',
        targetExpected:
          'A search engine query matched against video title keywords (Keys) to retrieve the video contents (Values).',
        referenceSolution:
          'A library search: Query is your research topic, Keys are the catalog index cards, and Values are the actual books on the shelves weighted by catalog match relevance.',
      },
    },
  },
}

// ---------------------------------------------------------------------------
// 4. Interactive Desirable Difficulty Session State Machine
// ---------------------------------------------------------------------------

export interface DesirableDifficultySessionState {
  currentChallengeId: string
  currentTier: GenerationTier
  userAttempt: string
  isEvaluated: boolean
  lastTelemetry: GenerativeEvaluationTelemetry | null
  challengeIds: string[]
  memoryStates: Record<string, BjorkMemoryState>
  history: GenerativeEvaluationTelemetry[]
}

export class DesirableDifficultySession {
  private state: DesirableDifficultySessionState
  private challenges: Record<string, GenerativeChallengeItem>

  constructor(customChallenges?: Record<string, GenerativeChallengeItem>) {
    this.challenges = customChallenges ?? CALIBRATED_GENERATION_CHALLENGES
    const challengeIds = Object.keys(this.challenges)
    const firstId = challengeIds[0] ?? ''

    const initialStates: Record<string, BjorkMemoryState> = {}
    for (const [id, item] of Object.entries(this.challenges)) {
      const quadrant = classifyBjorkQuadrant(
        item.initialStorageStrength,
        item.initialRetrievalStrength,
      )
      const halfLife = calculateStorageHalfLifeHours(item.initialStorageStrength)
      const projectedDelta = calculateStorageStrengthDelta({
        storageStrength: item.initialStorageStrength,
        retrievalStrength: item.initialRetrievalStrength,
        tier: 'stem_completion',
        isCorrect: true,
      })

      initialStates[id] = {
        conceptId: id,
        conceptTitle: item.title,
        storageStrength: item.initialStorageStrength,
        retrievalStrength: item.initialRetrievalStrength,
        lastRetrievedAt: new Date().toISOString(),
        quadrant,
        projectedStorageDelta: projectedDelta,
        estimatedHalfLifeHours: halfLife,
      }
    }

    this.state = {
      currentChallengeId: firstId,
      currentTier: 'stem_completion',
      userAttempt: '',
      isEvaluated: false,
      lastTelemetry: null,
      challengeIds,
      memoryStates: initialStates,
      history: [],
    }
  }

  public getState(): Readonly<DesirableDifficultySessionState> {
    return { ...this.state }
  }

  public getCurrentChallenge(): GenerativeChallengeItem | null {
    return this.challenges[this.state.currentChallengeId] ?? null
  }

  public setTier(tier: GenerationTier): void {
    this.state.currentTier = tier
    this.state.userAttempt = ''
    this.state.isEvaluated = false
    this.state.lastTelemetry = null
  }

  public selectChallenge(challengeId: string): void {
    if (!this.challenges[challengeId]) return
    this.state.currentChallengeId = challengeId
    this.state.currentTier = 'stem_completion'
    this.state.userAttempt = ''
    this.state.isEvaluated = false
    this.state.lastTelemetry = null
  }

  public setUserAttempt(attempt: string): void {
    this.state.userAttempt = attempt
  }

  public evaluateAttempt(latencyMs = 3000): GenerativeEvaluationTelemetry {
    const challenge = this.getCurrentChallenge()
    if (!challenge) {
      throw new Error('No active challenge selected')
    }

    const currentRung = challenge.rungs[this.state.currentTier]
    const memory = this.state.memoryStates[challenge.id]!
    const similarity = computeSimilarity(this.state.userAttempt, currentRung.targetExpected)
    const isCorrect = similarity >= 0.75

    const effort = calculateCognitiveEffortIndex({
      tier: this.state.currentTier,
      latencyMs,
      similarityScore: similarity,
    })

    const delta = calculateStorageStrengthDelta({
      storageStrength: memory.storageStrength,
      retrievalStrength: memory.retrievalStrength,
      tier: this.state.currentTier,
      isCorrect,
    })

    const newSS = Math.min(100, memory.storageStrength + delta)
    // Successful retrieval restores RS to near 1.0; failed attempt bumps it moderately
    const newRS = isCorrect
      ? Math.min(1, Math.max(0.9, memory.retrievalStrength + 0.5))
      : Math.min(1, memory.retrievalStrength + 0.2)

    // Retention multiplier scaling FSRS stability based on Bjork desirable difficulty
    const isDesirablyDifficult = memory.retrievalStrength < 0.6 && isCorrect
    const tierRetentionBoost: Record<GenerationTier, number> = {
      stem_completion: 1.25,
      semantic_anagram: 1.5,
      reverse_query: 1.85,
      analogy_synthesis: 2.3,
    }
    const baseMultiplier = tierRetentionBoost[this.state.currentTier]
    const retentionMultiplier = Number(
      (baseMultiplier * (isDesirablyDifficult ? 1.2 : 1.0)).toFixed(2),
    )

    const tierLevels: Record<GenerationTier, number> = {
      stem_completion: 1,
      semantic_anagram: 2,
      reverse_query: 3,
      analogy_synthesis: 4,
    }

    let feedbackMessage = ''
    if (isCorrect) {
      feedbackMessage = isDesirablyDifficult
        ? `Desirable Difficulty Mastered! Retrieval under low accessibility yielded maximum Storage increment (ΔSS = +${delta}).`
        : `Accurate Generation! Storage Strength increased by +${delta}.`
    } else {
      feedbackMessage = `Partial retrieval attempt (Similarity: ${Math.round(similarity * 100)}%). Reviewing the solution primes future generative recall.`
    }

    const telemetry: GenerativeEvaluationTelemetry = {
      tier: this.state.currentTier,
      tierLevel: tierLevels[this.state.currentTier],
      similarityScore: similarity,
      isCorrect,
      cognitiveEffortIndex: effort,
      storageStrengthBefore: memory.storageStrength,
      storageStrengthAfter: Number(newSS.toFixed(1)),
      storageDelta: delta,
      retrievalStrengthBefore: memory.retrievalStrength,
      retrievalStrengthAfter: Number(newRS.toFixed(2)),
      retentionMultiplier,
      isDesirablyDifficult,
      feedbackMessage,
    }

    // Update memory state
    const updatedQuadrant = classifyBjorkQuadrant(newSS, newRS)
    const updatedHalfLife = calculateStorageHalfLifeHours(newSS)
    const updatedProjectedDelta = calculateStorageStrengthDelta({
      storageStrength: newSS,
      retrievalStrength: newRS,
      tier: this.state.currentTier,
      isCorrect: true,
    })

    this.state.memoryStates[challenge.id] = {
      conceptId: challenge.id,
      conceptTitle: challenge.title,
      storageStrength: Number(newSS.toFixed(1)),
      retrievalStrength: Number(newRS.toFixed(2)),
      lastRetrievedAt: new Date().toISOString(),
      quadrant: updatedQuadrant,
      projectedStorageDelta: updatedProjectedDelta,
      estimatedHalfLifeHours: updatedHalfLife,
    }

    this.state.lastTelemetry = telemetry
    this.state.isEvaluated = true
    this.state.history.push(telemetry)

    return telemetry
  }
}

// ---------------------------------------------------------------------------
// 5. FSRS Flashcard Generation Bridge
// ---------------------------------------------------------------------------

export interface FSRSGenerativeCard {
  id: string
  front: string
  back: string
  tags: string[]
  suggestedInitialStability: number // Scaled by retention multiplier (Bjork & Bjork 2011)
  suggestedInitialDifficulty: number
  metadata: {
    challengeId: string
    tier: GenerationTier
    cognitiveEffortIndex: number
    retentionMultiplier: number
    quadrant: BjorkQuadrant
  }
}

export function exportGenerativeChallengesToFSRSCards(
  session: DesirableDifficultySession,
): FSRSGenerativeCard[] {
  const cards: FSRSGenerativeCard[] = []
  const state = session.getState()

  for (const telemetry of state.history) {
    const challenge = CALIBRATED_GENERATION_CHALLENGES[state.currentChallengeId]
    if (!challenge) continue
    const memory = state.memoryStates[challenge.id]!
    const rung = challenge.rungs[telemetry.tier]

    // Initial stability scaled by retention multiplier: base 2.5d * multiplier
    const initialStability = Number((2.5 * telemetry.retentionMultiplier).toFixed(1))

    cards.push({
      id: `card_gen_${challenge.id}_${telemetry.tier}_${Date.now()}`,
      front: `[Generative Ladder — Tier ${telemetry.tierLevel}: ${telemetry.tier.replace('_', ' ').toUpperCase()}]\n\n**Concept:** ${challenge.concept}\n\n*Challenge:* ${rung.challengePrompt}\n\n*Prompt Cue:* ${rung.cue}`,
      back: `**Expected Synthesis:**\n${rung.referenceSolution}\n\n**Canonical Mechanism:**\n${challenge.canonicalDefinition}\n\n**Cognitive Effort Index:** ${telemetry.cognitiveEffortIndex}/100 | **Retention Multiplier:** ${telemetry.retentionMultiplier}x`,
      tags: [
        'generation-effect',
        'desirable-difficulty',
        challenge.domain,
        telemetry.tier,
        memory.quadrant,
      ],
      suggestedInitialStability: initialStability,
      suggestedInitialDifficulty: 5.5,
      metadata: {
        challengeId: challenge.id,
        tier: telemetry.tier,
        cognitiveEffortIndex: telemetry.cognitiveEffortIndex,
        retentionMultiplier: telemetry.retentionMultiplier,
        quadrant: memory.quadrant,
      },
    })
  }

  return cards
}
