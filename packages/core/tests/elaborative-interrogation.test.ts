import { describe, expect, it } from 'vitest'
import {
  buildPrompt,
  buildQueue,
  classifyFact,
  contentWords,
  eiFactSchema,
  extractFacts,
  gradeExplanation,
  initialState,
  nextStyle,
  novelShare,
  overlapWithSource,
  startingLevel,
  summarize,
  tokenize,
  updateState,
} from '../src/elaborative-interrogation'

const fact = eiFactSchema.parse({
  id: 'a',
  statement:
    'Spaced practice improves long-term retention because each retrieval strengthens the memory trace.',
  keyTerms: ['retrieval', 'memory', 'retention'],
})
const GOOD =
  'Each time you retrieve something it takes effort, and that effort strengthens the memory so retention lasts longer. For example, when I recall vocabulary after a week it sticks better, because forgetting makes the retrieval harder and therefore more useful.'

describe('tokenizing and classification', () => {
  it('tokenizes and stems content words', () => {
    expect(tokenize("Don't STOP, 2 cats!")).toEqual(["don't", 'stop', '2', 'cats'])
    expect(contentWords('The cats are running')).toContain('cat')
  })
  it('classifies fact kinds', () => {
    expect(classifyFact('Heat causes metal to expand.')).toBe('causal')
    expect(classifyFact('Cats differ from dogs in gait.')).toBe('contrast')
    expect(classifyFact('The heart pumps 5 litres a minute.')).toBe('quantitative')
    expect(classifyFact('A mammal is a warm-blooded animal.')).toBe('categorical')
    expect(classifyFact('Rome fell in time.')).toBe('general')
  })
})

describe('prompts', () => {
  it('builds a prompt containing the statement and a level', () => {
    const p = buildPrompt(fact, 'transfer')
    expect(p.text).toContain(fact.statement)
    expect(p.level).toBe(4)
    expect(buildPrompt(fact, 'why-true').level).toBe(1)
  })
  it('maps prior knowledge to a starting level', () => {
    expect([0, 0.3, 0.6, 0.9].map(startingLevel)).toEqual([1, 2, 3, 4])
  })
})

describe('grading', () => {
  it('flags a copied statement', () => {
    const g = gradeExplanation(fact, fact.statement)
    expect(g.copied).toBe(true)
    expect(g.band).toBe('restating')
    expect(g.feedback.join(' ')).toMatch(/own words/)
  })
  it('scores a developed causal answer high', () => {
    const g = gradeExplanation(fact, GOOD)
    expect(g.total).toBeGreaterThanOrEqual(62)
    expect(['solid', 'deep']).toContain(g.band)
    expect(g.rubric).toHaveLength(6)
    expect(g.total).toBeLessThanOrEqual(100)
  })
  it('scores a tiny hedged answer low and ranks it below the good one', () => {
    const weak = gradeExplanation(fact, 'idk maybe it helps')
    expect(weak.band).toBe('shallow')
    expect(weak.total).toBeLessThan(gradeExplanation(fact, GOOD).total)
    expect(weak.feedback.length).toBeGreaterThan(1)
  })
  it('handles empty input', () => {
    const g = gradeExplanation(fact, '')
    expect(g.total).toBe(0)
    expect(g.copied).toBe(false)
  })
  it('overlap and novelty are in 0..1 and complementary-ish', () => {
    expect(overlapWithSource(fact.statement, fact.statement)).toBe(1)
    expect(novelShare(fact.statement, fact.statement)).toBe(0)
    expect(novelShare(fact.statement, 'zebra quantum lattice')).toBe(1)
    expect(overlapWithSource('', 'x')).toBe(0)
  })
})

describe('adaptive state', () => {
  it('raises level after two good answers and spaces reviews', () => {
    let s = { ...initialState(fact), level: 2 }
    expect(initialState(fact).level).toBe(3)
    const good = gradeExplanation(fact, GOOD)
    s = updateState(s, good, 'why-true', 10)
    expect(s.attempts).toBe(1)
    expect(s.dueDay).toBeGreaterThan(10)
    const first = s.intervalDays
    s = updateState(s, good, 'mechanism', 12)
    expect(s.level).toBe(3)
    expect(s.intervalDays).toBeGreaterThan(first)
    expect(s.bestScore).toBe(good.total)
  })
  it('drops level and returns tomorrow after a weak answer', () => {
    const s0 = { ...initialState(fact), level: 3, intervalDays: 8 }
    const s = updateState(s0, gradeExplanation(fact, 'idk'), 'why-true', 5)
    expect(s.level).toBe(2)
    expect(s.dueDay).toBe(6)
    expect(s.streak).toBe(0)
  })
  it('rotates through unseen styles then cycles', () => {
    const s = { ...initialState(fact), level: 4 }
    const seen = new Set<string>()
    let cur = s
    for (let i = 0; i < 6; i++) {
      const st = nextStyle(cur)
      seen.add(st)
      cur = { ...cur, stylesSeen: [...cur.stylesSeen, st], attempts: cur.attempts + 1 }
    }
    expect(seen.size).toBe(6)
    expect(nextStyle(cur)).toBeTruthy()
  })
})

describe('queue and summary', () => {
  const f2 = eiFactSchema.parse({
    id: 'b',
    statement: 'Mitochondria make most of the cell energy through respiration.',
    priorKnowledge: 0.1,
  })
  const f3 = eiFactSchema.parse({
    id: 'c',
    statement: 'The French Revolution began in 1789 after a financial crisis.',
    priorKnowledge: 0.9,
  })
  it('orders overdue before new, skips not-due, respects limit', () => {
    const states = [
      { ...initialState(fact), attempts: 2, dueDay: 3 },
      { ...initialState(f2), attempts: 1, dueDay: 99 },
    ]
    const q = buildQueue([fact, f2, f3], states, 10)
    expect(q.map((i) => i.fact.id)).toEqual(['a', 'c'])
    expect(q[0]?.overdueDays).toBe(7)
    expect(buildQueue([fact, f2, f3], [], 0, 1)).toHaveLength(1)
    expect(buildQueue([fact, f2, f3], [], 0)[0]?.fact.id).toBe('b')
  })
  it('summarizes', () => {
    const states = [
      { ...initialState(fact), attempts: 1, bestScore: 85, lastScore: 85, dueDay: 50 },
    ]
    const s = summarize([fact, f2], states, 10)
    expect(s).toMatchObject({ facts: 2, attempted: 1, due: 1, meanBest: 85, deep: 1 })
    expect(s.weakest).toEqual(['a'])
  })
})

describe('fact extraction', () => {
  it('extracts sentence-length facts with key terms', () => {
    const text =
      'Short one. Photosynthesis converts sunlight into chemical energy inside the chloroplasts of plant cells. Hi there. The Calvin cycle fixes carbon dioxide into glucose using ATP from the light reactions.'
    const facts = extractFacts(text)
    expect(facts).toHaveLength(2)
    expect(facts[0]?.id).toBe('f1')
    expect(facts[0]?.keyTerms.length).toBeGreaterThan(0)
    expect(extractFacts('')).toEqual([])
  })
})
