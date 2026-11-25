import { describe, expect, it } from 'vitest'
import {
  awardPoints,
  buildDuelPromptsFromCards,
  closeRound,
  createLeague,
  createTournament,
  decideDuel,
  divisionStandings,
  duelEloUpdate,
  isDuelComplete,
  joinLeague,
  leagueLeader,
  openMatches,
  recordMatchResult,
  scoreDuelSide,
  type Duel,
} from '../src/leagues'

describe('league engine', () => {
  it('creates a league, joins players into bronze, and awards points', () => {
    let league = createLeague({ id: 'lg-1', title: 'Study League', seasonStart: '2026-01-05' })
    league = joinLeague(league, 'fox')
    league = joinLeague(league, 'owl')
    league = joinLeague(league, 'fox') // idempotent
    expect(league.players).toHaveLength(2)
    expect(league.players[0].tier).toBe('bronze')

    league = awardPoints(league, { kind: 'reviews', handle: 'fox', count: 30 })
    league = awardPoints(league, { kind: 'focus', handle: 'owl', minutes: 45 })
    league = awardPoints(league, { kind: 'duel', winner: 'fox', loser: 'owl' })
    league = awardPoints(league, { kind: 'reviews', handle: 'ghost', count: 100 }) // ignored
    const fox = league.players.find((p) => p.handle === 'fox')!
    const owl = league.players.find((p) => p.handle === 'owl')!
    expect(fox.points).toBe(30 + 25)
    expect(fox.duelsWon).toBe(1)
    expect(owl.points).toBe(45)
    expect(owl.duelsLost).toBe(1)
  })

  it('closes a round with promotion, relegation and season totals', () => {
    let league = createLeague({
      id: 'lg-1',
      title: 't',
      seasonStart: '2026-01-05',
      promotionSlots: 1,
      relegationSlots: 1,
    })
    for (const h of ['a', 'b', 'c', 'd', 'e', 'f']) league = joinLeague(league, h)
    // bronze: a(60) > b(50) > c(40) > d(30) > e(20) > f(10)
    const scores: Record<string, number> = { a: 60, b: 50, c: 40, d: 30, e: 20, f: 10 }
    for (const [h, n] of Object.entries(scores)) {
      league = awardPoints(league, { kind: 'reviews', handle: h, count: n })
    }
    const result = closeRound(league)
    // 'a' promotes bronze -> silver; 'f' stays (bronze cannot relegate)
    expect(result.promoted).toEqual([{ handle: 'a', from: 'bronze', to: 'silver' }])
    expect(result.relegated).toEqual([])
    expect(result.roundWinners).toContainEqual({ tier: 'bronze', handle: 'a' })
    const a = result.league.players.find((p) => p.handle === 'a')!
    expect(a.tier).toBe('silver')
    expect(a.seasonPoints).toBe(60)
    expect(a.points).toBe(0)
    expect(a.roundsWon).toBe(1)
    expect(result.league.currentRound).toBe(1)

    // next round: silver has only 'a' — she promotes again; bronze 'b' wins
    let l2 = result.league
    l2 = awardPoints(l2, { kind: 'reviews', handle: 'a', count: 5 })
    l2 = awardPoints(l2, { kind: 'reviews', handle: 'b', count: 99 })
    const r2 = closeRound(l2)
    expect(r2.promoted).toContainEqual({ handle: 'a', from: 'silver', to: 'gold' })
    expect(r2.promoted).toContainEqual({ handle: 'b', from: 'bronze', to: 'silver' })
    expect(leagueLeader(r2.league)!.handle).toBe('a')
  })

  it('relegates from higher divisions without double-moving promotees', () => {
    let league = createLeague({
      id: 'lg-2',
      title: 't',
      seasonStart: '2026-01-05',
      promotionSlots: 1,
      relegationSlots: 1,
    })
    for (const h of ['x', 'y', 'z']) league = joinLeague(league, h)
    // move x,y to silver manually via two rounds
    league = awardPoints(league, { kind: 'reviews', handle: 'x', count: 100 })
    league = awardPoints(league, { kind: 'reviews', handle: 'y', count: 90 })
    league = awardPoints(league, { kind: 'reviews', handle: 'z', count: 1 })
    const r = closeRound(league) // x promotes
    r.league = awardPoints(r.league, { kind: 'reviews', handle: 'y', count: 100 })
    r.league = awardPoints(r.league, { kind: 'reviews', handle: 'x', count: 0 })
    const r2 = closeRound(r.league)
    // y promotes bronze->silver; x scored 0 in silver, so no promotion, and
    // alone at the bottom he is relegated back to bronze
    expect(r2.promoted).toContainEqual({ handle: 'y', from: 'bronze', to: 'silver' })
    expect(r2.promoted).not.toContainEqual({ handle: 'x', from: 'silver', to: 'gold' })
    expect(r2.relegated).toContainEqual({ handle: 'x', from: 'silver', to: 'bronze' })
  })

  it('relegates the bottom of a contested division', () => {
    let league = createLeague({
      id: 'lg-3',
      title: 't',
      seasonStart: '2026-01-05',
      promotionSlots: 1,
      relegationSlots: 1,
    })
    for (const h of ['p', 'q', 'r', 's']) league = joinLeague(league, h)
    // round 1: p,q,r promote-worthy scores; move p,q,r up across rounds
    league = awardPoints(league, { kind: 'reviews', handle: 'p', count: 100 })
    league = awardPoints(league, { kind: 'reviews', handle: 'q', count: 90 })
    league = awardPoints(league, { kind: 'reviews', handle: 'r', count: 80 })
    let cur = closeRound(league).league // p -> silver
    cur = awardPoints(cur, { kind: 'reviews', handle: 'q', count: 100 })
    cur = awardPoints(cur, { kind: 'reviews', handle: 'r', count: 90 })
    cur = awardPoints(cur, { kind: 'reviews', handle: 'p', count: 1 })
    cur = closeRound(cur).league // q -> silver; p still silver (only 1 slot each way)
    // now silver has p (1 season-ish) and q; add r next round and relegate bottom
    cur = awardPoints(cur, { kind: 'reviews', handle: 'r', count: 100 })
    cur = awardPoints(cur, { kind: 'reviews', handle: 'p', count: 0 })
    cur = awardPoints(cur, { kind: 'reviews', handle: 'q', count: 50 })
    const r3 = closeRound(cur)
    // gold: p scored 0, no promotion to platinum, and alone at the bottom he
    // is relegated back to silver. silver: q(50) promotes to gold; the
    // vacated silver relegation slot skips q (already promoted this round).
    expect(r3.relegated).toContainEqual({ handle: 'p', from: 'gold', to: 'silver' })
    expect(r3.promoted).toContainEqual({ handle: 'q', from: 'silver', to: 'gold' })
    expect(r3.promoted).toContainEqual({ handle: 'r', from: 'bronze', to: 'silver' })
  })
})

