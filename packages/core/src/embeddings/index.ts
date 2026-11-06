/**
 * @fileoverview Local Vector Embeddings & Similarity Search.
 *
 * Provides pure mathematical vector operations (cosine similarity, normalized dot
 * product, euclidean distance) and top-K ranked search across high-dimensional
 * embeddings (e.g. 384-dim all-MiniLM-L6-v2 or 512-dim multilingual models).
 */
import { z } from 'zod'

export const embeddingModelSchema = z.enum(['all-MiniLM-L6-v2', 'bge-small-en-v1.5', 'custom'])
export type EmbeddingModel = z.infer<typeof embeddingModelSchema>

export const vectorEmbeddingSchema = z.object({
  id: z.number().int().positive(),
  vector: z.array(z.number()),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type VectorEmbedding = z.infer<typeof vectorEmbeddingSchema>

export interface SimilarityMatch<T = unknown> {
  id: number
  score: number
  metadata?: T
}

/**
 * Computes the dot product of two equal-length numerical vectors.
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`)
  }
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += a[i]! * b[i]!
  }
  return sum
}

/**
 * Computes the Euclidean L2 norm of a vector.
 */
export function vectorNorm(v: number[]): number {
  let sum = 0
  for (let i = 0; i < v.length; i++) {
    sum += v[i]! * v[i]!
  }
  return Math.sqrt(sum)
}

/**
 * Normalizes a vector to unit length (L2 norm = 1.0).
 */
export function normalizeVector(v: number[]): number[] {
  const norm = vectorNorm(v)
  if (norm === 0) return v.slice()
  return v.map((x) => x / norm)
}

/**
 * Computes cosine similarity between two vectors, returning a value in [-1.0, 1.0].
 * 1.0 = identical direction, 0.0 = orthogonal, -1.0 = opposite direction.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  const normA = vectorNorm(a)
  const normB = vectorNorm(b)
  if (normA === 0 || normB === 0) return 0
  return dotProduct(a, b) / (normA * normB)
}

/**
 * Computes Euclidean distance between two vectors. Lower is closer.
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`)
  }
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const diff = a[i]! - b[i]!
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

/**
 * Performs Top-K similarity search over a collection of candidate vector embeddings.
 *
 * @param queryVector - The reference embedding vector.
 * @param candidates - Collection of stored embeddings.
 * @param topK - Maximum number of matches to return (default 5).
 * @param minScore - Minimum cosine similarity threshold in [0, 1] (default 0.0).
 */
export function findTopKMatches<T = unknown>(
  queryVector: number[],
  candidates: Array<{ id: number; vector: number[]; metadata?: T }>,
  topK = 5,
  minScore = 0.0,
): SimilarityMatch<T>[] {
  if (!queryVector || queryVector.length === 0 || candidates.length === 0) {
    return []
  }

  const scored: SimilarityMatch<T>[] = []
  for (const c of candidates) {
    if (c.vector.length !== queryVector.length) continue
    const score = cosineSimilarity(queryVector, c.vector)
    if (score >= minScore) {
      scored.push({
        id: c.id,
        score,
        metadata: c.metadata,
      })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}
