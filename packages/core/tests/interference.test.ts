import { describe, expect, it } from 'vitest'
import {
  INF_DEFAULTS,
  adviceFor,
  buildDrill,
  cardCueTarget,
  classifyPair,
  diffWords,
  findCandidates,
  pairEvidence,
  pairKey,
  runInterferenceAudit,
  spreadPairs,
  summarizeInterference,
  textSimilarity,
  tokens,
  type InfCard,
  type InfReview,
} from '../src/interference'

const NOW = new Date('2026-11-20T12:00:00.000Z')
const card = (id: number, cue: string, target: string): InfCard => ({ id, deckId: 1, cue, target })
const at = (day: number, hour: number) => new Date(Date.UTC(2026, 10, day, hour)).toISOString()
const rv = (cardId: number, rating: number, when: string): InfReview => ({
  cardId,
  rating,
  reviewedAt: when,
})

describe('text cues', () => {
  it('extracts cue and target from basic, cloze, typein and mcq cards', () => {
    expect(cardCueTarget({ basic: { front: '<b>Capital of France</b>', back: 'Paris' } })).toEqual({
      cue: 'Capital of France',
      target: 'Paris',
    })
    expect(
      cardCueTarget({ cloze: { text: 'The {{c1::heart}} pumps blood', answers: ['heart'] } }),
    ).toEqual({ cue: 'The ___ pumps blood', target: 'heart' })
    expect(cardCueTarget({ typein: { question: 'Q?', acceptedAnswers: ['A'] } })).toEqual({
      cue: 'Q?',
      target: 'A',
    })
    expect(cardCueTarget({ mcq: { question: 'Q', options: ['x', 'y'], correctIndex: 1 } })).toEqual(
      {
        cue: 'Q',
        target: 'y',
      },
    )
    expect(cardCueTarget({ occlusion: {} })).toBeNull()
    expect(cardCueTarget(null)).toBeNull()
  })
  it('tokenises CJK as character pairs and stems Latin words', () => {
    expect(tokens('学习方法')).toEqual(['学习', '习方', '方法'])
    expect(tokens('Running studies')).toEqual(expect.arrayContaining(['runn', 'study']))
    expect(tokens('the of and')).toEqual([])
  })
  it('scores identical, near and unrelated strings', () => {
    expect(textSimilarity('Mitosis phase', 'mitosis   phase!')).toBe(1)
    expect(textSimilarity('mitochondria function', 'mitochondrion function')).toBeGreaterThan(0.5)
    expect(textSimilarity('apple pie', 'quantum field')).toBeLessThan(0.2)
    expect(textSimilarity('', '')).toBe(0)
  })
})

describe('classification', () => {
  it('flags same cue with different answers as the classic interference case', () => {
    const r = classifyPair(
      card(1, 'Which enzyme unwinds DNA at the replication fork?', 'Helicase'),
      card(2, 'Which enzyme unwinds RNA at the replication fork?', 'Topoisomerase'),
    )
    expect(r.kind).toBe('same-cue-different-target')
    expect(r.base).toBeGreaterThan(0.5)
  })
  it('flags two cues leading to one answer', () => {
    const r = classifyPair(
      card(1, 'Powerhouse of the cell', 'Mitochondria'),
      card(2, 'Organelle making ATP', 'Mitochondria'),
    )
    expect(r.kind).toBe('same-target-different-cue')
  })
  it('flags duplicates and ignores unrelated cards', () => {
    expect(
      classifyPair(card(1, 'Capital of France', 'Paris'), card(2, 'capital of france?', 'paris'))
        .kind,
    ).toBe('near-duplicate')
    expect(
      classifyPair(
        card(1, 'Capital of France', 'Paris'),
        card(2, 'Boiling point of water', '100 C'),
      ).kind,
    ).toBeNull()
  })
})

