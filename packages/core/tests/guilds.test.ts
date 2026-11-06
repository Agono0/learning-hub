import { describe, expect, it } from 'vitest'
import {
  calculateDuelRoundScore,
  calculateElo,
  calculateGuildLevel,
  calculateSeasonProgress,
  generateSeasonTiers,
} from '../src/guilds'

describe('guilds, duels & seasonal progress', () => {
  it('calculates clan level and milestone perks accurately', () => {
    expect(calculateGuildLevel(0).level).toBe(1)
    expect(calculateGuildLevel(999).level).toBe(1)
    expect(calculateGuildLevel(1_000).level).toBe(2)
    expect(calculateGuildLevel(1_000).xpBonusPercent).toBe(2)
    expect(calculateGuildLevel(3_500).level).toBe(3)
    expect(calculateGuildLevel(40_000).level).toBe(6)
    expect(calculateGuildLevel(40_000).title).toBe('Grand Order')
  })

  it('calculates 1v1 review duel round score with speed bonus', () => {
    // Incorrect answer = 0
    expect(calculateDuelRoundScore(false, 500)).toBe(0)

    // Fast correct answer (1000ms): 100 + (3000-1000)/40 = 100 + 50 = 150
    expect(calculateDuelRoundScore(true, 1000)).toBe(150)

    // Slower correct answer (2200ms): 100 + (3000-2200)/40 = 100 + 20 = 120
    expect(calculateDuelRoundScore(true, 2200)).toBe(120)

    // Very slow correct answer (3500ms): 100 + 0 = 100
    expect(calculateDuelRoundScore(true, 3500)).toBe(100)
  })

  it('updates Elo ratings properly based on match outcome', () => {
    const p1 = 1200
    const p2 = 1200

    // Equal players: winner gets +16, loser gets -16
    const p1Win = calculateElo(p1, p2, 1.0, 32)
    const p2Loss = calculateElo(p2, p1, 0.0, 32)
    expect(p1Win).toBe(1216)
    expect(p2Loss).toBe(1184)

    // Draw
    expect(calculateElo(p1, p2, 0.5, 32)).toBe(1200)
  })

  it('generates 30 seasonal progression tiers and tracks tier milestones', () => {
    const tiers = generateSeasonTiers(30)
    expect(tiers).toHaveLength(30)
    expect(tiers[0]!.tier).toBe(1)
    expect(tiers[4]!.rewardType).toBe('theme')
    expect(tiers[9]!.rewardType).toBe('perk')
    expect(tiers[29]!.rewardName).toContain('Grandmaster')

    // Progress at 250 XP -> Tier 2 (since 200 XP was tier 2, 50% to tier 3 at 300)
    const progress = calculateSeasonProgress(250, 30)
    expect(progress.currentTier).toBe(2)
    expect(progress.nextTierXp).toBe(300)
    expect(progress.percentToNext).toBe(50)
  })
})
