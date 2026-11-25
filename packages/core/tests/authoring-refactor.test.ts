import { describe, expect, it } from 'vitest'
import {
  applyRefactor,
  describeRefactor,
  previewRefactor,
  type RefactorOp,
} from '../src/curriculum/authoring'
import { edit, makeCourse } from './authoring-fixtures'

describe('previewRefactor', () => {
  it('does not change its input', () => {
    const c = makeCourse()
    const before = JSON.stringify(c)
    previewRefactor(c, { type: 'rename-skill', from: 'select', to: 'select-basics' })
    expect(JSON.stringify(c)).toBe(before)
  })

  it('renames a skill everywhere and counts rewritten references', () => {
    const c = makeCourse()
    const p = previewRefactor(c, {
      type: 'rename-skill',
      from: 'select',
      to: 'select-basics',
      name: 'Basic SELECT',
    })
    expect(p.ok).toBe(true)
    expect(p.course.skills.map((s) => s.slug)).toEqual(['select-basics', 'joins'])
    expect(p.course.skills[1]!.requires).toEqual(['select-basics'])
    expect(p.course.modules[0]!.lessons[0]!.skills).toEqual(['select-basics'])
    expect(p.course.projects[0]!.skills).toEqual(['select-basics'])
    expect(p.course.modules[0]!.lessons[0]!.exercises[0]!.skill).toBe('Basic SELECT')
    expect(p.rewritten).toBe(5)
    expect(p.diff.changes.length).toBeGreaterThan(3)
    expect(JSON.stringify(p.course)).not.toContain('"select"')
  })

  it('refuses a rename onto an existing slug instead of merging', () => {
    const p = previewRefactor(makeCourse(), { type: 'rename-skill', from: 'select', to: 'joins' })
    expect(p.ok).toBe(false)
    expect(p.errors[0]).toMatch(/already exists/)
    expect(p.course.skills).toHaveLength(2)
  })

  it('rejects invalid slugs and unknown targets', () => {
    expect(
      previewRefactor(makeCourse(), { type: 'rename-lesson', from: 'sorting', to: 'Bad Slug' })
        .errors[0],
    ).toMatch(/valid lesson slug/)
    expect(
      previewRefactor(makeCourse(), { type: 'rename-lesson', from: 'nope', to: 'ok' }).errors[0],
    ).toMatch(/No lesson/)
    expect(
      previewRefactor(makeCourse(), { type: 'rename-module', from: 'nope', to: 'ok' }).errors[0],
    ).toMatch(/No module/)
  })

  it('renames lessons and modules and warns about progress', () => {
    const p = previewRefactor(makeCourse(), {
      type: 'rename-lesson',
      from: 'sorting',
      to: 'ordering-rows',
    })
    expect(p.ok).toBe(true)
    expect(p.warnings[0]).toMatch(/progress/)
    expect(p.course.modules[0]!.lessons[1]!.slug).toBe('ordering-rows')
    const m = previewRefactor(makeCourse(), {
      type: 'rename-module',
      from: 'joining',
      to: 'joins-module',
    })
    expect(m.course.modules[1]!.slug).toBe('joins-module')
  })

  it('moves a lesson and keeps modules non-empty', () => {
    const p = previewRefactor(makeCourse(), {
      type: 'move-lesson',
      slug: 'sorting',
      toModule: 'joining',
      index: 0,
    })
    expect(p.ok).toBe(true)
    expect(p.course.modules[1]!.lessons.map((l) => l.slug)).toEqual(['sorting', 'inner-join'])
    expect(p.diff.counts.moved).toBe(1)
    const bad = previewRefactor(makeCourse(), {
      type: 'move-lesson',
      slug: 'inner-join',
      toModule: 'querying',
    })
    expect(bad.ok).toBe(false)
    expect(bad.errors[0]).toMatch(/no lessons/)
  })

  it('reorders lessons and modules only with a complete permutation', () => {
    const ok = previewRefactor(makeCourse(), {
      type: 'reorder-lessons',
      module: 'querying',
      order: ['sorting', 'select-where'],
    })
    expect(ok.ok).toBe(true)
    expect(ok.course.modules[0]!.lessons[0]!.slug).toBe('sorting')
    expect(
      previewRefactor(makeCourse(), {
        type: 'reorder-lessons',
        module: 'querying',
        order: ['sorting'],
      }).ok,
    ).toBe(false)
    expect(
      previewRefactor(makeCourse(), {
        type: 'reorder-lessons',
        module: 'querying',
        order: ['sorting', 'sorting'],
      }).ok,
    ).toBe(false)
    const mods = previewRefactor(makeCourse(), {
      type: 'reorder-modules',
      order: ['joining', 'querying'],
    })
    expect(mods.course.modules.map((m) => m.slug)).toEqual(['joining', 'querying'])
    expect(
      previewRefactor(makeCourse(), { type: 'reorder-modules', order: ['joining', 'x'] }).ok,
    ).toBe(false)
  })

  it('splits a lesson at a theory and exercise index', () => {
    const c = edit((x) => {
      const l = x.modules[0]!.lessons[0]!
      l.theory.push({ heading: 'More', body: 'GROUP BY groups rows.' })
    })
    const op: RefactorOp = {
      type: 'split-lesson',
      slug: 'select-where',
      newSlug: 'group-by-intro',
      newTitle: 'Grouping',
      newObjective: 'Explain how GROUP BY groups rows',
      theoryFrom: 1,
      exercisesFrom: 2,
    }
    const p = previewRefactor(c, op)
    expect(p.ok).toBe(true)
    const [a, b] = p.course.modules[0]!.lessons
    expect(a!.slug).toBe('select-where')
    expect(b!.slug).toBe('group-by-intro')
    expect(a!.theory).toHaveLength(1)
    expect(b!.theory).toHaveLength(1)
    expect(a!.exercises).toHaveLength(2)
    expect(b!.exercises).toHaveLength(1)
    expect(p.warnings.join(' ')).toMatch(/minutes/)
    expect(p.warnings.join(' ')).toMatch(/stay in the original/)
  })

  it('refuses splits that move nothing, empty the lesson or reuse a slug', () => {
    const base = {
      type: 'split-lesson' as const,
      slug: 'select-where',
      newTitle: 'T',
      newObjective: 'Explain things',
    }
    expect(
      previewRefactor(makeCourse(), { ...base, newSlug: 'x', theoryFrom: 1, exercisesFrom: 3 })
        .errors[0],
    ).toMatch(/Nothing would move/)
    expect(
      previewRefactor(makeCourse(), { ...base, newSlug: 'x', theoryFrom: 0, exercisesFrom: 0 })
        .errors[0],
    ).toMatch(/empty/)
    expect(
      previewRefactor(makeCourse(), {
        ...base,
        newSlug: 'sorting',
        theoryFrom: 0,
        exercisesFrom: 1,
      }).errors[0],
    ).toMatch(/already exists/)
    expect(
      previewRefactor(makeCourse(), { ...base, newSlug: 'x', theoryFrom: 9, exercisesFrom: 1 }).ok,
    ).toBe(false)
    expect(
      previewRefactor(makeCourse(), {
        ...base,
        newSlug: 'x',
        newTitle: ' ',
        theoryFrom: 0,
        exercisesFrom: 1,
      }).ok,
    ).toBe(false)
  })

  it('merges lessons, keeps both contents, and reports what it dropped', () => {
    const p = previewRefactor(makeCourse(), {
      type: 'merge-lessons',
      keep: 'select-where',
      absorb: 'sorting',
    })
    expect(p.ok).toBe(true)
    const l = p.course.modules[0]!.lessons
    expect(l).toHaveLength(1)
    expect(l[0]!.theory).toHaveLength(2)
    expect(l[0]!.exercises.map((e) => e.id)).toEqual(['q1', 'q2', 'q3', 'o1'])
    expect(l[0]!.estMinutes).toBe(35)
    expect(p.warnings.join(' ')).toMatch(/objective of "sorting"/)
  })

  it('renames clashing exercise ids when merging', () => {
    const c = edit((x) => (x.modules[0]!.lessons[1]!.exercises[0]!.id = 'q1'))
    const p = previewRefactor(c, { type: 'merge-lessons', keep: 'select-where', absorb: 'sorting' })
    expect(p.course.modules[0]!.lessons[0]!.exercises.map((e) => e.id)).toContain('sorting-q1')
    expect(p.warnings.join(' ')).toMatch(/clashed/)
  })

  it('moves exercises between lessons', () => {
    const p = previewRefactor(makeCourse(), {
      type: 'move-exercise',
      fromLesson: 'select-where',
      index: 2,
      toLesson: 'sorting',
      toIndex: 0,
    })
    expect(p.ok).toBe(true)
    expect(p.course.modules[0]!.lessons[1]!.exercises.map((e) => e.id)).toEqual(['q3', 'o1'])
    expect(
      previewRefactor(makeCourse(), {
        type: 'move-exercise',
        fromLesson: 'select-where',
        index: 9,
        toLesson: 'sorting',
      }).ok,
    ).toBe(false)
  })

  it('stamps missing exercise ids without touching existing ones', () => {
    const c = edit((x) => {
      delete (x.modules[0]!.lessons[0]!.exercises[1] as { id?: string }).id
    })
    const p = previewRefactor(c, { type: 'stamp-exercise-ids' })
    expect(p.ok).toBe(true)
    expect(p.course.modules[0]!.lessons[0]!.exercises.map((e) => e.id)).toEqual(['q1', 'e1', 'q3'])
    expect(p.course.finalExam!.exercises[0]!.id).toBeUndefined()
    const again = previewRefactor(p.course, { type: 'stamp-exercise-ids', lesson: 'select-where' })
    expect(again.warnings[0]).toMatch(/already has an id/)
  })

  it('removes a skill only when unused or explicitly detached', () => {
    const used = previewRefactor(makeCourse(), { type: 'remove-skill', slug: 'select' })
    expect(used.ok).toBe(false)
    expect(used.errors[0]).toMatch(/Still used by/)
    const forced = previewRefactor(makeCourse(), {
      type: 'remove-skill',
      slug: 'select',
      detach: true,
    })
    expect(forced.ok).toBe(true)
    expect(forced.course.skills.map((s) => s.slug)).toEqual(['joins'])
    expect(forced.course.skills[0]!.requires).toEqual([])
    expect(forced.warnings[0]).toMatch(/Detached/)
  })
})