function makeDuel(): Duel {
  return {
    id: 'd1',
    playerA: 'fox',
    playerB: 'owl',
    prompts: [
      { id: 'p1', question: '2+2?', answers: ['4', 'four'] },
      { id: 'p2', question: 'Capital of France?', answers: ['Paris'] },
    ],
    answersA: [],
    answersB: [],
    createdAt: '2026-01-01T00:00:00Z',
  }
}

describe('duels', () => {
  it('scores accuracy with case-insensitive matching and aliases', () => {
    const duel = makeDuel()
    duel.answersA = [
      { promptId: 'p1', answer: ' Four ', elapsedMs: 800 },
      { promptId: 'p2', answer: 'paris', elapsedMs: 1200 },
    ]
    duel.answersB = [
      { promptId: 'p1', answer: '5', elapsedMs: 500 },
      { promptId: 'p2', answer: 'Paris', elapsedMs: 3000 },
    ]
    const a = scoreDuelSide(duel, 'A')
    const b = scoreDuelSide(duel, 'B')
    expect(a.correct).toBe(2)
    expect(a.correctTimeMs).toBe(2000)
    expect(b.correct).toBe(1)
    expect(isDuelComplete(duel)).toBe(true)
    const result = decideDuel(duel)
    expect(result.winner).toBe('fox')
    expect(result.loser).toBe('owl')
    expect(result.draw).toBe(false)
  })

  it('breaks accuracy ties by speed, then honest draws', () => {
    const duel = makeDuel()
    duel.answersA = [{ promptId: 'p1', answer: '4', elapsedMs: 500 }]
    duel.answersB = [{ promptId: 'p1', answer: '4', elapsedMs: 900 }]
    duel.answersA.push({ promptId: 'p2', answer: 'wrong', elapsedMs: 100 })
    duel.answersB.push({ promptId: 'p2', answer: 'alsowrong', elapsedMs: 100 })
    expect(decideDuel(duel).winner).toBe('fox')
    duel.answersB[0].elapsedMs = 500
    expect(decideDuel(duel).draw).toBe(true)
  })

  it('updates duel Elo with winner/loser symmetry and draw handling', () => {
    const r = duelEloUpdate(1500, 1500, false)
    expect(r.winnerAfter).toBeCloseTo(1516, 5)
    expect(r.loserAfter).toBeCloseTo(1484, 5)
    const d = duelEloUpdate(1500, 1500, true)
    expect(d.winnerAfter).toBe(1500)
    expect(d.loserAfter).toBe(1500)
  })
})

