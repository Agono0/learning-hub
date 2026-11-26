import { describe, expect, it } from 'vitest'
import {
  bandHistogram,
  blendIntervals,
  buildPrompt,
  calibratedLevel,
  calibrationReport,
  classifyBias,
  dedupeFacts,
  dueForecast,
  eiFactSchema,
  gradeToFsrsRating,
  initialState,
  lintFacts,
  newFactBudget,
  nextStyle,
  similarity,
  styleMeans,
  toMarkdown,
  trend,
  type EiAttempt,
} from '../src/elaborative-interrogation'

const mk = (id: string, statement: string) => eiFactSchema.parse({ id, statement })

describe('extended prompt styles', () => {
  it('builds every style for every fact kind with the statement inside', () => {
    const statements = [
      'Heat causes metal to expand when atoms vibrate more.',
      'A mammal is a warm-blooded animal with hair.',
      'The heart pumps 5 litres of blood every minute.',
      'Cats differ from dogs in how they hunt prey.',
      'Rome had many roads across its territory.',
    ]
    const styles = [
      'why-true',
      'why-not-otherwise',
      'mechanism',
      'prerequisite',
      'transfer',
      'contrast-case',
      'analogy',
      'counterexample',
      'predict-outcome',
      'teach-back',
    ] as const
    for (const st of statements) {
      for (const style of styles) {
        const p = buildPrompt(mk('x', st), style)
        expect(p.text).toContain(st)
        expect(p.text.length).toBeGreaterThan(st.length + 10)
      }
    }
  })
  it('unlocks all ten styles at level 4', () => {
    const s = { ...initialState(mk('a', 'Heat causes metal to expand.')), level: 4 }
    const seen = new Set<string>()
    let cur = s
    for (let i = 0; i < 10; i++) {
      const st = nextStyle(cur)
      seen.add(st)
      cur = { ...cur, stylesSeen: [...cur.stylesSeen, st], attempts: cur.attempts + 1 }
    }
    expect(seen.size).toBe(10)
  })
})

describe('calibration', () => {
  it('handles empty input', () => {
    const r = calibrationReport([])
    expect(r.n).toBe(0)
    expect(r.bias).toBe('well-calibrated')
    expect(r.resolution).toBeNull()
  })
  it('detects overconfidence and lowers the level', () => {
    const pts = [90, 85, 80, 95, 88].map((p) => ({ predicted: p, actual: 50 }))
    const r = calibrationReport(pts)
    expect(r.bias).toBe('overconfident')
    expect(r.meanBias).toBeGreaterThan(30)
    expect(r.mae).toBeGreaterThan(30)
    expect(calibratedLevel(3, r)).toBe(2)
    expect(calibratedLevel(1, r)).toBe(1)
  })
  it('detects underconfidence and raises the level', () => {
    const r = calibrationReport([20, 30, 25, 35, 30].map((p) => ({ predicted: p, actual: 70 })))
    expect(r.bias).toBe('underconfident')
    expect(calibratedLevel(3, r)).toBe(4)
    expect(calibratedLevel(4, r)).toBe(4)
  })
  it('keeps the level with fewer than 5 points and reports resolution', () => {
    const r = calibrationReport([
      { predicted: 10, actual: 20 },
      { predicted: 50, actual: 55 },
      { predicted: 90, actual: 85 },
    ])
    expect(calibratedLevel(2, r)).toBe(2)
    expect(r.resolution).toBeGreaterThan(0.9)
    expect(r.brier).toBeLessThan(0.01)
  })
  it('classifies bias with a dead zone', () => {
    expect([9, 8, 0, -8, -9].map(classifyBias)).toEqual([
      'overconfident',
      'well-calibrated',
      'well-calibrated',
      'well-calibrated',
      'underconfident',
    ])
  })
})