describe('applyRefactor', () => {
  const op: RefactorOp = { type: 'rename-module', from: 'joining', to: 'joins-module' }
  it('applies with the matching token', () => {
    const c = makeCourse()
    const p = previewRefactor(c, op)
    const r = applyRefactor(c, op, p.token)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.course.modules[1]!.slug).toBe('joins-module')
  })
  it('refuses a stale token after the course changed', () => {
    const c = makeCourse()
    const p = previewRefactor(c, op)
    const changed = edit((x) => (x.title = 'Different'), c)
    const r = applyRefactor(changed, op, p.token)
    expect(r).toMatchObject({ ok: false, reason: 'stale-token' })
  })
  it('refuses a token from a different operation', () => {
    const c = makeCourse()
    const p = previewRefactor(c, op)
    const r = applyRefactor(c, { type: 'rename-module', from: 'joining', to: 'other' }, p.token)
    expect(r).toMatchObject({ ok: false, reason: 'stale-token' })
  })
  it('refuses an invalid operation even with a token', () => {
    const c = makeCourse()
    const bad: RefactorOp = { type: 'rename-module', from: 'nope', to: 'x' }
    const r = applyRefactor(c, bad, previewRefactor(c, bad).token)
    expect(r).toMatchObject({ ok: false, reason: 'invalid' })
  })
  it('describes every operation', () => {
    const all: RefactorOp[] = [
      { type: 'rename-skill', from: 'a', to: 'b' },
      { type: 'rename-lesson', from: 'a', to: 'b' },
      { type: 'rename-module', from: 'a', to: 'b' },
      { type: 'move-lesson', slug: 'a', toModule: 'b' },
      { type: 'reorder-lessons', module: 'a', order: [] },
      { type: 'reorder-modules', order: [] },
      {
        type: 'split-lesson',
        slug: 'a',
        newSlug: 'b',
        newTitle: 't',
        newObjective: 'o',
        theoryFrom: 0,
        exercisesFrom: 0,
      },
      { type: 'merge-lessons', keep: 'a', absorb: 'b' },
      { type: 'move-exercise', fromLesson: 'a', index: 0, toLesson: 'b' },
      { type: 'stamp-exercise-ids' },
      { type: 'remove-skill', slug: 'a' },
    ]
    for (const o of all) expect(describeRefactor(o).length).toBeGreaterThan(5)
  })
})
