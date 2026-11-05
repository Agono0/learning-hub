import { describe, expect, it } from 'vitest'
import { clozeCandidates, loadBearingWord, splitSentences } from '../src/sentence-mining'

describe('splitSentences', () => {
  it('splits on sentence boundaries and keeps content', () => {
    const sentences = splitSentences('The FFT is fast. Dr. Hill said so! Really?')
    expect(sentences).toEqual(['The FFT is fast.', 'Dr. Hill said so!', 'Really?'])
  })

  it('handles newlines and empty input', () => {
    expect(splitSentences('One line.\nAnother line.')).toEqual(['One line.', 'Another line.'])
    expect(splitSentences('')).toEqual([])
  })
})

describe('loadBearingWord', () => {
  it('picks the longest non-stopword', () => {
    expect(loadBearingWord('The consolidation of memory happens during sleep.')).toBe(
      'consolidation',
    )
  })

  it('returns null for pure stopwords', () => {
    expect(loadBearingWord('It is at the end of it all.')).toBeNull()
  })
})

describe('clozeCandidates', () => {
  const text =
    'Retroactive interference occurs when new memories disrupt older ones. ' +
    'The spacing effect was documented by Ebbinghaus in 1885. Short. ' +
    'This single extremely long sentence rambles on and on with far too many words to ever become a minimal information card that any learner would want to review quickly and easily.'

  it('produces one draft per minable sentence with verbatim answers', () => {
    const drafts = clozeCandidates(text)
    expect(drafts.length).toBe(2)
    for (const d of drafts) {
      expect(d.text).toContain('{{c1::')
      expect(d.sentence).toContain(d.answer)
    }
    expect(drafts[0]!.answer).toBe('interference') // longest load-bearing word
  })

  it('respects the max cap', () => {
    expect(clozeCandidates(text, 1)).toHaveLength(1)
  })
})
