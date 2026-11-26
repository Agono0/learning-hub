import { describe, expect, it } from 'vitest'
import {
  analyzeGraph,
  buildCourseModel,
  isMastered,
  rootBlockers,
  DEFAULT_LESSON_MINUTES,
} from '../src/course-path'
import { lockedSkills } from '../src/curriculum/progress'
import { basicModel, course } from './course-path-fixtures'

describe('course model', () => {
  it('indexes skills and lessons in course order and marks default estimates', () => {
    const m = buildCourseModel(
      course(
        [['a', []]],
        [
          [
            'm',
            [
              { slug: 'x', skills: ['a'] },
              { slug: 'y', est: 10, skills: ['a'] },
            ],
          ],
        ],
      ),
    )
    expect(m.lessons.map((l) => [l.id, l.slug, l.minutes, l.estimated])).toEqual([
      [1, 'x', DEFAULT_LESSON_MINUTES, true],
      [2, 'y', 10, false],
    ])
  })

  it('ignores unknown skill references and lists them', () => {
    const m = buildCourseModel(
      course([['a', ['ghost', 'a']]], [['m', [{ slug: 'x', skills: ['a', 'nope'] }]]]),
    )
    expect(m.unknownSkillRefs).toEqual(['ghost', 'nope'])
    expect(m.prereqs.size).toBe(0) // self requirement and unknown dropped
    expect(m.lessons[0]!.skillIds).toEqual([1])
  })

  it('produces a PrereqMap the existing lock rule accepts', () => {
    const m = basicModel()
    const locked = lockedSkills(m.prereqs, new Map(), 0.7)
    expect([...locked].sort()).toEqual([2, 3, 4]) // b, c, d need unmastered prerequisites
  })
})

describe('graph analysis', () => {
  it('computes transitive ancestors, dependants and depth', () => {
    const g = analyzeGraph(basicModel())
    expect([...g.ancestors.get(3)!].sort()).toEqual([1, 2])
    expect([...g.dependants.get(1)!].sort()).toEqual([2, 3, 4])
    expect([1, 2, 3, 4].map((id) => g.depth.get(id))).toEqual([0, 1, 2, 1])
    expect(g.cycle).toBeNull()
  })

  it('reports a cycle using the validator helper and still terminates', () => {
    const m = buildCourseModel(
      course(
        [
          ['x', ['z']],
          ['y', ['x']],
          ['z', ['y']],
        ],
        [['m', [{ slug: 'l', skills: ['x'] }]]],
      ),
    )
    const g = analyzeGraph(m)
    expect(g.cycle).not.toBeNull()
    expect(g.cycle![0]).toBe(g.cycle![g.cycle!.length - 1])
    expect(g.ancestors.get(1)!.size).toBe(2)
  })

  it('handles a diamond without double counting', () => {
    const m = buildCourseModel(
      course(
        [
          ['a', []],
          ['b', ['a']],
          ['c', ['a']],
          ['d', ['b', 'c']],
        ],
        [['m', [{ slug: 'l', skills: ['a'] }]]],
      ),
    )
    const g = analyzeGraph(m)
    expect(g.ancestors.get(4)!.size).toBe(3)
    expect(g.depth.get(4)).toBe(2)
  })
})

describe('mastery bar and root blockers', () => {
  it('uses the course rule: pKnown 0.815 is about the 0.7 unlock bar', () => {
    expect(isMastered(0.8)).toBe(false)
    expect(isMastered(0.82)).toBe(true)
    expect(isMastered(undefined)).toBe(false)
  })

  it('names the deepest unmastered prerequisites as root blockers', () => {
    const m = basicModel()
    expect(rootBlockers(m, 3, new Map())).toEqual([1])
    expect(rootBlockers(m, 3, new Map([[1, 0.95]]))).toEqual([2])
    expect(
      rootBlockers(
        m,
        3,
        new Map([
          [1, 0.95],
          [2, 0.95],
        ]),
      ),
    ).toEqual([])
  })

  it('never returns an empty answer for a locked skill inside a cycle', () => {
    const m = buildCourseModel(
      course(
        [
          ['x', ['y']],
          ['y', ['x']],
        ],
        [['m', [{ slug: 'l', skills: ['x'] }]]],
      ),
    )
    expect(rootBlockers(m, 1, new Map()).length).toBeGreaterThan(0)
  })
})
