import { describe, expect, it } from 'vitest'
import { eloUpdate, outcomeFrom, streakBonus } from '../src/elo'
import { levelFromXp, levelProgress, xpForLevel } from '../src/xp'
import { moodEmoji, moodLabel, weeklyPrompts } from '../src/journal'

describe('elo', () => {
  it('maps grade + confidence to an outcome in [0,1]', () => {
    expect(outcomeFrom(1, 0)).toBe(0)
    expect(outcomeFrom(4, 1)).toBe(1)
    expect(outcomeFrom(3, 0)).toBeCloseTo(0.7 * (2 / 3))
  })

  it('is zero-sum at equal K and moves toward the surprise', () => {
    const u = eloUpdate(1200, 1200, 1, 0, 0)
    expect(u.expected).toBeCloseTo(0.5)
    expect(u.ratingAfter).toBeCloseTo(1216)
    expect(u.itemDifficultyAfter).toBeCloseTo(1184)
    // beating a much harder item gains more than beating an easy one
    expect(eloUpdate(1200, 1600, 1, 0, 0).ratingAfter - 1200).toBeGreaterThan(
      eloUpdate(1200, 800, 1, 0, 0).ratingAfter - 1200,
    )
  })

  it('decays K with attempts and clamps ratings to 100..3000', () => {
    const fresh = eloUpdate(1200, 1200, 1, 0, 0).ratingAfter - 1200
    const veteran = eloUpdate(1200, 1200, 1, 4000, 0).ratingAfter - 1200
    expect(veteran).toBeLessThan(fresh / 5)
    expect(eloUpdate(2990, 3000, 1, 0, 0, { k0: 1000 }).ratingAfter).toBe(3000)
    expect(eloUpdate(110, 100, 0, 0, 0, { k0: 1000 }).ratingAfter).toBe(100)
  })

  it('never lets a bad outcome poison the ratings', () => {
    const nan = eloUpdate(1200, 1200, Number.NaN, 0, 0)
    expect(nan.ratingAfter).toBe(1200)
    expect(nan.itemDifficultyAfter).toBe(1200)
    expect(eloUpdate(1200, 1200, 7, 0, 0).ratingAfter).toBe(
      eloUpdate(1200, 1200, 1, 0, 0).ratingAfter,
    )
  })

  it('caps the streak bonus and never goes negative', () => {
    expect(streakBonus(3)).toBe(15)
    expect(streakBonus(50)).toBe(50)
    expect(streakBonus(50, 2)).toBe(10)
    expect(streakBonus(-4)).toBe(0)
  })
})

describe('xp levels', () => {
  it('has a monotonic curve consistent with levelFromXp', () => {
    expect(xpForLevel(1)).toBe(0)
    for (let l = 2; l <= 50; l++) {
      expect(xpForLevel(l)).toBeGreaterThan(xpForLevel(l - 1))
      expect(levelFromXp(xpForLevel(l))).toBe(l)
      expect(levelFromXp(xpForLevel(l) - 1)).toBe(l - 1)
    }
    expect(levelFromXp(Number.MAX_SAFE_INTEGER)).toBe(50)
  })

  it('reports progress within the level in [0,1]', () => {
    expect(levelProgress(0)).toBe(0)
    const mid = (xpForLevel(5) + xpForLevel(6)) / 2
    expect(levelProgress(mid)).toBeCloseTo(0.5, 1)
    expect(levelProgress(-50)).toBe(0)
    expect(levelProgress(Number.MAX_SAFE_INTEGER)).toBe(1)
  })
})

describe('journal helpers', () => {
  it('rotates three distinct prompts per week, deterministically', () => {
    const a = weeklyPrompts('2026-11-02')
    expect(a).toHaveLength(3)
    expect(new Set(a).size).toBe(3)
    expect(a.every((p) => typeof p === 'string' && p.length > 0)).toBe(true)
    expect(weeklyPrompts('2026-11-02')).toEqual(a)
    expect(weeklyPrompts('2026-11-09')).not.toEqual(a)
  })

  it('falls back instead of returning undefined prompts for a bad date', () => {
    const p = weeklyPrompts('not-a-date')
    expect(p.every((x) => typeof x === 'string')).toBe(true)
  })

  it('maps mood to emoji/label with clamping, rounding and a NaN fallback', () => {
    expect(moodEmoji(1)).toBe('😞')
    expect(moodEmoji(5)).toBe('😄')
    expect(moodEmoji(99)).toBe('😄')
    expect(moodEmoji(-3)).toBe('😞')
    expect(moodEmoji(3.6)).toBe('🙂')
    expect(moodEmoji(Number.NaN)).toBe('😐')
    expect(moodLabel(3)).toBe('okay')
    expect(moodLabel(4.4)).toBe('good')
  })
})
