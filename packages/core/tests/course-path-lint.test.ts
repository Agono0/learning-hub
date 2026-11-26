import { describe, expect, it } from 'vitest'
import { buildCourseModel, lintCourse } from '../src/course-path'
import { basicModel, course } from './course-path-fixtures'

const codes = (f: ReturnType<typeof lintCourse>) => f.map((x) => `${x.code}:${x.subject}`).sort()

describe('lintCourse', () => {
  it('has nothing to say about a clean course', () => {
    expect(lintCourse(basicModel())).toEqual([])
  })

  it('finds structural problems with hints', () => {
    const m = buildCourseModel(
      course(
        [
          ['a', []],
          ['orphan', ['a']],
        ],
        [
          [
            'm',
            [
              { slug: 'dup', est: 10, skills: ['a'] },
              { slug: 'dup', est: 10, skills: [] },
              { slug: 'long', est: 200, skills: ['a', 'missing'] },
              { slug: 'noest', skills: ['a'] },
            ],
          ],
        ],
      ),
    )
    const f = lintCourse(m)
    expect(codes(f)).toEqual(
      [
        'duplicate-lesson-slug:dup',
        'lesson-without-skills:dup',
        'lesson-too-long:long',
        'lesson-without-estimate:noest',
        'skill-never-trained:orphan',
        'unknown-skill-ref:missing',
      ].sort(),
    )
    for (const x of f) {
      expect(x.hint.length).toBeGreaterThan(10)
      expect(['warning', 'info']).toContain(x.severity)
    }
  })

  it('flags a lesson that comes before every lesson training its prerequisite', () => {
    const m = buildCourseModel(
      course(
        [
          ['base', []],
          ['adv', ['base']],
        ],
        [
          [
            'm',
            [
              { slug: 'adv-l', est: 10, skills: ['adv'] },
              { slug: 'base-l', est: 10, skills: ['base'] },
            ],
          ],
        ],
      ),
    )
    expect(codes(lintCourse(m))).toEqual(['prerequisite-taught-later:adv-l'])
  })

  it('does not flag when any earlier lesson trains the prerequisite', () => {
    const m = buildCourseModel(
      course(
        [
          ['base', []],
          ['adv', ['base']],
        ],
        [
          [
            'm',
            [
              { slug: 'b1', est: 10, skills: ['base'] },
              { slug: 'adv-l', est: 10, skills: ['adv'] },
              { slug: 'b2', est: 10, skills: ['base'] },
            ],
          ],
        ],
      ),
    )
    expect(lintCourse(m)).toEqual([])
  })

  it('warns about deep chains only past the limit', () => {
    const names = ['s0', 's1', 's2', 's3', 's4', 's5', 's6']
    const m = buildCourseModel(
      course(
        names.map((n, i): [string, string[]] => [n, i ? [names[i - 1]!] : []]),
        [['m', names.map((n) => ({ slug: `l-${n}`, est: 10, skills: [n] }))]],
      ),
    )
    expect(codes(lintCourse(m))).toEqual(['chain-too-deep:s6'])
    expect(lintCourse(m, { maxChainDepth: 6 })).toEqual([])
    expect(codes(lintCourse(m, { maxChainDepth: 4 }))).toEqual([
      'chain-too-deep:s5',
      'chain-too-deep:s6',
    ])
  })

  it('respects maxLessonMinutes', () => {
    expect(codes(lintCourse(basicModel(), { maxLessonMinutes: 35 }))).toEqual([
      'lesson-too-long:l2',
      'lesson-too-long:l3',
    ])
  })
})
