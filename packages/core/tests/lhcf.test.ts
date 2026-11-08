import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  buildCurriculumPrompt,
  buildImproveCurriculumPrompt,
  courseSizeFor,
  detectLhcfFormat,
  findPrerequisiteCycle,
  lhcfStats,
  normalizeLhcfInput,
  parseCurriculum,
  parseLhcfMarkdown,
  parseMinutes,
  slugify,
  uniqueSlugger,
  validateLhcf,
} from '../src/curriculum'

const examples = resolve(__dirname, '../../../curricula/examples')
const read = (f: string) => readFileSync(join(examples, f), 'utf8')

const minimal = {
  lhcf: 1,
  slug: 'demo',
  title: 'Demo',
  modules: [
    {
      slug: 'm',
      title: 'M',
      lessons: [
        {
          slug: 'l',
          title: 'L',
          objective: 'Explain things',
          exercises: [{ type: 'truefalse', prompt: 'p', answer: true }],
        },
      ],
    },
  ],
}

describe('slugs', () => {
  it('slugifies titles stably', () => {
    expect(slugify('Intro to SQL: Joins!')).toBe('intro-to-sql-joins')
    expect(slugify('Café Crème')).toBe('cafe-creme')
    expect(slugify('مقدمة')).toMatch(/^s-[a-z0-9]+$/)
    expect(slugify('مقدمة')).toBe(slugify('مقدمة'))
  })

  it('hands out unique slugs', () => {
    const next = uniqueSlugger()
    expect([next('a'), next('a'), next('a')]).toEqual(['a', 'a-2', 'a-3'])
  })

  it('always produces valid LHCF slugs', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 80 }), (s) => {
        expect(slugify(s)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      }),
    )
  })
})

describe('normalization (AI-variation repair)', () => {
  it('parses durations', () => {
    expect(parseMinutes('15 min')).toBe(15)
    expect(parseMinutes('1.5h')).toBe(90)
    expect(parseMinutes(20)).toBe(20)
    expect(parseMinutes('soon')).toBeUndefined()
  })

  it('repairs common AI variations and reports every fix', () => {
    const { value, fixes } = normalizeLhcfInput({
      course: {
        name: 'Python 101',
        lessons: [
          {
            name: 'Variables',
            content: 'Theory text',
            duration: '15 minutes',
            quiz: [
              { type: 'multiple_choice', question: 'Pick', choices: ['a', 'b'], answer: 'b' },
              { type: 'true_false', question: 'Yes?', answer: 'true' },
              { type: 'short_answer', question: 'Name?', answer: 'x' },
            ],
          },
        ],
      },
    })
    const v = validateLhcf(value)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    const lesson = v.course.modules[0]!.lessons[0]!
    expect(v.course.slug).toBe('python-101')
    expect(lesson.estMinutes).toBe(15)
    expect(lesson.theory).toEqual([{ body: 'Theory text' }])
    expect(lesson.exercises.map((e) => e.type)).toEqual(['mcq', 'truefalse', 'typein'])
    expect(lesson.exercises[0]).toMatchObject({ answer: 1 })
    expect(fixes.length).toBeGreaterThan(5)
  })
})

describe('validation', () => {
  it('accepts a minimal course and applies defaults', () => {
    const v = validateLhcf(minimal)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.course.certificate.minLessonCompletion).toBe(1)
  })

  it('reports path-addressed errors with hints', () => {
    const v = validateLhcf({ ...minimal, modules: [] })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.errors[0]!.path).toBe('modules')
      expect(v.errors[0]!.hint).toBeTruthy()
    }
  })

  it('rejects prerequisite cycles', () => {
    expect(
      findPrerequisiteCycle(
        new Map([
          ['a', ['b']],
          ['b', ['c']],
          ['c', ['a']],
        ]),
      ),
    ).toEqual(['a', 'b', 'c', 'a'])
    expect(
      findPrerequisiteCycle(
        new Map([
          ['a', ['b']],
          ['b', []],
        ]),
      ),
    ).toBeNull()
    const v = validateLhcf({
      ...minimal,
      skills: [
        { slug: 'x', name: 'X', requires: ['y'] },
        { slug: 'y', name: 'Y', requires: ['x'] },
      ],
    })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.errors.some((e) => /cycle/.test(e.message))).toBe(true)
  })

  it('auto-creates skills that lessons reference', () => {
    const course = structuredClone(minimal) as typeof minimal & {
      modules: { lessons: { skills?: string[] }[] }[]
    }
    course.modules[0]!.lessons[0]!.skills = ['loops']
    const v = validateLhcf(course)
    expect(v.ok && v.course.skills.map((s) => s.slug)).toEqual(['loops'])
  })

  it('warns (not errors) on weak pedagogy', () => {
    const v = validateLhcf({
      ...minimal,
      modules: [
        { slug: 'm', title: 'M', lessons: [{ slug: 'l', title: 'L', objective: 'Know stuff' }] },
      ],
    })
    expect(v.ok).toBe(true)
    expect(v.warnings.map((w) => w.path)).toEqual(
      expect.arrayContaining([
        'modules[0].lessons[0].objective',
        'modules[0].lessons[0].exercises',
      ]),
    )
  })

  it('rejects non-http resource links', () => {
    const mod = minimal.modules[0]!
    const course = {
      ...minimal,
      modules: [
        {
          ...mod,
          lessons: [
            { ...mod.lessons[0]!, resources: [{ title: 'x', url: 'javascript:alert(1)' }] },
          ],
        },
      ],
    }
    expect(validateLhcf(course).ok).toBe(false)
  })
})