describe('candidate search', () => {
  const deck = [
    card(1, 'Which enzyme unwinds DNA at the fork?', 'Helicase'),
    card(2, 'Which enzyme unwinds RNA at the fork?', 'Topoisomerase'),
    card(3, 'Boiling point of water at sea level', '100 C'),
    card(4, 'Capital of Peru', 'Lima'),
  ]
  it('finds only the lookalike pair, smaller id first', () => {
    const r = findCandidates(deck)
    expect(r.candidates.map((c) => [c.a, c.b])).toEqual([[1, 2]])
    expect(r.truncated).toBe(false)
    expect(r.scanned).toBe(4)
  })
  it('does not link cards through very common words', () => {
    const many = Array.from({ length: 80 }, (_, i) =>
      card(i + 1, `What is the thing number${i}`, `unique${i * 7}`),
    )
    expect(findCandidates(many).candidates).toEqual([])
  })
  it('reports skipped common words, and still links templated cards by prefix or answer', () => {
    const many = Array.from({ length: 80 }, (_, i) =>
      card(i + 1, `What is the capital city of region${i} in the old atlas`, `town${i * 7}`),
    )
    many.push(card(200, 'What is the capital city of region5 in the old atlas', 'town35'))
    many.push(card(201, 'Largest river of region9 in the old atlas', 'town63'))
    const r = findCandidates(many)
    expect(r.skippedWords).toBeGreaterThan(0)
    expect(r.candidates.some((c) => c.a === 6 && c.b === 200)).toBe(true)
    const none = findCandidates(
      Array.from({ length: 80 }, (_, i) =>
        card(i + 1, `What is the thing number${i}`, `unique${i * 7}`),
      ),
    )
    expect(none.skippedWords).toBeGreaterThan(0)
    expect(none.unlinkedCards).toBeGreaterThan(0)
  })
  it('counts prefix or answer groups too large to compare', () => {
    const many = Array.from({ length: INF_DEFAULTS.maxPosting + 5 }, (_, i) =>
      card(i + 1, `Question ${i} zz${i}`, 'Same answer'),
    )
    expect(findCandidates(many).skippedGroups).toBeGreaterThan(0)
  })
  it('counts cards that were not linked to any other card', () => {
    expect(findCandidates(deck).unlinkedCards).toBe(2)
  })
  it('truncates by card count and by pair budget, and says so', () => {
    expect(findCandidates(deck, { maxCards: 2 }).scanned).toBe(2)
    expect(findCandidates(deck, { maxCards: 2 }).truncated).toBe(true)
    expect(findCandidates(deck, { maxCandidatePairs: 0 }).truncated).toBe(true)
  })
  it('is deterministic', () => {
    expect(findCandidates(deck)).toEqual(findCandidates([...deck].reverse()))
  })
})

describe('review evidence interval', () => {
  it('needs 8 reviews in each group', () => {
    expect(INF_DEFAULTS.minGroup).toBe(8)
  })
  it('stays inside [-1, 1] when a group never fails', () => {
    const rs: InfReview[] = []
    for (let d = 1; d <= 12; d++) {
      rs.push(rv(1, 3, at(d, 9)), rv(2, 1, at(d, 9).replace(':00:00', ':05:00')))
    }
    const e = pairEvidence(1, 2, rs)
    expect(e.exposedReviews).toBeGreaterThanOrEqual(8)
    expect(e.liftLow ?? 0).toBeGreaterThanOrEqual(-1)
    expect(e.liftHigh ?? 0).toBeLessThanOrEqual(1)
  })
})

describe('review evidence', () => {
  // card 2 fails right after card 1 was reviewed, and passes otherwise
  const reviews: InfReview[] = []
  for (let d = 1; d <= 10; d++) {
    reviews.push(rv(1, 3, at(d, 8)))
    reviews.push(rv(2, 1, at(d, 9))) // exposed, fails
  }
  for (let d = 11; d <= 18; d++) reviews.push(rv(2, 3, at(d, 9))) // alone, passes
  it('reports interference when failures follow the lookalike', () => {
    const e = pairEvidence(1, 2, reviews)
    expect(e.verdict).toBe('interfering')
    expect(e.lift!).toBeGreaterThan(0.5)
    expect(e.liftLow!).toBeGreaterThan(0.05)
  })
  it('says insufficient with few reviews and no-signal when failures are unrelated', () => {
    expect(pairEvidence(1, 2, reviews.slice(0, 4)).verdict).toBe('insufficient')
    const flat: InfReview[] = []
    for (let d = 1; d <= 12; d++) {
      flat.push(rv(1, 3, at(d, 8)))
      flat.push(rv(2, d % 2 ? 1 : 3, at(d, 9)))
      flat.push(rv(2, d % 2 ? 1 : 3, at(d, 20 + (d % 3))))
    }
    expect(pairEvidence(1, 2, flat, 1).verdict).not.toBe('interfering')
  })
})

