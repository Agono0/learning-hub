import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  EXERCISE_CATALOG,
  clozeBlanks,
  clozePrompt,
  editDistance,
  exerciseSchema,
  gradeExercise,
  matchText,
  normalizeAnswer,
  scoreToGrade,
  type Exercise,
} from '../src/practice'

const ex = (e: unknown) => exerciseSchema.parse(e) as Exercise

describe('text matching', () => {
  it('normalizes case, accents, whitespace and edge punctuation', () => {
    expect(normalizeAnswer('  Café,  au   LAIT! ')).toBe('cafe, au lait')
  })

  it('computes edit distance', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3)
    expect(editDistance('', 'abc')).toBe(3)
  })

  it('forgives a typo on long words but not on short ones', () => {
    expect(matchText('Missisippi', ['Mississippi'])).toBe('typo')
    expect(matchText('cot', ['cat'])).toBe('none')
    expect(matchText('Tokyo', ['tokyo'])).toBe('exact')
    expect(matchText('Missisippi', ['Mississippi'], false)).toBe('none')
  })

  it('never accepts empty answers', () => {
    expect(matchText('   ', ['a'])).toBe('none')
  })
})

describe('exercise schema', () => {
  it('accepts every catalog example', () => {
    for (const info of EXERCISE_CATALOG) {
      expect(exerciseSchema.safeParse(info.example).success, info.type).toBe(true)
    }
  })

  it('rejects an mcq whose answer does not index into options', () => {
    expect(
      exerciseSchema.safeParse({ type: 'mcq', prompt: 'q', options: ['a', 'b'], answer: 2 })
        .success,
    ).toBe(false)
  })

  it('rejects a cloze without blanks', () => {
    expect(
      exerciseSchema.safeParse({ type: 'cloze', prompt: 'q', text: 'no blanks' }).success,
    ).toBe(false)
  })

  it('catalog covers every exercise type exactly once', () => {
    const types = EXERCISE_CATALOG.map((c) => c.type)
    expect(new Set(types).size).toBe(types.length)
    expect(types.length).toBe(12)
  })
})

