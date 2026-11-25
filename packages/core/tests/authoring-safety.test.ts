import { describe, expect, it } from 'vitest'
import { applyResolutions, mergeCourses, previewRefactor } from '../src/curriculum/authoring'
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
