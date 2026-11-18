/**
 * Learning HUB — Real-Time Cognitive Load & Flow State Balancer.
 *
 * Implements:
 * 1. Cognitive Load Index (CLI) scoring using response latency, hesitation jitter,
 *    and edit churn (Sweller 1988, Yerkes-Dodson 1908).
 * 2. Flow channel classification (underload / optimal flow / overload) with dynamic interventions.
 * 3. Semantic Distance Interleaving using cosine similarity (Rohrer 2020; Kang & Pashler 2012).
 * 4. Socratic Hypercorrection contrast drills (Butterfield & Metcalfe 2001).
 */
import { z } from 'zod'
import { cosineSimilarity } from '../embeddings'

export type FlowZone = 'underload' | 'optimal_flow' | 'overload'
export type LoadIntervention = 'none' | 'scaffold_hint' | 'worked_example' | 'format_stepdown'

export interface CognitiveLoadTelemetry {
  cardId: number
  responseLatencyMs: number
  baselineLatencyMs?: number // Default ~4000ms if not provided
  keystrokeTimestamps?: number[] // Array of millisecond timestamps of keypresses
  backspaceCount?: number
  recentErrorCount?: number // Number of failures in last 5 cards
}

export interface CognitiveLoadResult {
  cli: number // Scaled 0.0 to 1.0
  flowZone: FlowZone
  intervention: LoadIntervention
  reason: string
}

/**
 * Computes keystroke jitter (standard deviation of inter-keystroke intervals in ms).
 * High jitter indicates cognitive hesitation and retrieval searching.
 */
export function computeKeystrokeJitter(timestamps: number[]): number {
  if (!timestamps || timestamps.length < 3) return 0
  const intervals: number[] = []
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1])
  }
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
  const variance =
    intervals.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / intervals.length
  return Math.sqrt(variance)
}

/**
 * Evaluates real-time telemetry to compute the Cognitive Load Index (CLI).
 */
export function evaluateCognitiveLoad(telemetry: CognitiveLoadTelemetry): CognitiveLoadResult {
  // A zero/negative/non-finite baseline would make the ratio Infinity or NaN and
  // poison the whole index — fall back to the 4 s population default instead.
  const rawBaseline = telemetry.baselineLatencyMs
  const baseline =
    rawBaseline !== undefined && Number.isFinite(rawBaseline) && rawBaseline > 0
      ? rawBaseline
      : 4000
  const latency = Number.isFinite(telemetry.responseLatencyMs)
    ? Math.max(0, telemetry.responseLatencyMs)
    : 0
  const latencyRatio = latency / baseline
  const jitter = telemetry.keystrokeTimestamps
    ? computeKeystrokeJitter(telemetry.keystrokeTimestamps)
    : 0
  const backspaces = telemetry.backspaceCount ?? 0
  const recentErrors = telemetry.recentErrorCount ?? 0

  // 1. Latency component (0.0 - 0.40)
  const latencyComponent = Math.min(0.4, (latencyRatio / 3.0) * 0.4)

  // 2. Hesitation jitter component (0.0 - 0.25)
  // Jitter over 600ms signals significant uncertainty
  const jitterComponent = Math.min(0.25, (jitter / 600) * 0.25)

  // 3. Edit churn component (0.0 - 0.20)
  const churnComponent = Math.min(0.2, (backspaces / 5) * 0.2)

  // 4. Recent error burst component (0.0 - 0.15)
  const errorComponent = Math.min(0.15, (recentErrors / 3) * 0.15)

  const rawCli = latencyComponent + jitterComponent + churnComponent + errorComponent
  const cli = Math.round(Math.min(1.0, Math.max(0.0, rawCli)) * 100) / 100

  // Flow classification
  if (cli > 0.75 || recentErrors >= 3) {
    // Cognitive Overload: Needs scaffolding or worked example fade
    const intervention: LoadIntervention =
      recentErrors >= 3 ? 'worked_example' : backspaces > 3 ? 'format_stepdown' : 'scaffold_hint'
    return {
      cli,
      flowZone: 'overload',
      intervention,
      reason:
        recentErrors >= 3
          ? 'Error burst detected: stepping down to worked example to prevent frustration.'
          : 'Elevated cognitive friction: providing scaffold hint.',
    }
  }

  if (cli < 0.25 && latencyRatio < 0.6) {
    // Underload: effortless retrieval, user in flow or under-challenged
    return {
      cli,
      flowZone: 'underload',
      intervention: 'none',
      reason: 'Effortless retrieval: optimal for spacing acceleration or synthesis challenge.',
    }
  }

  return {
    cli,
    flowZone: 'optimal_flow',
    intervention: 'none',
    reason: 'Zone of proximal development maintained. Challenge matches retrieval capacity.',
  }
}

// ─── Semantic Embedding Distance Interleaving ───────────────────────────────

export interface EmbeddableCard {
  id: number
  embedding?: number[]
}

/**
 * Interleaves a queue of cards using semantic embedding distance: greedily picks,
 * after each card, the remaining card LEAST similar to it (cosine), so near-duplicate
 * concepts are never reviewed back-to-back (blocked practice). The first card stays
 * first; a card without an embedding is taken in queue order. O(n²) — fine for a
 * review session, not for a whole collection.
 */
export function interleaveBySemanticDistance<T extends EmbeddableCard>(cards: T[]): T[] {
  if (cards.length <= 2) return [...cards]

  const pool = [...cards]
  const result: T[] = [pool.shift()!]

  while (pool.length > 0) {
    const last = result[result.length - 1]
    if (!last.embedding) {
      result.push(pool.shift()!)
      continue
    }

    // Next card = the least similar remaining one to the card just placed.
    let bestIndex = 0
    let minConsecutiveSimilarity = Infinity

    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[i]
      if (!candidate.embedding) {
        bestIndex = i
        break
      }
      const sim = cosineSimilarity(last.embedding, candidate.embedding)
      if (sim < minConsecutiveSimilarity) {
        minConsecutiveSimilarity = sim
        bestIndex = i
      }
    }

    result.push(pool.splice(bestIndex, 1)[0])
  }

  return result
}

// ─── Socratic Hypercorrection ───────────────────────────────────────────────

export const hypercorrectionTriggerSchema = z.object({
  cardId: z.number().int().positive(),
  confidence: z.number().int().min(1).max(5), // 1=guess, 5=certain
  grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  userGivenAnswer: z.string().optional(),
  correctAnswer: z.string(),
})
export type HypercorrectionTrigger = z.infer<typeof hypercorrectionTriggerSchema>

export interface HypercorrectionDrill {
  isEligible: boolean
  prompt?: string
  contrastNote?: string
}

/**
 * Detects hypercorrection conditions (high confidence mistake) and generates
 * contrastive self-explanation prompts (Butterfield & Metcalfe 2001).
 */
export function checkHypercorrection(trigger: HypercorrectionTrigger): HypercorrectionDrill {
  // Hypercorrection triggers when user was confident (4 or 5) but failed (grade = 1)
  if (trigger.confidence >= 4 && trigger.grade === 1) {
    const userAns = trigger.userGivenAnswer
      ? `"${trigger.userGivenAnswer}"`
      : 'your expected answer'
    return {
      isEligible: true,
      prompt: `You were confident in ${userAns}, but the verified answer is "${trigger.correctAnswer}". What specific cue led you to that conclusion?`,
      contrastNote: `Notice the distinction between what you retrieved and the target. High-confidence errors updated immediately yield the most durable memory gains.`,
    }
  }

  return { isEligible: false }
}

export * from './intrinsic-load-engine'
