import { describe, expect, it } from 'vitest'
import {
  describeChange,
  diffCourses,
  diffToMarkdown,
  fieldChanges,
  sharedOrderDiffers,
} from '../src/curriculum/authoring'
import { edit, makeCourse } from './authoring-fixtures'

describe('diffCourses', () => {
  it('is identical for equal courses', () => {
    const d = diffCourses(makeCourse(), makeCourse())
    expect(d.identical).toBe(true)
    expect(diffToMarkdown(d)).toContain('No changes')
  })
  it('reports field changes with before and after', () => {
    const d = diffCourses(
      makeCourse(),
      edit((c) => (c.modules[0]!.lessons[0]!.title = 'Select it')),
    )
    expect(d.changes).toHaveLength(1)
    expect(d.changes[0]).toMatchObject({
      kind: 'changed',
      entity: 'lesson',
      key: 'select-where',
      field: 'title',
      before: 'SELECT and WHERE',
      after: 'Select it',
    })
  })
  it('reports added and removed lessons, skills and projects', () => {
    const a = makeCourse()
    const b = edit((c) => {
      c.modules[0]!.lessons.pop()
      c.skills.push({ slug: 'group', name: 'Grouping', requires: [] })
      c.projects = []
    })
    const d = diffCourses(a, b)
    const kinds = d.changes.map((c) => `${c.kind}:${c.entity}:${c.key}`)
    expect(kinds).toContain('removed:lesson:sorting')
    expect(kinds).toContain('added:skill:group')
    expect(kinds).toContain('removed:project:shop-report')
  })
  it('reports a moved lesson as moved, not removed and added', () => {
    const b = edit((c) => c.modules[1]!.lessons.push(c.modules[0]!.lessons.splice(1, 1)[0]!))
    const d = diffCourses(makeCourse(), b)
    expect(d.counts.moved).toBe(1)
    expect(d.counts.removed).toBe(0)
    expect(d.counts.added).toBe(0)
    expect(describeChange(d.changes.find((c) => c.kind === 'moved')!)).toContain(
      'querying → joining',
    )
  })
  it('reports reordering', () => {
    const b = edit((c) => c.modules[0]!.lessons.reverse())
    const d = diffCourses(makeCourse(), b)
    expect(d.changes.some((c) => c.kind === 'reordered' && c.entity === 'lesson')).toBe(true)
    const m = edit((c) => c.modules.reverse())
    expect(
      diffCourses(makeCourse(), m).changes.some(
        (c) => c.kind === 'reordered' && c.entity === 'module',
      ),
    ).toBe(true)
  })
  it('matches exercises by id and edits by similarity when ids are missing', () => {
    const a = edit((c) => {
      for (const e of c.modules[0]!.lessons[0]!.exercises) delete (e as { id?: string }).id
    })
    const b = edit((c) => {
      for (const e of c.modules[0]!.lessons[0]!.exercises) delete (e as { id?: string }).id
      c.modules[0]!.lessons[0]!.exercises[0]!.prompt =
        'Which clause filters the rows in a SELECT query?'
    }, a)
    const d = diffCourses(a, b)
    const ch = d.changes.filter((c) => c.entity === 'exercise')
    expect(ch).toHaveLength(1)
    expect(ch[0]).toMatchObject({
      kind: 'changed',
      field: 'prompt',
      detail: expect.stringMatching(/^matched by similarity 0\.\d+: ".*" paired with "/),
    })
  })
  it('detects added, removed and reordered exercises', () => {
    const b = edit((c) => {
      const ex = c.modules[0]!.lessons[0]!.exercises
      ex.reverse()
      ex.pop()
      c.modules[0]!.lessons[0]!.exercises.push({
        id: 'new',
        type: 'truefalse',
        prompt: 'A brand new statement is true here.',
        answer: true,
      })
    })
    const d = diffCourses(makeCourse(), b)
    expect(
      d.changes
        .filter((c) => c.entity === 'exercise')
        .map((c) => c.kind)
        .sort(),
    ).toEqual(['added', 'removed', 'reordered'])
  })
  it('diffs the final exam, including its removal', () => {
    const d = diffCourses(
      makeCourse(),
      edit((c) => (c.finalExam!.passScore = 0.5)),
    )
    expect(d.changes[0]).toMatchObject({
      entity: 'exam',
      field: 'passScore',
      before: 0.8,
      after: 0.5,
    })
    const gone = diffCourses(
      makeCourse(),
      edit((c) => delete (c as { finalExam?: unknown }).finalExam),
    )
    expect(gone.changes[0]).toMatchObject({ kind: 'removed', entity: 'exam' })
  })
  it('diffs project stages', () => {
    const d = diffCourses(
      makeCourse(),
      edit((c) => {
        c.projects[0]!.stages[0]!.title = 'Planning'
        c.projects[0]!.stages.push({
          slug: 'ship',
          title: 'Ship',
          description: 'Ship it.',
          checklist: [],
        })
      }),
    )
    expect(d.changes.map((c) => `${c.kind}:${c.entity}`)).toEqual(['changed:stage', 'added:stage'])
  })
  it('renders a markdown changelog grouped by entity', () => {
    const md = diffToMarkdown(
      diffCourses(
        makeCourse(),
        edit((c) => (c.title = 'New title')),
      ),
    )
    expect(md).toContain('## Course')
    expect(md).toContain('1 changed')
  })
})

describe('diff helpers', () => {
  it('fieldChanges walks nested objects and arrays', () => {
    expect(fieldChanges({ a: { b: 1 }, c: [1, 2] }, { a: { b: 2 }, c: [1, 3] })).toEqual([
      { field: 'a.b', before: 1, after: 2 },
      { field: 'c', before: [1, 2], after: [1, 3] },
    ])
    expect(fieldChanges([{ x: 1 }], [{ x: 1 }, { x: 2 }])).toEqual([
      { field: '[1]', before: undefined, after: { x: 2 } },
    ])
  })
  it('sharedOrderDiffers ignores additions and removals', () => {
    expect(sharedOrderDiffers(['a', 'b', 'c'], ['a', 'x', 'b', 'c'])).toBe(false)
    expect(sharedOrderDiffers(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe(true)
    expect(sharedOrderDiffers(['a', 'b'], ['b'])).toBe(false)
  })
})
