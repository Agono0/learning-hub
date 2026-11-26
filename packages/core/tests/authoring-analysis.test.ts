import { describe, expect, it } from 'vitest'
import {
  ALL_RULES,
  BLOOM_LEVEL_OF_VERB,
  alignCourse,
  analyzeCourse,
  formatCanReach,
  readObjective,
  reportToMarkdown,
  ruleInfo,
  unmappedBloomVerbs,
} from '../src/curriculum/authoring'
import { BLOOM_VERBS } from '../src/curriculum/pedagogy'
import { edit, makeCourse } from './authoring-fixtures'

const ids = (c: ReturnType<typeof makeCourse>, ignore: string[] = []) =>
  analyzeCourse(c, { ignore }).findings.map((f) => f.ruleId)

describe('bloom reading', () => {
  it('maps every known verb to a level', () => {
    expect(unmappedBloomVerbs()).toEqual([])
    for (const v of BLOOM_VERBS) expect(BLOOM_LEVEL_OF_VERB[v]).toBeTruthy()
  })
  it('reads the leading verb and strips ability preambles', () => {
    expect(readObjective('Explain how joins work')).toEqual({
      verb: 'explain',
      level: 'understand',
      object: 'how joins work',
    })
    expect(readObjective('You will be able to design a schema').level).toBe('create')
    expect(readObjective('Know your data').level).toBeNull()
    expect(readObjective('').verb).toBe('')
  })
  it('compares format ceilings with a level', () => {
    expect(formatCanReach('truefalse', 'apply')).toBe(false)
    expect(formatCanReach('code', 'create')).toBe(true)
  })
})

describe('alignment', () => {
  it('matches exercises that share terms with the objective', () => {
    const m = alignCourse(makeCourse())
    const row = m.rows.find((r) => r.lessonSlug === 'select-where')!
    expect(row.matchedCount).toBeGreaterThan(0)
    expect(row.level).toBe('create')
  })
  it('flags a lesson whose exercises share nothing with its objective', () => {
    const c = edit((x) => {
      x.modules[0]!.lessons[1]!.objective = 'Evaluate indexing strategies for large tables'
    })
    const f = analyzeCourse(c).findings.find((x) => x.ruleId === 'align.objective-unmatched')
    expect(f?.path).toBe('modules[0].lessons[1]')
    expect(f?.evidence).toMatch(/Best overlap/)
    expect(f?.falsePositive.length).toBeGreaterThan(10)
  })
  it('notes lessons without exercises', () => {
    const c = edit((x) => (x.modules[0]!.lessons[1]!.exercises = []))
    expect(ids(c)).toContain('align.objective-no-exercises')
  })
  it('uses a shared skill link as a match', () => {
    const c = edit((x) => {
      x.modules[0]!.lessons[1]!.objective = 'Evaluate indexing strategies for large tables'
      x.modules[0]!.lessons[1]!.exercises[0]!.skill = 'select'
    })
    expect(ids(c)).not.toContain('align.objective-unmatched')
  })
  it('reports outcomes no lesson covers', () => {
    const f = analyzeCourse(makeCourse()).findings.filter(
      (x) => x.ruleId === 'align.outcome-uncovered',
    )
    expect(f.map((x) => x.path)).toEqual(['outcomes[2]'])
    expect(f[0]!.severity).toBe('warning')
  })
  it('notes outcomes with no exam item', () => {
    const f = analyzeCourse(makeCourse()).findings.filter(
      (x) => x.ruleId === 'align.outcome-not-assessed',
    )
    expect(f.map((x) => x.path)).toEqual(['outcomes[0]'])
  })
  it('counts objective levels', () => {
    const m = alignCourse(makeCourse())
    expect(m.levelCounts.apply).toBe(1)
    expect(m.levelCounts.create).toBe(1)
    expect(m.levelCounts.understand).toBe(1)
  })
})

