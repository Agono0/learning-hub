/**
 * Math learning utilities (Agent A) — theorem → card decomposition and
 * problem-set interleaving. Pure module — safe for client bundles.
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
    const justification =
      lemmas[i]?.name ?? (i === 0 ? 'hypothesis' : `step ${i}`)
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
