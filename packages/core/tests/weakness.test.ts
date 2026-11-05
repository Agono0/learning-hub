import { describe, expect, it } from 'vitest'
import { weaknessRadar } from '../src/weakness'

describe('weaknessRadar', () => {
  it('ranks skills weakest-first and ignores unattempted ones', () => {
    const radar = weaknessRadar({
      skills: [
        { skillId: 1, name: 'fresh', pKnown: 0.05, attempts: 1 }, // below minAttempts
        { skillId: 2, name: 'weak', pKnown: 0.3, attempts: 5 },
        { skillId: 3, name: 'strong', pKnown: 0.9, attempts: 20 },
        { skillId: 4, name: 'mid', pKnown: 0.6, attempts: 9 },
      ],
      leeches: [],
      overconfidentCards: 0,
    })
    expect(radar.skills.map((s) => s.name)).toEqual(['weak', 'mid', 'strong'])
    expect(radar.summary).toContain('weak')
  })

  it('ranks leeches by lapses and names the worst in the summary', () => {
    const radar = weaknessRadar({
      skills: [{ skillId: 1, name: 's', pKnown: 0.4, attempts: 4 }],
      leeches: [
        { cardId: 11, lapses: 8, preview: 'Derivative of sin' },
        { cardId: 12, lapses: 14, preview: 'Chain rule' },
      ],
      overconfidentCards: 2,
    })
    expect(radar.leeches.map((l) => l.cardId)).toEqual([12, 11])
    expect(radar.summary).toContain('Chain rule')
    expect(radar.overconfidentCards).toBe(2)
  })

  it('stays calm when there is nothing to report', () => {
    const radar = weaknessRadar({ skills: [], leeches: [], overconfidentCards: 0 })
    expect(radar.summary).toMatch(/keep reviewing/i)
  })
})