describe('exercise lint', () => {
  const withEx = (ex: Record<string, unknown>) =>
    edit((c) => {
      c.modules[0]!.lessons[1]!.exercises = [ex as never]
    })
  const rules = (ex: Record<string, unknown>) => ids(withEx(ex)).filter((r) => r.startsWith('ex.'))

  it('flags a much longer correct MCQ option', () => {
    expect(
      rules({
        type: 'mcq',
        prompt: 'Which statement describes an index in a database?',
        options: [
          'A thing',
          'A tool',
          'A data structure that speeds up lookups on one or more columns',
          'A view',
        ],
        answer: 2,
        explanation: 'x',
      }),
    ).toContain('ex.mcq-longest-correct')
  })
  it('flags all-of-the-above and duplicate options', () => {
    const r = rules({
      type: 'mcq',
      prompt: 'Which is a SQL keyword here?',
      options: ['SELECT', 'select', 'All of the above'],
      answer: 0,
      explanation: 'x',
    })
    expect(r).toContain('ex.mcq-all-none')
    expect(r).toContain('ex.mcq-duplicate-options')
  })
  it('flags a hint that contains the answer', () => {
    expect(
      rules({
        type: 'typein',
        prompt: 'Which command removes a table entirely?',
        answers: ['DROP TABLE'],
        hint: 'It starts with DROP TABLE and a name.',
        explanation: 'x',
      }),
    ).toContain('ex.hint-leaks-answer')
  })
  it('flags numeric decimals without tolerance', () => {
    expect(
      rules({
        type: 'numeric',
        prompt: 'What is the average of 1 and 2?',
        answer: 1.5,
        explanation: 'x',
      }),
    ).toContain('ex.numeric-no-tolerance')
    expect(
      rules({
        type: 'numeric',
        prompt: 'What is the average of 1 and 2?',
        answer: 1.5,
        tolerance: 0.01,
        explanation: 'x',
      }),
    ).not.toContain('ex.numeric-no-tolerance')
  })
  it('flags cloze with function-word blanks and many blanks', () => {
    expect(
      rules({
        type: 'cloze',
        prompt: 'Complete the sentence.',
        text: 'SELECT is {{the}} keyword',
        explanation: 'x',
      }),
    ).toContain('ex.cloze-stopword-blank')
    expect(
      rules({
        type: 'cloze',
        prompt: 'Complete the query.',
        text: '{{a}} {{b}} {{c}} {{d}} {{e}} text here and there',
        explanation: 'x',
      }),
    ).toContain('ex.cloze-many-blanks')
  })
  it('flags parsons distractors equal to real lines', () => {
    expect(
      rules({
        type: 'parsons',
        prompt: 'Arrange the lines of this query.',
        lines: ['SELECT *', 'FROM t'],
        distractors: ['FROM t'],
        explanation: 'x',
      }),
    ).toContain('ex.parsons-distractor-matches')
  })
  it('flags matching sides that repeat and categories that overlap', () => {
    expect(
      rules({
        type: 'matching',
        prompt: 'Match the terms with their meanings.',
        pairs: [
          { left: 'a', right: 'x' },
          { left: 'b', right: 'x' },
        ],
        explanation: 'x',
      }),
    ).toContain('ex.matching-duplicate-side')
    expect(
      rules({
        type: 'categorize',
        prompt: 'Sort the items into the right group.',
        categories: [
          { name: 'A', items: ['one', 'two'] },
          { name: 'B', items: ['One'] },
        ],
        explanation: 'x',
      }),
    ).toContain('ex.categorize-overlap')
  })
  it('flags code exercises with no checks and free text with vague rubric', () => {
    expect(
      rules({
        type: 'code',
        prompt: 'Write a function that adds two numbers.',
        language: 'javascript',
        explanation: 'x',
      }),
    ).toContain('ex.code-no-checks')
    const r = rules({
      type: 'freetext',
      prompt: 'Explain why indexes speed up reads.',
      rubric: ['good'],
      explanation: 'x',
    })
    expect(r).toContain('ex.freetext-vague-rubric')
    expect(r).toContain('ex.freetext-no-model')
    expect(r).toContain('ex.freetext-single-criterion')
  })
  it('flags truefalse absolutes but not hedged statements', () => {
    expect(
      rules({
        type: 'truefalse',
        prompt: 'A query always returns rows.',
        answer: false,
        explanation: 'x',
      }),
    ).toContain('ex.tf-absolute')
    expect(
      rules({
        type: 'truefalse',
        prompt: 'A query can sometimes return no rows.',
        answer: true,
        explanation: 'x',
      }),
    ).not.toContain('ex.tf-absolute')
  })
  it('flags negative stems and short prompts', () => {
    expect(
      rules({
        type: 'mcq',
        prompt: 'Which of these is NOT a SQL clause?',
        options: ['WHERE', 'FROM', 'THEN'],
        answer: 2,
        explanation: 'x',
      }),
    ).toContain('ex.prompt-negation')
    expect(
      rules({ type: 'typein', prompt: 'Keyword?', answers: ['SELECT'], explanation: 'x' }),
    ).toContain('ex.prompt-short')
  })
  it('flags duplicate ids inside a lesson and single-format lessons', () => {
    const c = edit((x) => {
      x.modules[0]!.lessons[1]!.exercises = Array.from({ length: 5 }, (_, i) => ({
        id: i < 2 ? 'same' : `t${i}`,
        type: 'truefalse' as const,
        prompt: `Statement number ${i} about sorting is true here.`,
        answer: true,
        explanation: 'x',
      }))
    })
    const r = ids(c)
    expect(r).toContain('ex.id-duplicate')
    expect(r).toContain('lesson.single-format')
    expect(r).toContain('lesson.recognition-only')
    expect(r).toContain('lesson.difficulty-flat')
  })
  it('flags skewed correct-answer positions across a course', () => {
    const c = edit((x) => {
      x.modules[0]!.lessons[1]!.exercises = Array.from({ length: 9 }, (_, i) => ({
        id: `m${i}`,
        type: 'mcq' as const,
        prompt: `Question ${i} about sorting rows in a query result?`,
        options: [`alpha ${i}`, `beta ${i}`, `gamma ${i}`],
        answer: 0,
        explanation: 'x',
      }))
    })
    expect(ids(c)).toContain('course.mcq-position-skew')
  })
  it('leaves the clean fixture free of warnings', () => {
    const w = analyzeCourse(makeCourse()).findings.filter((f) => f.severity === 'warning')
    expect(w.map((f) => f.ruleId)).toEqual(['align.outcome-uncovered'])
  })
})

