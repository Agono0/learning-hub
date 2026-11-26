import { describe, expect, it } from 'vitest'
import { applyResolutions, diffCourses, mergeCourses } from '../src/curriculum/authoring'
import { edit, makeCourse } from './authoring-fixtures'

describe('mergeCourses', () => {
  it('is clean when nothing changed', () => {
    const b = makeCourse()
    const r = mergeCourses(b, makeCourse(), makeCourse())
    expect(r.status).toBe('clean')
    expect(r.conflicts).toHaveLength(0)
    expect(r.validation?.ok).toBe(true)
  })

  it('combines edits to different fields and different lessons', () => {
    const b = makeCourse()
    const ours = edit((c) => {
      c.title = 'SQL Basics (2nd ed.)'
      c.modules[0]!.lessons[0]!.objective = 'Write SELECT queries that filter rows'
    })
    const theirs = edit((c) => {
      c.modules[1]!.lessons[0]!.title = 'Inner joins'
      c.modules[0]!.lessons[1]!.estMinutes = 10
    })
    const r = mergeCourses(b, ours, theirs)
    expect(r.status).toBe('clean')
    const m = r.merged as {
      title: string
      modules: { lessons: { title: string; estMinutes?: number; objective: string }[] }[]
    }
    expect(m.title).toBe('SQL Basics (2nd ed.)')
    expect(m.modules[1]!.lessons[0]!.title).toBe('Inner joins')
    expect(m.modules[0]!.lessons[1]!.estMinutes).toBe(10)
    expect(m.modules[0]!.lessons[0]!.objective).toBe('Write SELECT queries that filter rows')
    expect(r.autoMerged).toBeGreaterThanOrEqual(4)
  })

  it('reports a field conflict, keeps ours, and applies theirs only on explicit choice', () => {
    const b = makeCourse()
    const ours = edit((c) => (c.modules[0]!.lessons[0]!.title = 'Select + Where'))
    const theirs = edit((c) => (c.modules[0]!.lessons[0]!.title = 'Filtering rows'))
    const r = mergeCourses(b, ours, theirs)
    expect(r.status).toBe('conflicts')
    expect(r.conflicts).toHaveLength(1)
    const c = r.conflicts[0]!
    expect(c.kind).toBe('field')
    expect(c.ours).toBe('Select + Where')
    expect(c.theirs).toBe('Filtering rows')
    expect(r.validation).toBeNull()
    const unresolved = applyResolutions(r, {})
    expect(unresolved.unresolved).toEqual([c.id])
    expect(unresolved.validation).toBeNull()
    const picked = applyResolutions(r, { [c.id]: 'theirs' })
    expect(picked.unresolved).toEqual([])
    const lessons = (picked.merged.modules as { lessons: { title: string }[] }[])[0]!.lessons
    expect(lessons[0]!.title).toBe('Filtering rows')
    expect(picked.validation?.ok).toBe(true)
    const keep = applyResolutions(r, { [c.id]: 'ours' })
    expect((keep.merged.modules as { lessons: { title: string }[] }[])[0]!.lessons[0]!.title).toBe(
      'Select + Where',
    )
  })

  it('merges set-like lists such as lesson skills from both sides', () => {
    const b = makeCourse()
    const ours = edit((c) => c.modules[0]!.lessons[0]!.skills.push('joins'))
    const theirs = edit((c) => (c.tags = ['sql']))
    const r = mergeCourses(b, ours, theirs)
    expect(r.status).toBe('clean')
    const m = r.merged as { tags: string[]; modules: { lessons: { skills: string[] }[] }[] }
    expect(m.tags).toEqual(['sql'])
    expect(m.modules[0]!.lessons[0]!.skills).toEqual(['select', 'joins'])
  })

  it('treats a delete against an edit as a conflict and keeps the edited side', () => {
    const b = makeCourse()
    const ours = edit((c) => c.modules[0]!.lessons.splice(1, 1))
    const theirs = edit((c) => (c.modules[0]!.lessons[1]!.estMinutes = 99))
    const r = mergeCourses(b, ours, theirs)
    expect(r.status).toBe('conflicts')
    const c = r.conflicts.find((x) => x.kind === 'delete-modify')!
    expect(c).toBeTruthy()
    expect((r.merged.modules as { lessons: unknown[] }[])[0]!.lessons).toHaveLength(2)
    const gone = applyResolutions(r, { [c.id]: 'ours' })
    expect((gone.merged.modules as { lessons: unknown[] }[])[0]!.lessons).toHaveLength(1)
    expect(gone.validation?.ok).toBe(true)
  })

  it('accepts a delete when the other side left the item unchanged', () => {
    const b = makeCourse()
    const ours = edit((c) => c.modules[0]!.lessons.splice(1, 1))
    const r = mergeCourses(b, ours, makeCourse())
    expect(r.status).toBe('clean')
    expect((r.merged.modules as { lessons: unknown[] }[])[0]!.lessons).toHaveLength(1)
  })

  it('flags two different adds with the same lesson slug', () => {
    const b = makeCourse()
    const add = (title: string) =>
      edit((c) => {
        const l = JSON.parse(JSON.stringify(c.modules[0]!.lessons[1]!))
        l.slug = 'group-by'
        l.title = title
        c.modules[0]!.lessons.push(l)
      })
    const r = mergeCourses(b, add('GROUP BY'), add('Grouping'))
    expect(r.conflicts.map((c) => c.kind)).toContain('add-add')
    const c = r.conflicts.find((x) => x.kind === 'add-add')!
    const picked = applyResolutions(r, { [c.id]: 'theirs' })
    const titles = (picked.merged.modules as { lessons: { title: string }[] }[])[0]!.lessons.map(
      (l) => l.title,
    )
    expect(titles).toContain('Grouping')
    expect(titles).not.toContain('GROUP BY')
  })

  it('applies a one-sided lesson move and flags a two-sided move', () => {
    const b = makeCourse()
    const move = (to: number) =>
      edit((c) => {
        const l = c.modules[0]!.lessons.splice(1, 1)[0]!
        c.modules[to]!.lessons.push(l)
      })
    const one = mergeCourses(b, makeCourse(), move(1))
    expect(one.status).toBe('clean')
    expect(
      (one.merged.modules as { lessons: { slug: string }[] }[])[1]!.lessons.map((l) => l.slug),
    ).toContain('sorting')

    const extra = edit((c) => {
      c.modules.push({
        slug: 'extra',
        title: 'Extra',
        lessons: [
          { ...JSON.parse(JSON.stringify(c.modules[1]!.lessons[0]!)), slug: 'x1', title: 'X1' },
        ],
      })
    })
    const bb = extra
    const o = edit((c) => c.modules[1]!.lessons.push(c.modules[0]!.lessons.splice(1, 1)[0]!), bb)
    const t = edit((c) => c.modules[2]!.lessons.push(c.modules[0]!.lessons.splice(1, 1)[0]!), bb)
    const two = mergeCourses(bb, o, t)
    const mv = two.conflicts.find((c) => c.kind === 'move')!
    expect(mv).toBeTruthy()
    expect(mv.ours).toBe('joining')
    expect(mv.theirs).toBe('extra')
    const picked = applyResolutions(two, { [mv.id]: 'theirs' })
    expect(
      (picked.merged.modules as { lessons: { slug: string }[] }[])[2]!.lessons.map((l) => l.slug),
    ).toContain('sorting')
    expect(
      (picked.merged.modules as { lessons: { slug: string }[] }[])[1]!.lessons.map((l) => l.slug),
    ).not.toContain('sorting')
  })

  it('keeps one side reorder and conflicts when both reorder differently', () => {
    const b = makeCourse({
      skills: [
        { slug: 'a', name: 'A' },
        { slug: 'b', name: 'B' },
        { slug: 'c', name: 'C' },
      ],
      modules: makeCourse().modules.map((m) => ({
        ...m,
        lessons: m.lessons.map((l) => ({ ...l, skills: [] })),
      })),
      projects: [],
    })
    const names = (r: { merged: Record<string, unknown> }) =>
      (r.merged.skills as { slug: string }[]).map((s) => s.slug)
    const ours = edit((c) => c.skills.reverse(), b)
    const oneSided = mergeCourses(b, ours, b)
    expect(oneSided.status).toBe('clean')
    expect(names(oneSided)).toEqual(['c', 'b', 'a'])
    const theirs = edit((c) => c.skills.unshift(c.skills.splice(1, 1)[0]!), b)
    const both = mergeCourses(b, ours, theirs)
    const oc = both.conflicts.find((c) => c.kind === 'order')!
    expect(oc).toBeTruthy()
    expect(names(both)).toEqual(['c', 'b', 'a'])
    const picked = applyResolutions(both, { [oc.id]: 'theirs' })
    expect((picked.merged.skills as { slug: string }[]).map((s) => s.slug)).toEqual(['b', 'a', 'c'])
  })

  it('merges exercise edits by id and conflicts on the same exercise field', () => {
    const b = makeCourse()
    const ours = edit(
      (c) => (c.modules[0]!.lessons[0]!.exercises[0]!.explanation = 'Because it filters.'),
    )
    const theirs = edit((c) => {
      const e = c.modules[0]!.lessons[0]!.exercises[1]!
      if (e.type === 'typein') e.answers.push('select')
    })
    const r = mergeCourses(b, ours, theirs)
    expect(r.status).toBe('clean')
    const ex = (
      r.merged.modules as {
        lessons: { exercises: { explanation?: string; answers?: string[] }[] }[]
      }[]
    )[0]!.lessons[0]!.exercises
    expect(ex[0]!.explanation).toBe('Because it filters.')
    expect(ex[1]!.answers).toEqual(['SELECT', 'select'])
    const clash = mergeCourses(
      b,
      edit((c) => (c.modules[0]!.lessons[0]!.exercises[0]!.explanation = 'A')),
      edit((c) => (c.modules[0]!.lessons[0]!.exercises[0]!.explanation = 'B')),
    )
    expect(clash.conflicts).toHaveLength(1)
    expect(clash.conflicts[0]!.path).toContain('explanation')
    const picked = applyResolutions(clash, { [clash.conflicts[0]!.id]: 'theirs' })
    const e0 = (
      picked.merged.modules as { lessons: { exercises: { explanation?: string }[] }[] }[]
    )[0]!.lessons[0]!.exercises[0]!
    expect(e0.explanation).toBe('B')
    expect(JSON.stringify(picked.merged)).not.toContain('__key')
  })

  it('adds new exercises from both sides without duplicating', () => {
    const b = makeCourse()
    const mk = (id: string) =>
      edit((c) =>
        c.modules[0]!.lessons[1]!.exercises.push({
          id,
          type: 'truefalse',
          prompt: `Statement ${id} is true.`,
          answer: true,
          explanation: 'x',
        }),
      )
    const r = mergeCourses(b, mk('n1'), mk('n2'))
    expect(r.status).toBe('clean')
    const ids = (
      r.merged.modules as { lessons: { exercises: { id?: string }[] }[] }[]
    )[0]!.lessons[1]!.exercises.map((e) => e.id)
    expect(ids).toEqual(['o1', 'n1', 'n2'])
  })

  it('never lists a change it merged as a conflict, and diff of a clean merge against ours shows only theirs', () => {
    const b = makeCourse()
    const ours = edit((c) => (c.title = 'Ours'))
    const theirs = edit((c) => (c.modules[1]!.lessons[0]!.estMinutes = 40))
    const r = mergeCourses(b, ours, theirs)
    const merged = r.validation && r.validation.ok ? r.validation.course : null
    expect(merged).not.toBeNull()
    const d = diffCourses(ours, merged!)
    expect(d.changes.map((c) => c.field)).toEqual(['estMinutes'])
  })
})
