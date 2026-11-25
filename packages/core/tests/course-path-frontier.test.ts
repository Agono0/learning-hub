import { describe, expect, it } from 'vitest'
import { computeFrontier, buildCourseModel } from '../src/course-path'
import { isLessonLocked, lockedSkills, nextLessonId } from '../src/curriculum/progress'
import { basicModel, course } from './course-path-fixtures'

const stages = (r: ReturnType<typeof computeFrontier>) =>
  Object.fromEntries(r.lessons.map((l) => [l.slug, l.stage]))

describe('frontier', () => {
  it('with no data only lessons without unmastered prerequisites are ready', () => {
    const r = computeFrontier(basicModel(), {})
    expect(stages(r)).toEqual({
      l1: 'ready',
      l2: 'soft-locked',
      l3: 'soft-locked',
      l4: 'soft-locked',
    })
    expect(r.next).toBe('l1')
  })

  it('explains each lock with direct blockers and the skill to fix first', () => {
    const r = computeFrontier(basicModel(), {})
    const l3 = r.lessons.find((l) => l.slug === 'l3')!
    expect(l3.blockedBy).toEqual(['b'])
    expect(l3.fixFirst).toEqual(['a'])
  })

  it('unlocks lessons as mastery rises (direct rule, not transitive)', () => {
    const r = computeFrontier(basicModel(), { mastery: { a: 0.95 }, status: { l1: 'completed' } })
    expect(stages(r)).toEqual({ l1: 'completed', l2: 'ready', l3: 'soft-locked', l4: 'ready' })
    // c needs b, b is below the bar: l3 stays locked even though a is mastered
    expect(r.lessons[2]!.fixFirst).toEqual(['b'])
    expect(r.completed).toBe(1)
  })

  it('agrees with the course page rules for locks and the next lesson on random states', () => {
    const m = basicModel()
    let seed = 7
    const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647
    for (let i = 0; i < 200; i++) {
      const mastery = Object.fromEntries(['a', 'b', 'c', 'd'].map((s) => [s, rnd()]))
      const pick = ['not_started', 'in_progress', 'completed'] as const
      const status = Object.fromEntries(
        ['l1', 'l2', 'l3', 'l4'].map((l) => [l, pick[Math.floor(rnd() * 3)]!]),
      )
      const r = computeFrontier(m, { mastery, status })
      const locked = lockedSkills(
        m.prereqs,
        new Map(Object.entries(mastery).map(([k, v]) => [m.skillIdBySlug.get(k)!, v])),
      )
      const facts = m.lessons.map((l) => ({
        id: l.id,
        status: status[l.slug]!,
        skillIds: l.skillIds,
      }))
      expect(r.lessons.map((l) => l.stage === 'soft-locked')).toEqual(
        facts.map((f) => isLessonLocked(f, locked)),
      )
      const id = nextLessonId(facts, locked)
      expect(r.next).toBe(id === null ? null : m.lessons[id - 1]!.slug)
    }
  })

  it('next is null when everything is completed', () => {
    const r = computeFrontier(basicModel(), {
      status: { l1: 'completed', l2: 'completed', l3: 'completed', l4: 'completed' },
    })
    expect(r.next).toBeNull()
    expect(r.unlockers).toEqual([])
  })

  it('ranks unlockers by downstream work, then by cost', () => {
    // a unlocks b, c, d: 3 downstream lessons; with a mastered b is next with 1 (c)
    const first = computeFrontier(basicModel(), {})
    expect(first.unlockers[0]).toMatchObject({
      skill: 'a',
      downstreamLessons: 3,
      minutesToTrain: 30,
      lockedLessons: 3,
    })
    const second = computeFrontier(basicModel(), { mastery: { a: 0.95 } })
    expect(second.unlockers.map((u) => u.skill)).toEqual(['b'])
    expect(second.unlockers[0]).toMatchObject({ downstreamLessons: 1, lockedLessons: 1 })
  })

  it('does not rank mastered, locked or leaf skills', () => {
    const r = computeFrontier(basicModel(), { mastery: { a: 0.95, b: 0.95, c: 0.1 } })
    expect(r.unlockers).toEqual([]) // c and d are leaves; a and b are mastered
  })

  it('respects a custom threshold', () => {
    const strict = computeFrontier(basicModel(), { mastery: { a: 0.9 } }, { threshold: 0.95 })
    expect(strict.lessons[1]!.stage).toBe('soft-locked')
    const loose = computeFrontier(basicModel(), { mastery: { a: 0.6 } }, { threshold: 0.1 })
    expect(loose.lessons[1]!.stage).toBe('ready')
  })

  it('caps the unlocker list', () => {
    const m = buildCourseModel(
      course(
        [['root', []], ...['s1', 's2', 's3'].map((s): [string, string[]] => [s, ['root']])],
        [
          [
            'm',
            [
              { slug: 'r', skills: ['root'] },
              ...['s1', 's2', 's3'].map((s) => ({ slug: s, skills: [s] })),
            ],
          ],
        ],
      ),
    )
    expect(computeFrontier(m, {}, { maxUnlockers: 1 }).unlockers).toHaveLength(1)
  })

  it('ignores unknown mastery and status keys', () => {
    const r = computeFrontier(basicModel(), {
      mastery: { ghost: 1, a: Number.NaN },
      status: { zzz: 'completed' },
    })
    expect(r.completed).toBe(0)
    expect(r.lessons[1]!.stage).toBe('soft-locked')
  })
})
