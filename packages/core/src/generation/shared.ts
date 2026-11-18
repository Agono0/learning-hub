/**
 * Generation-domain leaf module — definitions both `index.ts` and
 * `desirable-difficulty-engine.ts` need, kept here so the engine never
 * imports its own barrel (which re-exports the engine back) and the import
 * graph stays acyclic.
 *
 * Contents: the generation-tier ladder vocabulary (Bjork 2011 desirable
 * difficulties) and the normalized Levenshtein token similarity used to
 * score generated attempts.
 */
import { z } from 'zod'

export const generationTierEnum = z.enum([
  'stem_completion', // Tier 1: Minimal stem / masked consonants & vowels
  'semantic_anagram', // Tier 2: Token scrambled reconstruction
  'reverse_query', // Tier 3: Jeopardy reverse inquiry formulation
  'analogy_synthesis', // Tier 4: Embodied metaphor & boundary case generation
])

export type GenerationTier = z.infer<typeof generationTierEnum>

/**
 * Compute normalized Levenshtein token similarity between two strings (0.0 to 1.0).
 */
export function computeSimilarity(a: string, b: string): number {
  const normA = a
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '')
  const normB = b
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '')

  if (!normA && !normB) return 1.0
  if (!normA || !normB) return 0.0
  if (normA === normB) return 1.0

  const m = normA.length
  const n = normB.length
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) d[i]![0] = i
  for (let j = 0; j <= n; j++) d[0]![j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = normA[i - 1] === normB[j - 1] ? 0 : 1
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1, // deletion
        d[i]![j - 1]! + 1, // insertion
        d[i - 1]![j - 1]! + cost, // substitution
      )
    }
  }

  const distance = d[m]![n]!
  const maxLen = Math.max(m, n)
  return Math.max(0, Math.round(((maxLen - distance) / maxLen) * 100) / 100)
}