describe('duplicates', () => {
  it('finds near-duplicate exercises across lessons', () => {
    const c = edit((x) => {
      const copy = JSON.parse(JSON.stringify(x.modules[0]!.lessons[0]!.exercises[0]!))
      copy.id = 'dup1'
      copy.prompt = 'Which clause filters rows in a SELECT query ?'
      x.modules[1]!.lessons[0]!.exercises.push(copy)
    })
    expect(ids(c)).toContain('dup.exercise-near-duplicate')
  })
  it('flags exam items that copy lesson items', () => {
    const c = edit((x) => {
      x.finalExam!.exercises.push(
        JSON.parse(JSON.stringify(x.modules[0]!.lessons[0]!.exercises[0]!)),
      )
    })
    expect(ids(c)).toContain('dup.exam-copies-lesson')
  })
  it('flags repeated lesson titles', () => {
    const c = edit((x) => (x.modules[1]!.lessons[0]!.title = 'select and where'))
    expect(ids(c)).toContain('dup.lesson-title')
  })
  it('does not flag different questions', () => {
    expect(ids(makeCourse())).not.toContain('dup.exercise-near-duplicate')
  })
})

describe('time estimates', () => {
  it('compares author minutes with a content reference and says so', () => {
    const c = edit((x) => (x.modules[0]!.lessons[0]!.estMinutes = 1))
    const f = analyzeCourse(c).findings.find((x) => x.ruleId === 'time.lesson-estimate-low')
    expect(f?.evidence).toContain('not measured learner time')
  })
  it('flags estHours that disagree with the minutes', () => {
    const c = edit((x) => (x.estHours = 10))
    expect(ids(c)).toContain('time.hours-mismatch')
  })
  it('flags tight exam limits', () => {
    const c = edit((x) => {
      x.finalExam!.minutes = 1
      x.finalExam!.exercises = Array.from({ length: 10 }, (_, i) => ({
        type: 'numeric' as const,
        prompt: `Compute value number ${i} for this case.`,
        answer: i,
        explanation: 'x',
      }))
    })
    expect(ids(c)).toContain('time.exam-minutes-tight')
  })
  it('exposes per-lesson references', () => {
    const r = analyzeCourse(makeCourse())
    expect(r.time.lessons).toHaveLength(3)
    expect(r.time.lessons[0]!.referenceMinutes).toBeGreaterThan(0)
    expect(r.time.summary.lessonCount).toBe(3)
  })
})

describe('report', () => {
  it('hides ignored rules and counts them', () => {
    const base = analyzeCourse(makeCourse())
    const r = analyzeCourse(makeCourse(), { ignore: ['align.outcome-uncovered'] })
    expect(r.findings.some((f) => f.ruleId === 'align.outcome-uncovered')).toBe(false)
    expect(r.ignoredCount).toBe(
      base.findings.filter((f) => f.ruleId === 'align.outcome-uncovered').length,
    )
  })
  it('gives every rule id metadata and every finding a known rule', () => {
    const idsSeen = new Set(ALL_RULES.map((r) => r.ruleId))
    expect(idsSeen.size).toBe(ALL_RULES.length)
    const c = edit((x) => {
      x.modules[0]!.lessons[0]!.exercises[0]!.explanation = undefined
    })
    for (const f of analyzeCourse(c).findings) {
      expect(idsSeen.has(f.ruleId)).toBe(true)
      expect(f.evidence.length).toBeGreaterThan(0)
      expect(f.falsePositive.length).toBeGreaterThan(0)
    }
    expect(ruleInfo('ex.mcq-all-none')?.title).toMatch(/above/)
  })
  it('renders markdown with the disclaimer and evidence', () => {
    const md = reportToMarkdown(analyzeCourse(makeCourse()))
    expect(md).toContain('text heuristics')
    expect(md).toContain('Could be wrong when')
  })
  it('is deterministic', () => {
    expect(JSON.stringify(analyzeCourse(makeCourse()))).toBe(
      JSON.stringify(analyzeCourse(makeCourse())),
    )
  })
})
