import { describe, expect, it } from 'vitest'
import {
  balanceOf,
  buildClusters,
  cardCueTarget,
  competitorEdge,
  expandSession,
  interleaveByCluster,
  rescueQueue,
  runAudit,
  summarizeAudit,
  tokens,
  type RifCard,
  type RifReview,
} from '../src/retrieval-forgetting'

const NOW = new Date('2026-11-20T12:00:00.000Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

function card(id: number, cue: string, target: string, extra: Partial<RifCard> = {}): RifCard {
  return {
    id,
    deckId: 1,
    cue,
    target,
    tags: [],
    stability: 10,
    lastReview: daysAgo(8),
    state: 2,
    ...extra,
  }
}
const review = (cardId: number, rating: number, d: number): RifReview => ({
  cardId,
  rating,
  reviewedAt: daysAgo(d),
})

// A classic RIF set: one category cue, different answers.
const FRUIT = [
  card(1, 'Fruit that is red and grows on trees', 'apple'),
  card(2, 'Fruit that is yellow and grows on trees', 'banana'),
  card(3, 'Fruit that is orange and grows on trees', 'tangerine'),
]
const OTHER = card(9, 'Capital city of France', 'Paris')

describe('cue extraction', () => {
  it('reads basic, cloze, typein and mcq and skips unsupported formats', () => {
    expect(cardCueTarget({ basic: { front: '<b>Capital of Peru</b>', back: 'Lima' } })).toEqual({
      cue: 'Capital of Peru',
      target: 'Lima',
    })
    expect(
      cardCueTarget({
        cloze: {
          text: 'The {{c1::mitochondria}} makes ATP',
          answers: ['mitochondria'],
          mode: 'basic',
        },
      }),
    ).toEqual({ cue: 'The ___ makes ATP', target: 'mitochondria' })
    expect(
      cardCueTarget({
        typein: { question: 'Largest planet?', acceptedAnswers: ['Jupiter', 'jupiter'] },
      }),
    ).toEqual({ cue: 'Largest planet?', target: 'Jupiter' })
    expect(
      cardCueTarget({ mcq: { question: '2+2?', options: ['3', '4'], correctIndex: 1 } }),
    ).toEqual({ cue: '2+2?', target: '4' })
    expect(cardCueTarget({ occlusion: { imageId: 1, rects: [] } })).toBeNull()
    expect(cardCueTarget(null)).toBeNull()
    expect(cardCueTarget({ basic: { front: 'only front', back: '  ' } })).toBeNull()
  })
  it('handles Arabic: whole-word tokens, Arabic stop words dropped, no stemming applied', () => {
    expect(tokens('ما هي عاصمة مصر')).toEqual(['عاصمة', 'مصر'])
    expect(tokens('الفاكهة')).toEqual(['الفاكهة'])
    const a = card(1, 'ما هي الفاكهة الحمراء الحلوة', 'تفاح')
    const b = card(2, 'ما هي الفاكهة الصفراء الحلوة', 'موز')
    expect(competitorEdge(a, b)).not.toBeNull()
  })
  it('tokenizes with stop words removed and plurals merged', () => {
    expect(tokens('The Fruits of the trees')).toEqual(['fruit', 'tree'])
  })
})

describe('competitor edges and clusters', () => {
  it('links cards with a shared cue and different answers', () => {
    const e = competitorEdge(FRUIT[0]!, FRUIT[1]!)
    expect(e).not.toBeNull()
    expect(e!.strength).toBeGreaterThan(0.3)
  })
  it('does not link unrelated cards, or cards whose answers overlap (integrated items)', () => {
    expect(competitorEdge(FRUIT[0]!, OTHER)).toBeNull()
    const a = card(1, 'Fruit that is red and grows on trees', 'apple pie recipe')
    const b = card(2, 'Fruit that is yellow and grows on trees', 'apple pie filling recipe')
    expect(competitorEdge(a, b)).toBeNull()
  })
  it('groups competitors and leaves others out', () => {
    const cl = buildClusters([...FRUIT, OTHER])
    expect(cl).toHaveLength(1)
    expect(cl[0]!.cardIds).toEqual([1, 2, 3])
    expect(cl[0]!.sharedCue).toContain('fruit')
  })
  it('caps oversized groups and marks them trimmed', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      card(100 + i, 'Fruit that grows on trees in orchards', `answer${i}x${i * 7}`),
    )
    const cl = buildClusters(many, { maxClusterSize: 8 })
    expect(cl.every((c) => c.cardIds.length <= 8)).toBe(true)
    expect(cl.some((c) => c.trimmed)).toBe(true)
  })
  it('ignores tokens shared by too many cards instead of building a quadratic graph', () => {
    const many = Array.from({ length: 80 }, (_, i) =>
      card(200 + i, `Question number ${i}`, `reply ${i}`),
    )
    expect(buildClusters(many, { maxDocFreq: 10, minSimilarity: 0.2 })).toEqual([])
  })
})