describe('tournaments', () => {
  it('builds a seeded bracket with byes for non-power-of-two fields', () => {
    const t = createTournament('t1', 'Cup', ['s1', 's2', 's3', 's4', 's5'], '2026-01-01T00:00:00Z')
    // size 8, 4 round-1 matches; s1, s2, s3 get byes
    const round1 = t.matches.filter((m) => m.round === 1)
    expect(round1).toHaveLength(4)
    expect(round1.filter((m) => m.winner).map((m) => m.winner)).toEqual(['s1', 's2', 's3'])
    // playable now: the round-1 s4-vs-s5 match, plus the round-2 semifinal
    // between bye-winners s1 and s2
    const open = openMatches(t)
    expect(open).toHaveLength(2)
    const r1 = open.find((m) => m.round === 1)!
    expect(r1.playerA).toBe('s4')
    expect(r1.playerB).toBe('s5')
    const r2 = open.find((m) => m.round === 2)!
    expect([r2.playerA, r2.playerB].sort()).toEqual(['s1', 's2'])
  })

  it('advances winners through the bracket to a champion', () => {
    let t = createTournament('t2', 'Cup', ['a', 'b', 'c', 'd'], '2026-01-01T00:00:00Z')
    // round 1: a vs d (pos 0), b vs c (pos 1)
    t = recordMatchResult(t, 1, 0, 'a', 'duel-1')
    t = recordMatchResult(t, 1, 1, 'c', 'duel-2')
    const final = openMatches(t).find((m) => m.round === 2)!
    expect(final.playerA).toBe('a')
    expect(final.playerB).toBe('c')
    t = recordMatchResult(t, 2, 0, 'c', 'duel-3')
    expect(t.champion).toBe('c')
    expect(openMatches(t)).toHaveLength(0)
    expect(() => recordMatchResult(t, 2, 0, 'a', 'duel-4')).toThrow('already decided')
  })

  it('rejects winners who are not in the match', () => {
    const t = createTournament('t3', 'Cup', ['a', 'b'], '2026-01-01T00:00:00Z')
    expect(() => recordMatchResult(t, 1, 0, 'ghost', 'd1')).toThrow('one of the match players')
  })
})

describe('buildDuelPromptsFromCards', () => {
  it('builds prompts from basic, typein and mcq cards and skips the rest', () => {
    const prompts = buildDuelPromptsFromCards(
      [
        { id: 1, content: { basic: { front: '2+2?', back: '4' } } },
        {
          id: 2,
          content: { typein: { question: 'Capital of France?', acceptedAnswers: ['Paris'] } },
        },
        {
          id: 3,
          content: { mcq: { question: 'Sky color?', options: ['blue', 'green'], correctIndex: 0 } },
        },
        { id: 4, content: { cloze: { text: '{{c1::x}}', answers: ['x'], mode: 'basic' } } },
        { id: 5, content: { basic: { front: '', back: 'no question' } } },
      ],
      { seed: 42, limit: 10 },
    )
    expect(prompts).toHaveLength(3)
    const byId = new Map(prompts.map((p) => [p.id, p]))
    expect(byId.get('1')).toMatchObject({ question: '2+2?', answers: ['4'] })
    expect(byId.get('2')!.answers).toEqual(['Paris'])
    expect(byId.get('3')!.answers).toEqual(['blue'])
  })

  it('is deterministic for the same seed and respects the limit', () => {
    const cards = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      content: { basic: { front: `q${i}`, back: `a${i}` } },
    }))
    const a = buildDuelPromptsFromCards(cards, { seed: 7, limit: 5 })
    const b = buildDuelPromptsFromCards(cards, { seed: 7, limit: 5 })
    expect(a).toEqual(b)
    expect(a).toHaveLength(5)
  })
})
