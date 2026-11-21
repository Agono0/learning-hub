/**
 * Math learning utilities — shared numeric primitives (`clamp`, `hashString`),
 * theorem → card decomposition and problem-set interleaving. Pure module —
 * safe for client bundles, imports nothing app-specific (bottom of the graph,
 * so any core module may import from it without creating a cycle).
 */
import type { CardContent, CardFormat } from './types'

/** One definition (term + meaning) feeding theoremToCards. */
export interface DefinitionInput {
  term: string
  meaning: string
}

/** One lemma (name + statement) feeding theoremToCards. */
export interface LemmaInput {
  name: string
  statement: string
}

/** Full theorem package: statement, supporting definitions/lemmas, proof steps. */
export interface TheoremInput {
  theorem: { name: string; statement: string }
  definitions?: DefinitionInput[]
  lemmas?: LemmaInput[]
  proofSteps?: string[]
}

/** A ready-to-insert card spec (route handlers add deckId/noteId/source). */
export interface CardSpec {
  type: CardFormat
  content: CardContent
  tags: string[]
}

/**
 * Decompose a theorem package into cards (Wozniak: build understanding from
 * the basics):
 *  - definitions → basic cards tagged `definition`
 *  - the theorem statement → basic card tagged `theorem`
 *  - lemmas → basic cards tagged `lemma`
 *  - proof steps → proof_step cards ("which lemma justifies step k?"),
 *    justified by the lemma at the same position, else the previous step,
 *    else the hypothesis for step 1.
 */
export function theoremToCards(input: TheoremInput): CardSpec[] {
  const specs: CardSpec[] = []
  const { theorem } = input

  for (const def of input.definitions ?? []) {
    specs.push({
      type: 'basic',
      content: { basic: { front: def.term, back: def.meaning } },
      tags: ['definition'],
    })
  }

  specs.push({
    type: 'basic',
    content: { basic: { front: theorem.name, back: theorem.statement } },
    tags: ['theorem'],
  })

  const lemmas = input.lemmas ?? []
  for (const lemma of lemmas) {
    specs.push({
      type: 'basic',
      content: { basic: { front: lemma.name, back: lemma.statement } },
      tags: ['lemma'],
    })
  }

  const steps = input.proofSteps ?? []
  steps.forEach((_step, i) => {
    const justification = lemmas[i]?.name ?? (i === 0 ? 'hypothesis' : `step ${i}`)
    specs.push({
      type: 'proof_step',
      content: {
        proof_step: {
          theorem: theorem.name,
          proofSteps: steps,
          stepIndex: i,
          justification,
          ...(lemmas[i] ? { sourceLemma: lemmas[i]!.name } : {}),
        },
      },
      tags: ['proof-step'],
    })
  })

  return specs
}

/**
 * Round-robin interleave of problem sets (blocked → mixed practice, Rohrer &
 * Taylor): one problem from each set in turn, preserving order within a set.
 * Deterministic.
 */
export function interleaveProblemSets<T>(sets: T[][]): T[] {
  const queues = sets.map((s) => [...s])
  const out: T[] = []
  while (queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift()
      if (next !== undefined) out.push(next)
    }
  }
  return out
}

// ─── Shared numeric / hashing primitives ────────────────────────────────────

/**
 * Clamp `value` into the closed interval [`min`, `max`] — the canonical
 * bounds helper (TD-06): use this instead of re-deriving local
 * `Math.min(max, Math.max(min, value))` closures.
 *
 * Invariants: returns `value` unchanged when `min ≤ value ≤ max`; NaN
 * propagates (every `Math.min`/`Math.max` branch yields NaN); works with
 * ±Infinity bounds. Units follow the caller's domain (probability, rating,
 * percentage — always pass the bounds you mean).
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Stable 32-bit FNV-1a hash of a string — the canonical deterministic hash
 * (TD-06): use this instead of re-deriving local FNV-1a loops.
 *
 * Why FNV-1a: fast, dependency-free, and stable across JS engines because it
 * only uses int32 arithmetic (`Math.imul` for the 32-bit multiply). Returns
 * an unsigned 32-bit integer (0 .. 2^32-1, `>>> 0`), so the result is safe
 * for modulo bucketing / per-date label rotation (same input + date always
 * produce the same bucket on server and client without sharing state). Not
 * cryptographic — never use it where an adversary can pick inputs.
 */
export function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
