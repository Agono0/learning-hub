/**
 * Agent A — math module tests: theorem decomposition and problem-set
 * interleaving.
 */
import { describe, expect, it } from 'vitest'
import { interleaveProblemSets, theoremToCards } from '../src/math'

describe('theoremToCards', () => {
  const input = {
    theorem: { name: 'Lagrange', statement: '|H| divides |G| for H ≤ G finite' },
    definitions: [{ term: 'subgroup', meaning: 'a subset closed under the group operation and inverses' }],
    lemmas: [
      { name: 'Cosets partition', statement: 'left cosets of H partition G' },
      { name: 'Equal size', statement: 'every coset has |H| elements' },
    ],
    proofSteps: ['Cosets partition G', 'Each coset has |H| elements', 'Therefore |G| = [G:H]·|H|'],
  }

  it('emits definition, theorem, lemma and proof-step cards', () => {
    const specs = theoremToCards(input)
    const types = specs.map((s) => s.type)
    expect(types).toEqual([
      'basic', // definition
      'basic', // theorem
      'basic', // lemma 1
      'basic', // lemma 2
      'proof_step',
      'proof_step',
      'proof_step',
    ])
    expect(specs[0].tags).toEqual(['definition'])
    expect(specs[1].tags).toEqual(['theorem'])
    expect(specs[2].tags).toEqual(['lemma'])
  })

  it('proof steps reference the matching lemma, then previous step, then hypothesis', () => {
    const specs = theoremToCards(input)
    const stepCards = specs.filter((s) => s.type === 'proof_step')
    expect(stepCards[0].content.proof_step?.justification).toBe('Cosets partition')
    expect(stepCards[1].content.proof_step?.justification).toBe('Equal size')
    expect(stepCards[2].content.proof_step?.justification).toBe('step 2')
    expect(stepCards[0].content.proof_step?.theorem).toBe('Lagrange')
    expect(stepCards[0].content.proof_step?.stepIndex).toBe(0)
  })

  it('first step without a lemma is justified by the hypothesis', () => {
    const specs = theoremToCards({
      theorem: { name: 'T', statement: 'S' },
      proofSteps: ['only step'],
    })
    // specs[0] is the theorem basic card; the proof step follows
    expect(specs[1].content.proof_step?.justification).toBe('hypothesis')
  })

  it('handles a bare theorem without extras', () => {
    const specs = theoremToCards({ theorem: { name: 'Euler', statement: 'a^φ(n) ≡ 1' } })
    expect(specs).toHaveLength(1)
    expect(specs[0].content.basic).toEqual({ front: 'Euler', back: 'a^φ(n) ≡ 1' })
  })
})

describe('interleaveProblemSets', () => {
  it('round-robins sets preserving within-set order', () => {
    const out = interleaveProblemSets([
      ['A1', 'A2', 'A3'],
      ['B1', 'B2'],
      ['C1'],
    ])
    expect(out).toEqual(['A1', 'B1', 'C1', 'A2', 'B2', 'A3'])
  })

  it('handles empty sets and empty input', () => {
    expect(interleaveProblemSets([])).toEqual([])
    expect(interleaveProblemSets([[], ['x'], []])).toEqual(['x'])
  })

  it('does not mutate the input sets', () => {
    const sets = [['a', 'b'], ['c']]
    interleaveProblemSets(sets)
    expect(sets).toEqual([['a', 'b'], ['c']])
  })
})
