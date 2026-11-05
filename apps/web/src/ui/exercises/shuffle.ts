/**
 * Deterministic shuffling for exercise options: the same exercise always
 * shows the same order for a given seed (stable across re-renders and
 * reloads), but different exercises get different orders.
 */

/** mulberry32 — tiny, fast, good-enough PRNG seeded with a 32-bit integer. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stable 32-bit seed from any string (e.g. the exercise prompt + id). */
export function seedFrom(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Indices 0..n-1 shuffled; never returns the identity order when n > 1. */
export function shuffledIndices(n: number, seed: number): number[] {
  const out = Array.from({ length: n }, (_, i) => i)
  const rand = seededRandom(seed)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  // an "already solved" ordering task teaches nothing — rotate it
  if (n > 1 && out.every((v, i) => v === i)) out.push(out.shift()!)
  return out
}
