import { describe, it, expect } from 'vitest'
import {
  nextFragment,
  resurfaceHighlights,
  triageUpdate,
  resurfaceSeen,
  extractHighlightCandidates,
  sourceToClozePrompt,
  type HighlightRow,
  type ReadingSource,
} from '../src/reading'

describe('Reading Pipeline Domain Logic', () => {
  describe('nextFragment (SuperMemo incremental reading chunker)', () => {
    it('returns an empty done fragment when source content has no words', () => {
      const source: ReadingSource = { content: '   ' }
      const frag = nextFragment(source)
      expect(frag.done).toBe(true)
      expect(frag.words).toBe(0)
      expect(frag.position).toBe(100)
    })

    it('extracts wordsPerDay starting at position 0 and advances nextPosition', () => {
      const words = Array.from({ length: 1000 }, (_, i) => `word${i}`)
      const source: ReadingSource = { content: words.join(' '), position: 0 }
      const frag = nextFragment(source, 200)

      expect(frag.fromWord).toBe(0)
      expect(frag.toWord).toBe(200)
      expect(frag.words).toBe(200)
      expect(frag.position).toBe(0)
      expect(frag.nextPosition).toBe(20) // 200 / 1000 = 20%
      expect(frag.done).toBe(false)
    })

    it('flags done=true when reading reaches or exceeds document length', () => {
      const source: ReadingSource = { content: 'one two three four five', position: 60 }
      const frag = nextFragment(source, 10)
      expect(frag.done).toBe(true)
      expect(frag.nextPosition).toBe(100)
    })
  })

  describe('resurfaceHighlights (Readwise-style decay and triage queue)', () => {
    const today = new Date('2026-11-09T12:00:00Z')

    it('excludes discarded highlights (triaged === 2)', () => {
      const highlights: HighlightRow[] = [
        {
          id: 1,
          sourceId: 1,
          text: 'Keep this',
          strength: 0.8,
          triaged: 1,
          lastReviewedAt: '2026-11-01T00:00:00Z',
        },
        {
          id: 2,
          sourceId: 1,
          text: 'Discarded',
          strength: 0.9,
          triaged: 2,
          lastReviewedAt: '2026-11-01T00:00:00Z',
        },
      ]
      const queue = resurfaceHighlights(highlights, today)
      expect(queue.some((h) => h.id === 2)).toBe(false)
      expect(queue.some((h) => h.id === 1)).toBe(true)
    })

    it('prioritizes unreviewed highlights (lastReviewedAt is null)', () => {
      const highlights: HighlightRow[] = [
        {
          id: 1,
          sourceId: 1,
          text: 'Reviewed recently',
          strength: 0.5,
          triaged: 0,
          lastReviewedAt: '2026-11-08T00:00:00Z',
        },
        {
          id: 2,
          sourceId: 1,
          text: 'Never reviewed',
          strength: 0.5,
          triaged: 0,
          lastReviewedAt: null,
        },
      ]
      const queue = resurfaceHighlights(highlights, today)
      expect(queue[0].id).toBe(2) // Never reviewed gets highest priority
    })

    it('applies 1.25x triage boost to kept highlights (triaged === 1)', () => {
      const highlights: HighlightRow[] = [
        {
          id: 1,
          sourceId: 1,
          text: 'Untriaged',
          strength: 0.5,
          triaged: 0,
          lastReviewedAt: '2026-10-25T00:00:00Z',
        },
        {
          id: 2,
          sourceId: 1,
          text: 'Kept',
          strength: 0.5,
          triaged: 1,
          lastReviewedAt: '2026-10-25T00:00:00Z',
        },
      ]
      const queue = resurfaceHighlights(highlights, today)
      expect(queue[0].id).toBe(2)
      expect(queue[0].weight).toBeGreaterThan(queue[1].weight)
    })
  })

  describe('triage decisions and passive seen bumps', () => {
    const today = new Date('2026-11-09T12:00:00Z')
    const highlight: HighlightRow = {
      id: 5,
      sourceId: 2,
      text: 'Long term retention benefits of testing',
      strength: 0.5,
      triaged: 0,
      lastReviewedAt: null,
    }

    it('increases strength and marks triaged=1 on keep', () => {
      const updated = triageUpdate(highlight, 'keep', today)
      expect(updated.triaged).toBe(1)
      expect(updated.strength).toBeCloseTo(0.65)
      expect(updated.lastReviewedAt).toBe(today.toISOString())
    })

    it('collapses strength and marks triaged=2 on discard', () => {
      const updated = triageUpdate(highlight, 'discard', today)
      expect(updated.triaged).toBe(2)
      expect(updated.strength).toBeCloseTo(0.125)
    })

    it('applies passive bump on resurfaceSeen without changing triage status', () => {
      const bumped = resurfaceSeen(highlight, today)
      expect(bumped.triaged).toBe(0)
      expect(bumped.strength).toBeCloseTo(0.55)
    })
  })

  describe('extractHighlightCandidates (heuristic cue-phrase scoring)', () => {
    it('scores and extracts sentences containing definition and causal cues', () => {
      const text = `
        Active recall is defined as retrieving information from memory without looking at the answer.
        This matters because retrieval forces structural reorganization in neural pathways.
        A short filler.
        Research shows that testing produces significantly higher retention than passive review.
      `
      const candidates = extractHighlightCandidates(text, 5)
      expect(candidates.length).toBeGreaterThanOrEqual(2)
      expect(candidates.some((c) => c.includes('is defined as'))).toBe(true)
      expect(candidates.some((c) => c.includes('Research shows'))).toBe(true)
    })

    it('filters out sentences that are too short or overly long', () => {
      const tooShort = 'Too short.'
      const candidates = extractHighlightCandidates(tooShort, 5)
      expect(candidates).toHaveLength(0)
    })
  })

  describe('sourceToClozePrompt', () => {
    it('constructs guardrailed system and prompt instructions', () => {
      const { system, prompt } = sourceToClozePrompt('Dopamine reinforces behavioral loops.')
      expect(system).toContain('cloze deletion flashcards')
      expect(system).toContain('VERBATIM')
      expect(prompt).toContain('Dopamine reinforces behavioral loops.')
    })
  })
})
