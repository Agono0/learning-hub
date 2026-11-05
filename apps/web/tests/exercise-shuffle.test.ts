import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { seedFrom, shuffledIndices } from '@/ui/exercises/shuffle'

describe('exercise shuffling', () => {
  it('is a deterministic permutation per seed', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 30 }), fc.integer(), (n, seed) => {
        const a = shuffledIndices(n, seed)
        expect(a).toEqual(shuffledIndices(n, seed))
        expect([...a].sort((x, y) => x - y)).toEqual(Array.from({ length: n }, (_, i) => i))
      }),
    )
  })

  it('never presents an ordering task already solved', () => {
    for (let seed = 0; seed < 500; seed++) {
      const a = shuffledIndices(3, seed)
      expect(a.every((v, i) => v === i)).toBe(false)
    }
  })

  it('derives stable seeds from text', () => {
    expect(seedFrom('mcq:a')).toBe(seedFrom('mcq:a'))
    expect(seedFrom('mcq:a')).not.toBe(seedFrom('mcq:b'))
  })
})