describe('suppression risk', () => {
  it('flags the neglected sibling when the others are practised', () => {
    const reviews = [
      review(1, 3, 2),
      review(1, 4, 5),
      review(1, 3, 9),
      review(2, 3, 1),
      review(2, 3, 6),
    ]
    const a = runAudit(FRUIT, reviews, { now: NOW })
    const cl = a.clusters[0]!
    const m3 = cl.members.find((m) => m.cardId === 3)!
    const m1 = cl.members.find((m) => m.cardId === 1)!
    expect(m3.risk).toBeGreaterThan(m1.risk)
    expect(m3.practiced).toBe(false)
    expect([1, 2]).toContain(m3.topCompetitorId)
    expect(cl.members[0]!.cardId).toBe(3)
  })
  it('own practice cushions a card', () => {
    const base = [review(1, 3, 2), review(1, 3, 4), review(1, 3, 6)]
    const without = runAudit(FRUIT, base, { now: NOW }).clusters[0]!.members.find(
      (m) => m.cardId === 2,
    )!
    const withOwn = runAudit(FRUIT, [...base, review(2, 3, 1), review(2, 3, 3), review(2, 3, 5)], {
      now: NOW,
    }).clusters[0]!.members.find((m) => m.cardId === 2)!
    expect(withOwn.risk).toBeLessThan(without.risk)
  })
  it('suppression saturates: ten retrievals are no worse than three', () => {
    const three = [1, 2, 3].map((d) => review(1, 3, d))
    const ten = Array.from({ length: 10 }, (_, d) => review(1, 3, d + 1))
    const r3 = runAudit(FRUIT, three, { now: NOW }).clusters[0]!.members.find(
      (m) => m.cardId === 3,
    )!
    const r10 = runAudit(FRUIT, ten, { now: NOW }).clusters[0]!.members.find((m) => m.cardId === 3)!
    expect(r10.risk).toBe(r3.risk)
  })
  it('reviews outside the window or failed reviews add no load', () => {
    const old = [review(1, 3, 40), review(1, 3, 50)]
    const failed = [review(1, 1, 2), review(1, 2, 3)]
    for (const rv of [old, failed]) {
      const m = runAudit(FRUIT, rv, { now: NOW }).clusters[0]!.members.find((x) => x.cardId === 3)!
      expect(m.competitorLoad).toBe(0)
      expect(m.band).toBe('low')
    }
  })
  it('fragile cards carry more risk than solid ones under the same load', () => {
    const rv = [review(1, 3, 1), review(1, 3, 2), review(1, 3, 3)]
    const fragile = FRUIT.map((c) =>
      c.id === 3 ? { ...c, stability: 1, lastReview: daysAgo(15) } : c,
    )
    const solid = FRUIT.map((c) =>
      c.id === 3 ? { ...c, stability: 200, lastReview: daysAgo(1) } : c,
    )
    const rf = runAudit(fragile, rv, { now: NOW }).clusters[0]!.members.find((m) => m.cardId === 3)!
    const rs = runAudit(solid, rv, { now: NOW }).clusters[0]!.members.find((m) => m.cardId === 3)!
    expect(rf.risk).toBeGreaterThan(rs.risk)
    expect(rf.retrievability).toBeLessThan(rs.retrievability)
  })
  it('balance is 1 for even practice and low when one card takes it all', () => {
    expect(balanceOf([2, 2, 2])).toBe(1)
    expect(balanceOf([0, 0, 0])).toBe(1)
    expect(balanceOf([6, 0, 0])).toBeLessThan(0.1)
    expect(balanceOf([4])).toBe(1)
  })
})