describe('parsing every format', () => {
  it('detects formats', () => {
    expect(detectLhcfFormat('{"a":1}')).toBe('json')
    expect(detectLhcfFormat('```json\n{}\n```')).toBe('json')
    expect(detectLhcfFormat('---\ntitle: x\n---\n## M')).toBe('markdown')
    expect(detectLhcfFormat('title: x\nmodules: []')).toBe('yaml')
    expect(detectLhcfFormat('whatever', 'c.yml')).toBe('yaml')
  })

  it.each([
    ['javascript-functions.json', 'json'],
    ['sql-essentials.yaml', 'yaml'],
    ['learning-how-to-learn.md', 'markdown'],
  ])('imports the %s example cleanly', (file, format) => {
    const r = parseCurriculum(read(file), { filename: file })
    expect(r.format).toBe(format)
    if (!r.ok) throw new Error(JSON.stringify(r.errors, null, 2))
    const stats = lhcfStats(r.course)
    expect(stats.lessons).toBeGreaterThanOrEqual(3)
    expect(stats.exercises).toBeGreaterThanOrEqual(8)
    expect(Object.keys(stats.exerciseTypes).length).toBeGreaterThanOrEqual(5)
    expect(stats.projects).toBe(1)
    expect(stats.finalExamQuestions).toBeGreaterThan(0)
    // examples are the quality bar: no pedagogy warnings
    expect(r.warnings).toEqual([])
  })

  it('reads the markdown convention (modules, lessons, objectives, sections, fences)', () => {
    // Raw (pre-validation) parser output; the assertions below check this shape.
    const raw = parseLhcfMarkdown(read('learning-how-to-learn.md')) as {
      modules: Array<{
        lessons: Array<{
          title: string
          objective: string
          theory: Array<{ heading?: string }>
          exercises: unknown[]
        }>
      }>
    }
    expect(raw.modules).toHaveLength(2)
    const lesson = raw.modules[0]!.lessons[0]!
    expect(lesson.title).toBe('The testing effect')
    expect(lesson.objective).toMatch(/^Explain/)
    expect(lesson.theory.map((s) => s.heading)).toContain('Why it works')
    expect(lesson.exercises.length).toBe(3)
  })

  it('never throws on garbage input', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(() => parseCurriculum(s)).not.toThrow()
      }),
    )
  })

  it('round-trips: a validated course re-validates to the same course', () => {
    const r = parseCurriculum(read('sql-essentials.yaml'))
    if (!r.ok) throw new Error('fixture invalid')
    const again = validateLhcf(JSON.parse(JSON.stringify(r.course)))
    expect(again.ok && again.course).toEqual(r.course)
  })
})

describe('prompt templates', () => {
  it('builds a self-contained prompt with the learner profile and every exercise type', () => {
    const p = buildCurriculumPrompt({
      topic: 'Linear algebra',
      goal: 'Pass my exam',
      hoursPerWeek: 5,
      weeks: 6,
      language: 'Arabic',
    })
    expect(p).toContain('Linear algebra')
    expect(p).toContain('~30 hours')
    expect(p).toContain('Arabic')
    for (const t of ['mcq', 'numeric', 'cloze', 'code', 'freetext', 'parsons'])
      expect(p).toContain(`\`${t}\``)
    expect(p).toMatch(/ONLY the JSON/)
  })

  it('scales the course size to the time budget', () => {
    expect(courseSizeFor({ hoursPerWeek: 1, weeks: 4 }).modules).toBe('2–3')
    expect(courseSizeFor({}).totalHours).toBeNull()
  })

  it('tells the AI to keep slugs when improving a course', () => {
    expect(buildImproveCurriculumPrompt('{}', 'add a module on joins')).toMatch(
      /KEEP every existing "slug"/,
    )
  })
})

describe('format detection regressions', () => {
  it('does not mistake YAML comment headers for Markdown', () => {
    expect(detectLhcfFormat('# my course\n# notes\nlhcf: 1\ntitle: x')).toBe('yaml')
  })
})
