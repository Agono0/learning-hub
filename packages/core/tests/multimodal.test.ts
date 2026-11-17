import { describe, expect, it } from 'vitest'
import {
  extractMarkdownNotesAndClozes,
  extractPaperFormulasAndDefinitions,
  generateCodeClozeCards,
  generateVideoCards,
  parseTranscriptSegments,
} from '../src/multimodal'

describe('Universal Multi-Modal Ingestion Domain', () => {
  describe('parseTranscriptSegments & generateVideoCards', () => {
    it('parses timestamps and lines into segments and deep-linked cards', () => {
      const rawVtt = `
1
00:01:15.000
This is where we introduce the concept of gradient descent.

2
00:01:25.000
Notice how the learning rate controls the step size along the loss surface.
`
      const segments = parseTranscriptSegments(rawVtt)
      expect(segments.length).toBe(2)
      expect(segments[0].startSec).toBe(75)

      const cards = generateVideoCards('ML Lecture', 'https://youtube.com/watch?v=demo', segments)
      expect(cards.length).toBe(2)
      expect(cards[0].sourceReference).toContain('t=75s')
      expect(cards[0].front).toContain('1:15')
    })
  })

  describe('extractPaperFormulasAndDefinitions', () => {
    it('extracts LaTeX formulas and definition blocks', () => {
      const paperText = `
In this section we formalize the attention mechanism.
$$Attention(Q, K, V) = softmax(\\frac{QK^T}{\\sqrt{d_k}})V$$

Definition 1.1: An invariant subspace is a subspace preserved by a linear transformation.
`
      const cards = extractPaperFormulasAndDefinitions(paperText)
      expect(cards.length).toBeGreaterThanOrEqual(2)
      expect(cards.some((c) => c.front.includes('softmax'))).toBe(true)
      expect(cards.some((c) => c.front.includes('Definition 1.1'))).toBe(true)
    })
  })

  describe('generateCodeClozeCards', () => {
    it('generates syntax clozes for key code exports', () => {
      const code = `
export function calculateVelocity(distance: number, time: number): number {
  return distance / time
}
`
      const cards = generateCodeClozeCards('physics.ts', code)
      expect(cards.length).toBe(1)
      expect(cards[0].format).toBe('cloze')
      expect(cards[0].front).toContain('{{c1::calculateVelocity}}')
      expect(cards[0].back).toBe('calculateVelocity')
    })
  })

  describe('extractMarkdownNotesAndClozes', () => {
    it('extracts clozes, Q&A pairs, and bold definitions from markdown', () => {
      const notes = `
# Synaptic Plasticity Notes

- **Long-term Potentiation**: A persistent strengthening of synapses based on recent patterns of activity.
- The neurotransmitter {{c1::Glutamate}} binds to AMPA and NMDA receptors.

Q: What ion block is removed during strong NMDA depolarization?
A: Magnesium ion (Mg2+) block.

Heuristic :: A practical method or mental shortcut not guaranteed to be optimal.
`
      const cards = extractMarkdownNotesAndClozes(notes)
      expect(cards.length).toBeGreaterThanOrEqual(4)

      // Cloze
      const cloze = cards.find((c) => c.format === 'cloze')
      expect(cloze).toBeDefined()
      expect(cloze?.front).toContain('{{c1::Glutamate}}')
      expect(cloze?.back).toBe('Glutamate')

      // Q&A
      const qa = cards.find((c) => c.front.includes('What ion block is removed'))
      expect(qa).toBeDefined()
      expect(qa?.back).toContain('Magnesium ion')

      // Bold definition
      const ltp = cards.find((c) => c.front.includes('Long-term Potentiation'))
      expect(ltp).toBeDefined()
      expect(ltp?.back).toContain('persistent strengthening')

      // Double colon definition
      const heuristic = cards.find((c) => c.front.includes('Heuristic'))
      expect(heuristic).toBeDefined()
      expect(heuristic?.back).toContain('practical method')
    })
  })
})