describe('scheduler bridge', () => {
  it('maps bands to FSRS ratings', () => {
    expect(gradeToFsrsRating({ band: 'shallow', copied: false })).toBe(1)
    expect(gradeToFsrsRating({ band: 'developing', copied: false })).toBe(2)
    expect(gradeToFsrsRating({ band: 'solid', copied: false })).toBe(3)
    expect(gradeToFsrsRating({ band: 'deep', copied: false })).toBe(4)
    expect(gradeToFsrsRating({ band: 'deep', copied: true })).toBe(1)
  })
  it('blends intervals conservatively', () => {
    expect(blendIntervals(10, 4, { band: 'solid', copied: false })).toBe(4)
    expect(blendIntervals(10, 4, { band: 'deep', copied: false })).toBe(7)
    expect(blendIntervals(10, 4, { band: 'deep', copied: true })).toBe(1)
    expect(blendIntervals(0, 0, { band: 'solid', copied: false })).toBe(1)
  })
  it('forecasts due load and budgets new facts', () => {
    expect(dueForecast([5, 5, 6, 30, 1], 5, 3)).toEqual([3, 1, 0])
    expect(newFactBudget(0)).toBe(5)
    expect(newFactBudget(10)).toBe(2)
    expect(newFactBudget(20)).toBe(0)
  })
})

describe('authoring lint', () => {
  it('flags short, long, relation-less and duplicate facts', () => {
    const facts = [
      mk('a', 'Heat causes metal to expand when atoms vibrate faster.'),
      mk('b', 'Heat causes metal to expand when atoms vibrate faster!'),
      mk('c', 'Short fact here ok'),
      mk('d', 'Rome had many roads across its territory in ancient times.'),
      mk('e', `Water ${'really '.repeat(50)}is wet because of hydrogen bonds.`),
    ]
    const codes = lintFacts(facts).map((i) => `${i.factId}:${i.code}`)
    expect(codes).toContain('b:duplicate')
    expect(codes).toContain('c:too-short')
    expect(codes).toContain('d:no-relation')
    expect(codes).toContain('e:too-long')
    expect(codes).not.toContain('a:duplicate')
  })
  it('computes similarity and dedupes', () => {
    expect(similarity('a b c', '')).toBe(0)
    expect(similarity('Heat expands metal quickly', 'Heat expands metal quickly')).toBe(1)
    const out = dedupeFacts([
      mk('a', 'Heat causes metal to expand when hot.'),
      mk('b', 'Heat causes metal to expand when hot.'),
      mk('c', 'Plants make glucose using sunlight and carbon dioxide.'),
    ])
    expect(out.map((f) => f.id)).toEqual(['a', 'c'])
  })
})

describe('reporting', () => {
  const att = (
    score: number,
    style = 'why-true',
    band: EiAttempt['band'] = 'solid',
  ): EiAttempt => ({ factId: 'a', style, score, band, day: 1 })
  it('builds a histogram with all bands', () => {
    expect(bandHistogram([att(80, 'x', 'deep'), att(70), att(70)])).toEqual({
      restating: 0,
      shallow: 0,
      developing: 0,
      solid: 2,
      deep: 1,
    })
  })
  it('ranks styles by mean ascending', () => {
    const r = styleMeans([att(90, 'a'), att(30, 'b'), att(50, 'b')])
    expect(r[0]).toEqual({ style: 'b', mean: 40, n: 2 })
    expect(r[1]?.style).toBe('a')
  })
  it('computes trend only with enough data', () => {
    expect(trend([att(50)])).toBeNull()
    const xs = [...Array(5).fill(40), ...Array(5).fill(70)].map((s) => att(s))
    expect(trend(xs)).toBe(30)
  })
  it('exports markdown with progress', () => {
    const f = mk('a', 'Heat causes metal to expand when hot.')
    const md = toMarkdown([f], [{ ...initialState(f), attempts: 2, bestScore: 77 }])
    expect(md).toContain('# Elaborative Interrogation bank')
    expect(md).toContain('best 77/100')
    expect(toMarkdown([f], [])).toContain('not attempted')
  })
})
