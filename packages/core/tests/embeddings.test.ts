import { describe, expect, it } from 'vitest'
import {
  cosineSimilarity,
  dotProduct,
  euclideanDistance,
  findTopKMatches,
  normalizeVector,
  vectorNorm,
} from '../src/embeddings'

describe('embeddings math and search', () => {
  it('calculates dot product accurately', () => {
    expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32)
    expect(() => dotProduct([1, 2], [1, 2, 3])).toThrow('Vector dimension mismatch')
  })

  it('calculates vector norm and normalizes vector', () => {
    expect(vectorNorm([3, 4])).toBe(5)
    const norm = normalizeVector([3, 4])
    expect(norm[0]).toBeCloseTo(0.6)
    expect(norm[1]).toBeCloseTo(0.8)
    expect(vectorNorm(norm)).toBeCloseTo(1.0)
  })

  it('computes cosine similarity correctly', () => {
    // Identical direction
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1.0)
    // Orthogonal
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0)
    // Opposite direction
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0)
  })

  it('computes euclidean distance accurately', () => {
    expect(euclideanDistance([0, 0], [3, 4])).toBe(5)
    expect(euclideanDistance([1, 1, 1], [1, 1, 1])).toBe(0)
  })

  it('finds top-K matches ranked by similarity score', () => {
    const candidates = [
      { id: 1, vector: [1, 0, 0], metadata: { text: 'card 1' } },
      { id: 2, vector: [0.9, 0.1, 0], metadata: { text: 'card 2' } },
      { id: 3, vector: [0, 1, 0], metadata: { text: 'card 3' } },
      { id: 4, vector: [0, 0, 1], metadata: { text: 'card 4' } },
    ]

    const query = [1, 0, 0]
    const matches = findTopKMatches(query, candidates, 2, 0.5)

    expect(matches).toHaveLength(2)
    expect(matches[0]!.id).toBe(1)
    expect(matches[0]!.score).toBeCloseTo(1.0)
    expect(matches[1]!.id).toBe(2)
    expect(matches[1]!.score).toBeGreaterThan(0.9)
  })
})