describe('graders', () => {
  it('mcq: correct, wrong with rationale', () => {
    const e = ex({ type: 'mcq', prompt: 'q', options: ['a', 'b'], answer: 1, why: ['nope', 'yes'] })
    expect(gradeExercise(e, { choice: 1 })).toMatchObject({ correct: true, grade: 3 })
    const wrong = gradeExercise(e, { choice: 0 })
    expect(wrong).toMatchObject({ correct: false, grade: 1 })
    expect(wrong.feedback).toContain('nope')
  })

  it('multi: partial credit per decision', () => {
    const e = ex({ type: 'multi', prompt: 'q', options: ['a', 'b', 'c', 'd'], answers: [0, 2] })
    expect(gradeExercise(e, { choices: [0, 2] }).score).toBe(1)
    expect(gradeExercise(e, { choices: [0] }).score).toBe(0.75)
  })

  it('numeric: absolute and relative tolerance', () => {
    const abs = ex({ type: 'numeric', prompt: 'q', answer: 9.81, tolerance: 0.05 })
    expect(gradeExercise(abs, { value: 9.8 }).correct).toBe(true)
    expect(gradeExercise(abs, { value: 9.7 }).correct).toBe(false)
    const rel = ex({ type: 'numeric', prompt: 'q', answer: 1000, relTolerance: 0.01 })
    expect(gradeExercise(rel, { value: 1009 }).correct).toBe(true)
  })

  it('cloze: blanks with alternatives, per-blank credit', () => {
    const e = ex({ type: 'cloze', prompt: 'q', text: '{{H2O|water}} boils at {{100}} °C' })
    expect(clozeBlanks('{{H2O|water}} x {{100}}')).toEqual([['H2O', 'water'], ['100']])
    expect(clozePrompt('a {{b}} c')).toBe('a ____ c')
    expect(gradeExercise(e, { blanks: ['Water', '100'] }).score).toBe(1)
    expect(gradeExercise(e, { blanks: ['water', '90'] }).score).toBe(0.5)
  })

  it('ordering, matching, categorize: positional credit', () => {
    const o = ex({ type: 'ordering', prompt: 'q', items: ['a', 'b', 'c', 'd'] })
    expect(gradeExercise(o, { order: [0, 1, 2, 3] }).correct).toBe(true)
    expect(gradeExercise(o, { order: [1, 0, 2, 3] }).score).toBe(0.5)

    const m = ex({
      type: 'matching',
      prompt: 'q',
      pairs: [
        { left: 'a', right: '1' },
        { left: 'b', right: '2' },
      ],
    })
    expect(
      gradeExercise(m, {
        pairs: [
          [0, 0],
          [1, 1],
        ],
      }).correct,
    ).toBe(true)
    expect(
      gradeExercise(m, {
        pairs: [
          [0, 1],
          [1, 0],
        ],
      }).score,
    ).toBe(0)

    const c = ex({
      type: 'categorize',
      prompt: 'q',
      categories: [
        { name: 'A', items: ['x'] },
        { name: 'B', items: ['y'] },
      ],
    })
    expect(gradeExercise(c, { placements: { x: 'A', y: 'B' } }).correct).toBe(true)
    expect(gradeExercise(c, { placements: { x: 'B', y: 'B' } }).score).toBe(0.5)
  })

  it('parsons: distractors and missing lines cost credit', () => {
    const e = ex({ type: 'parsons', prompt: 'q', lines: ['a', 'b'], distractors: ['z'] })
    expect(gradeExercise(e, { lines: ['a', 'b'] }).correct).toBe(true)
    expect(gradeExercise(e, { lines: ['a', 'b', 'z'] }).correct).toBe(false)
  })

  it('freetext and code report pending until scored', () => {
    const f = ex({ type: 'freetext', prompt: 'q', rubric: ['point'] })
    expect(gradeExercise(f, { text: 'my answer' }).pending).toBe(true)
    expect(gradeExercise(f, { text: 'my answer', score: 1 }).correct).toBe(true)
    const c = ex({
      type: 'code',
      prompt: 'q',
      language: 'javascript',
      tests: [{ call: 'f()', expected: 1 }],
    })
    expect(gradeExercise(c, { source: '' }).pending).toBe(true)
    expect(gradeExercise(c, { source: '', passed: 3, total: 4 }).score).toBe(0.75)
  })

  it('malformed answers score 0 instead of throwing', () => {
    const e = ex({ type: 'truefalse', prompt: 'q', answer: true })
    expect(gradeExercise(e, { nope: 1 })).toMatchObject({ score: 0, correct: false })
  })
})

describe('properties', () => {
  it('scoreToGrade is monotonic and only Good for a full score', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (a, b) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a]
          expect(scoreToGrade(lo)).toBeLessThanOrEqual(scoreToGrade(hi))
          expect(scoreToGrade(lo) === 3).toBe(lo >= 1)
        },
      ),
    )
  })

  it('every grader keeps score in [0,1] for arbitrary answers', () => {
    const exercises = EXERCISE_CATALOG.map((c) => ex(c.example))
    fc.assert(
      fc.property(fc.constantFrom(...exercises), fc.anything(), (e, answer) => {
        const r = gradeExercise(e, answer)
        expect(r.score).toBeGreaterThanOrEqual(0)
        expect(r.score).toBeLessThanOrEqual(1)
        expect(r.correct).toBe(r.score >= 1)
      }),
    )
  })

  it('an answer always matches itself exactly', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => normalizeAnswer(s).length > 0),
        (s) => {
          expect(matchText(s, [s])).toBe('exact')
        },
      ),
    )
  })
})

describe('exercise cards', () => {
  it('validates exercise card content through validateCardContent', async () => {
    const { validateCardContent } = await import('../src/cards')
    const good = validateCardContent('exercise', {
      type: 'truefalse',
      prompt: 'Sky is blue',
      answer: true,
    })
    expect(good.ok).toBe(true)
    const bad = validateCardContent('exercise', { type: 'truefalse', prompt: '' })
    expect(bad.ok).toBe(false)
  })

  it('renders every catalog exercise to a non-empty text front/back', async () => {
    const { exerciseToText } = await import('../src/practice')
    for (const info of EXERCISE_CATALOG) {
      const t = exerciseToText(ex(info.example))
      expect(t.front.length, info.type).toBeGreaterThan(0)
      expect(t.back.length, info.type).toBeGreaterThan(0)
    }
  })
})