describe('audit', () => {
  const deck = [
    card(1, 'Which enzyme unwinds DNA at the fork?', 'Helicase'),
    card(2, 'Which enzyme unwinds RNA at the fork?', 'Topoisomerase'),
    card(5, 'Capital of France', 'Paris'),
    card(6, 'capital of france?', 'paris'),
  ]
  it('ranks, counts kinds and filters dismissed pairs', () => {
    const a = runInterferenceAudit(deck, [], { now: NOW })
    expect(a.found).toBe(2)
    expect(a.byKind['same-cue-different-target']).toBe(1)
    expect(a.byKind['near-duplicate']).toBe(1)
    expect(a.pairs[0]!.kind).toBe('same-cue-different-target')
    expect(a.cardsAffected).toBe(2)
    const b = runInterferenceAudit(deck, [], {
      now: NOW,
      decisions: [{ a: 2, b: 1, status: 'dismissed' }],
    })
    expect(b.dismissed).toBe(1)
    expect(b.pairs.some((p) => p.a === 1)).toBe(false)
  })
  it('raises severity for confirmed pairs and for review evidence', () => {
    const base = runInterferenceAudit(deck, [], { now: NOW }).pairs[0]!.severity
    const conf = runInterferenceAudit(deck, [], {
      now: NOW,
      decisions: [{ a: 1, b: 2, status: 'confirmed' }],
    })
    expect(conf.pairs[0]!.severity).toBeCloseTo(Math.min(1, base + 0.2), 3)
    expect(conf.confirmed).toBe(1)
    const rows: InfReview[] = []
    for (let d = 1; d <= 10; d++) {
      rows.push(rv(1, 3, at(d, 8)), rv(2, 1, at(d, 9)))
    }
    for (let d = 11; d <= 18; d++) rows.push(rv(2, 3, at(d, 9)))
    const ev = runInterferenceAudit(deck, rows, { now: NOW })
    expect(ev.pairs[0]!.evidence.verdict).toBe('interfering')
    expect(ev.pairs[0]!.severity).toBeGreaterThan(base)
  })
  it('ignores reviews outside the window and caps shown pairs', () => {
    const old = [rv(1, 1, '2020-01-01T00:00:00Z'), rv(2, 1, '2020-01-01T01:00:00Z')]
    expect(runInterferenceAudit(deck, old, { now: NOW }).pairs[0]!.evidence.exposedReviews).toBe(0)
    expect(runInterferenceAudit(deck, [], { now: NOW, maxPairs: 1 }).pairs).toHaveLength(1)
  })
  it('summarises an empty and a busy collection', () => {
    expect(summarizeInterference(runInterferenceAudit([], [], { now: NOW })).headline).toMatch(
      /Fewer than two/,
    )
    expect(
      summarizeInterference(
        runInterferenceAudit([deck[2]!, card(9, 'Boiling point', '100')], [], { now: NOW }),
      ).headline,
    ).toMatch(/No lookalike/)
    const r = summarizeInterference(runInterferenceAudit(deck, [], { now: NOW }))
    expect(r.headline).toMatch(/1 lookalike pair/)
    expect(r.advice.join(' ')).toMatch(/near-duplicate/)
    expect(r.caveats.length).toBeGreaterThanOrEqual(3)
  })
})

describe('plan', () => {
  it('lists the words that differ', () => {
    const d = diffWords('DNA helicase unwinds', 'RNA helicase unwinds')
    expect(d.onlyA).toEqual(['dna'])
    expect(d.onlyB).toEqual(['rna'])
    expect(d.shared).toEqual(expect.arrayContaining(['helicase']))
  })
  it('builds a four-item A B B A drill with a contrast question', () => {
    const drill = buildDrill(card(7, 'Cue seven alpha', 'T7'), card(3, 'Cue three beta', 'T3'))
    expect(drill.items.map((i) => i.cardId)).toEqual([3, 7, 7, 3])
    expect(drill.contrast).toMatch(/tells/)
  })
  it('gives advice for every kind', () => {
    const none = { onlyA: [], onlyB: [], shared: [] }
    for (const k of [
      'near-duplicate',
      'same-cue-different-target',
      'same-target-different-cue',
      'lookalike',
    ] as const)
      expect(adviceFor(k, none, none).steps.length).toBeGreaterThan(0)
  })
  it('spreads lookalikes apart, keeps every card once and leaves other orders alone', () => {
    const queue = [1, 2, 3, 4, 5, 6, 7, 8]
    const out = spreadPairs(queue, [[1, 2]], 3)
    expect([...out].sort()).toEqual([...queue].sort())
    expect(Math.abs(out.indexOf(1) - out.indexOf(2))).toBeGreaterThanOrEqual(3)
    expect(spreadPairs([3, 4, 5], [[1, 2]], 3)).toEqual([3, 4, 5])
    expect(spreadPairs([1, 2], [[1, 2]], 3)).toEqual([1, 2])
    expect(spreadPairs(queue, [], 3)).toEqual(queue)
    expect(INF_DEFAULTS.maxCards).toBe(1500)
    expect(pairKey(9, 4)).toBe('4:9')
  })
})