describe('audit, rescue and session planning', () => {
  const heavy = [1, 2, 3, 4, 5].flatMap((d) => [review(1, 3, d), review(2, 4, d)])
  const fragile3 = FRUIT.map((c) =>
    c.id === 3 ? { ...c, stability: 2, lastReview: daysAgo(12) } : c,
  )

  it('counts at-risk cards and excludes dismissed ones', () => {
    const a = runAudit(fragile3, heavy, { now: NOW })
    expect(a.atRisk + a.watch).toBeGreaterThan(0)
    const dismissed = runAudit(fragile3, heavy, { now: NOW, dismissed: new Set([3]) })
    expect(dismissed.atRisk + dismissed.watch).toBeLessThan(a.atRisk + a.watch)
    expect(rescueQueue(dismissed).some((r) => r.cardId === 3)).toBe(false)
  })
  it('builds a rescue queue, riskiest first, with a reverse probe', () => {
    const q = rescueQueue(runAudit(fragile3, heavy, { now: NOW }))
    expect(q[0]!.cardId).toBe(3)
    expect(q[0]!.reverseProbe).toContain('tangerine')
    expect(q[0]!.reason).toMatch(/practised more/)
    for (let i = 1; i < q.length; i++) expect(q[i - 1]!.risk).toBeGreaterThanOrEqual(q[i]!.risk)
    expect(rescueQueue(runAudit(fragile3, heavy, { now: NOW }), { limit: 1 })).toHaveLength(1)
  })
  it('expands a session with suppressed siblings within the budget', () => {
    const a = runAudit(fragile3, heavy, { now: NOW })
    const ex = expandSession([1], a, 1)
    expect(ex.added).toHaveLength(1)
    expect(ex.added[0]!.becauseOf).toBe(1)
    expect(ex.ids).toEqual([1, ex.added[0]!.cardId])
    expect(expandSession([9], a, 5).added).toEqual([])
    expect(expandSession([1], a, 0).added).toEqual([])
  })
  it('interleaves clusters so competitors are not back to back', () => {
    const a = runAudit(fragile3, heavy, { now: NOW })
    const order = interleaveByCluster([1, 2, 3, 9, 10], a)
    expect(order).toHaveLength(5)
    expect(new Set(order)).toEqual(new Set([1, 2, 3, 9, 10]))
    expect(order.slice(0, 3)).toEqual([1, 9, 10])
  })
  it('summarizes with caveats and handles the empty case', () => {
    const none = summarizeAudit(runAudit([OTHER], [], { now: NOW }))
    expect(none.headline).toMatch(/No competing cards/)
    const r = summarizeAudit(runAudit(fragile3, heavy, { now: NOW }))
    expect(r.headline.length).toBeGreaterThan(10)
    expect(r.caveats[0]).toMatch(/heuristic/)
  })
  it('refuses to scan past the card cap and says so', () => {
    const many = Array.from({ length: 1600 }, (_, i) => card(1000 + i, `Unique cue ${i}`, `t${i}`))
    const a = runAudit(many, [], { now: NOW })
    expect(a.truncatedScope).toBe(true)
    expect(a.scanned).toBe(1500)
    expect(summarizeAudit(a).caveats.join(' ')).toMatch(/1500/)
  })
})
