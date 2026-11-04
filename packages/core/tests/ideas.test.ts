import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  scamperLenses,
  scamperPrompt,
  evolveIdeas,
  manualHybrid,
  brainwritingMerge,
  normalizedSimilarity,
  incubatorScore,
  ideasToResurface,
  promoteToProject,
} from '../src/ideas'

describe('SCAMPER lenses', () => {
  it('exposes exactly 7 lenses with distinct keys and prompts', () => {
    expect(scamperLenses).toHaveLength(7)
    const keys = new Set(scamperLenses.map((l) => l.key))
    expect(keys.size).toBe(7)
    for (const l of scamperLenses) expect(l.prompt.length).toBeGreaterThan(10)
  })

  it('scamperPrompt accepts lens objects or indices', () => {
    const p0 = scamperPrompt('spaced repetition for cooking', 0)
    const p6 = scamperPrompt('spaced repetition for cooking', scamperLenses[6]!)
    expect(p0).toContain('spaced repetition for cooking')
    expect(p0).toContain(scamperLenses[0]!.name)
    expect(p6).toContain(scamperLenses[6]!.name)
    expect(() => scamperPrompt('x', 9 as never)).toThrow()
  })
})

describe('idea evolution', () => {
  const a = { id: 1, title: 'Incremental reading', content: 'Read papers in 800-word daily fragments.' }
  const b = { id: 2, title: 'Two-host podcast', content: 'Turn lessons into a dialogue between hosts.' }

  it('builds a guardrailed prompt naming both parents', () => {
    const { system, prompt, guidance } = evolveIdeas(a, b)
    expect(system).toContain('JSON')
    expect(prompt).toContain('Incremental reading')
    expect(prompt).toContain('Two-host podcast')
    expect(guidance).toContain('no AI')
  })

  it('manual hybrid keeps parent links in the content', () => {
    const h = manualHybrid(a, b)
    expect(h.title).toContain('×')
    expect(h.content).toContain('#1')
    expect(h.content).toContain('#2')
  })
})

describe('brainwriting merge', () => {
  it('drops AI ideas too similar to user ideas (similarity > 0.85)', () => {
    const user = ['Use spaced repetition to schedule reading fragments daily']
    const paraphrase = 'Use spaced repetition to schedule reading fragments daily!'
    const fresh = 'Interview an expert and record a weekly teardown'
    const { merged, dropped } = brainwritingMerge(user, [paraphrase, fresh])
    expect(merged).toContain(user[0])
    expect(merged).toContain(fresh)
    expect(dropped).toEqual([paraphrase])
  })

  it('keeps user ideas always, even when duplicated among themselves', () => {
    const user = ['Idea A', 'Idea A']
    const { merged } = brainwritingMerge(user, [])
    expect(merged).toHaveLength(2)
  })

  it('normalizedSimilarity is 0 for disjoint token sets and 1 for identical', () => {
    expect(normalizedSimilarity('cats dogs', 'cats dogs')).toBe(1)
    expect(normalizedSimilarity('cats dogs', 'quantum entanglement')).toBe(0)
    expect(normalizedSimilarity('', '')).toBe(1)
  })
})

describe('incubator decay', () => {
  const base = {
    id: 1,
    title: 'Idea',
    resurfaceEveryDays: 14,
    decayScore: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
  }

  it('score strictly decreases as days since resurfacing grow (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 90 }),
        fc.integer({ min: 1, max: 60 }),
        fc.integer({ min: 0, max: 24 }),
        (days1, every, hours) => {
          const today = new Date('2026-06-01T12:00:00.000Z')
          const s1 = incubatorScore(
            { ...base, resurfaceEveryDays: every, lastResurfacedAt: new Date(today.getTime() - (days1 * 24 + hours) * 3600_000).toISOString() },
            today,
          )
          const s2 = incubatorScore(
            { ...base, resurfaceEveryDays: every, lastResurfacedAt: new Date(today.getTime() - ((days1 + 7) * 24 + hours) * 3600_000).toISOString() },
            today,
          )
          return s2 < s1
        },
      ),
      { numRuns: 100 },
    )
  })

  it('never-resurfaced ideas decay from creation date', () => {
    const today = new Date('2026-06-01T00:00:00.000Z')
    const fresh = incubatorScore({ ...base, createdAt: '2026-05-30T00:00:00.000Z' }, today)
    const stale = incubatorScore({ ...base, createdAt: '2026-01-01T00:00:00.000Z' }, today)
    expect(fresh).toBeGreaterThan(stale)
  })

  it('ideasToResurface picks the most decayed, skips projects', () => {
    const today = new Date('2026-06-01T00:00:00.000Z')
    const ideas = [
      { id: 1, title: 'fresh', resurfaceEveryDays: 14, decayScore: 1, lastResurfacedAt: '2026-05-30T00:00:00.000Z' },
      { id: 2, title: 'stale', resurfaceEveryDays: 14, decayScore: 1, lastResurfacedAt: '2026-01-01T00:00:00.000Z' },
      { id: 3, title: 'older', resurfaceEveryDays: 14, decayScore: 1, lastResurfacedAt: '2025-12-01T00:00:00.000Z' },
      { id: 4, title: 'promoted already', stage: 'project', resurfaceEveryDays: 14, decayScore: 0 },
    ]
    const resurfaced = ideasToResurface(ideas, today, 5)
    expect(resurfaced.map((i) => i.id)).toEqual([3, 2]) // most decayed first; fresh + project excluded
  })
})

describe('promoteToProject', () => {
  it('builds project fields linked to the idea', () => {
    const fields = promoteToProject(42, { title: 'Memory palace app', content: 'A palace per deck.' })
    expect(fields).toMatchObject({ ideaId: 42, title: 'Memory palace app', status: 'active' })
    expect(fields.description).toContain('palace per deck')
    expect(fields.milestones.length).toBeGreaterThan(0)
    expect(fields.milestones.every((m) => m.done === false)).toBe(true)
  })
})
