import { describe, expect, it } from 'vitest'
import {
  applyRefactor,
  applyResolutions,
  mergeCourses,
  previewRefactor,
} from '../src/curriculum/authoring'
import { edit, makeCourse } from './authoring-fixtures'

describe('rename-skill references', () => {
  it('does not rewrite another skill exercises when display names are shared', () => {
    const c = edit((x) => {
      x.skills.push({ slug: 'sel2', name: 'SELECT queries', requires: [] } as never)
    })
    const sharedName = c.skills[0]!.name
    c.skills[1]!.name = sharedName
    const p = previewRefactor(c, { type: 'rename-skill', from: 'sel2', to: 'sel3' })
    expect(p.warnings.join(' ')).toMatch(/Another skill has the display name/)
    const ex = p.course.modules[0]!.lessons[0]!.exercises[0]!
    expect(ex.skill).toBe(makeCourse().modules[0]!.lessons[0]!.exercises[0]!.skill)
  })
})

describe('remove-skill', () => {
  it('counts exercises tagged with the skill and refuses without detach', () => {
    const p = previewRefactor(makeCourse(), { type: 'remove-skill', slug: 'select' })
    expect(p.ok).toBe(false)
    expect(p.errors.join(' ')).toMatch(/exercise tagged/)
  })
  it('detach clears exercise tags and says so', () => {
    const p = previewRefactor(makeCourse(), { type: 'remove-skill', slug: 'select', detach: true })
    expect(p.ok).toBe(true)
    expect(JSON.stringify(p.course)).not.toContain('"skill":"select"')
    expect(p.warnings.join(' ')).toMatch(/lost their skill tag/)
  })
})

describe('merge never resurrects a deleted skill', () => {
  it('one side deletes a skill, the other starts using it', () => {
    const base = edit((c) => {
      c.skills.push({ slug: 'old', name: 'Old', requires: [] } as never)
    })
    const ours = edit((c) => {
      c.skills = c.skills.filter((s) => s.slug !== 'old')
    }, base)
    const theirs = edit((c) => {
      c.modules[0]!.lessons[0]!.skills.push('old')
    }, base)
    const r = mergeCourses(base, ours, theirs)
    expect(r.status).toBe('conflicts')
    expect(r.validation).toBeNull()
    expect(r.dangling.join(' ')).toContain('"old"')
    const done = applyResolutions(r, {})
    expect(done.validation).toBeNull()
    expect(done.dangling.length).toBeGreaterThan(0)
  })
})

describe('merge-lessons reports every loss', () => {
  const two = () =>
    edit((c) => {
      const [a, b] = c.modules[0]!.lessons
      a!.reflection = Array.from({ length: 7 }, (_, i) => `Reflect on a${i}`)
      b!.reflection = Array.from({ length: 6 }, (_, i) => `Reflect on b${i}`)
      a!.keyTerms = [{ term: 'Row', definition: 'A record.' }]
      b!.keyTerms = [{ term: 'row', definition: 'A line in a table.' }]
      a!.resources = [{ title: 'Docs', url: 'https://example.com/a' }] as never
      b!.resources = [{ title: 'Other title', url: 'https://example.com/a' }] as never
      a!.estMinutes = 400
      b!.estMinutes = 300
    })
  it('warns about prompts, term definitions, resources, minutes and progress', () => {
    const c = two()
    const l = c.modules[0]!.lessons
    const p = previewRefactor(c, { type: 'merge-lessons', keep: l[0]!.slug, absorb: l[1]!.slug })
    expect(p.ok).toBe(true)
    const w = p.warnings.join('\n')
    expect(w).toMatch(/3 reflection prompt\(s\) beyond the limit/)
    expect(w).toMatch(/defined differently/)
    expect(w).toMatch(/share a URL/)
    expect(w).toMatch(/capped at 600, so 100 author-entered/)
    expect(w).toMatch(/progress on ".*" no longer maps/)
  })
})

describe('order impact', () => {
  it('warns when reordering modules puts a skill before its prerequisite', () => {
    const c = makeCourse()
    const p = previewRefactor(c, {
      type: 'reorder-modules',
      order: c.modules.map((m) => m.slug).reverse(),
    })
    expect(p.errors).toEqual([])
    expect(p.warnings.join(' ')).toMatch(/before its prerequisite "select"/)
  })
})

describe('preview token', () => {
  it('is a 128-bit digest that changes with a one-character edit', () => {
    const c = makeCourse()
    const op = { type: 'rename-skill', from: 'select', to: 'sel' } as const
    const a = previewRefactor(c, op).token
    const b = previewRefactor(
      edit((x) => (x.title += '!'), c),
      op,
    ).token
    expect(a.split('.')[0]!.length).toBeGreaterThanOrEqual(24)
    expect(a).not.toBe(b)
  })
  it('apply refuses a stale token', () => {
    const c = makeCourse()
    const op = { type: 'rename-skill', from: 'select', to: 'sel' } as const
    const t = previewRefactor(c, op).token
    expect(
      applyRefactor(
        edit((x) => (x.title += '!'), c),
        op,
        t,
      ).ok,
    ).toBe(false)
  })
})

describe('merge progress impact', () => {
  it('lists lessons the merge removes or moves', () => {
    const base = makeCourse()
    const gone = base.modules[0]!.lessons[1]!.slug
    const ours = edit((c) => {
      c.modules[0]!.lessons = c.modules[0]!.lessons.filter((l) => l.slug !== gone)
    }, base)
    const r = mergeCourses(base, ours, base)
    expect(r.progressImpact.join(' ')).toMatch(new RegExp(`Lesson "${gone}" is removed`))
    const same = mergeCourses(base, base, base)
    expect(same.progressImpact).toEqual([])
    expect(applyResolutions(r, {}).progressImpact).toEqual(r.progressImpact)
  })
})
