/**
 * @fileoverview Multiplayer Guilds, 1v1 Duels & Seasonal Progression Engine.
 *
 * Provides domain logic for:
 * - Study Guild clan leveling & pooled XP milestone formulas
 * - 1v1 Review Duel speed-scoring & Elo rating recalculation
 * - 30-Tier Seasonal Motivation Pass progression and reward unlocks
 */
import { z } from 'zod'

export const guildRoleSchema = z.enum(['leader', 'officer', 'member'])
export type GuildRole = z.infer<typeof guildRoleSchema>

export const guildSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(2).max(30),
  tag: z.string().min(2).max(6),
  description: z.string().max(200).optional(),
  totalXp: z.number().int().nonnegative().default(0),
  level: z.number().int().positive().default(1),
  avatarEmoji: z.string().default('🛡️'),
})
export type Guild = z.infer<typeof guildSchema>

export interface GuildLevelMilestone {
  level: number
  xpRequired: number
  title: string
  xpBonusPercent: number
}

export const GUILD_LEVEL_MILESTONES: readonly GuildLevelMilestone[] = [
  { level: 1, xpRequired: 0, title: 'Novice Clan', xpBonusPercent: 0 },
  { level: 2, xpRequired: 1_000, title: 'Study Circle', xpBonusPercent: 2 },
  { level: 3, xpRequired: 3_500, title: 'Knowledge Syndicate', xpBonusPercent: 5 },
  { level: 4, xpRequired: 8_000, title: 'Scholars Guild', xpBonusPercent: 8 },
  { level: 5, xpRequired: 16_000, title: 'Master Academy', xpBonusPercent: 12 },
  { level: 6, xpRequired: 30_000, title: 'Grand Order', xpBonusPercent: 15 },
]

/**
 * Calculates a guild's level based on cumulative pooled study XP.
 */
export function calculateGuildLevel(totalXp: number): GuildLevelMilestone {
  let current = GUILD_LEVEL_MILESTONES[0]!
  for (const m of GUILD_LEVEL_MILESTONES) {
    if (totalXp >= m.xpRequired) {
      current = m
    } else {
      break
    }
  }
  return current
}

/**
 * Calculates score for a 1v1 review duel round.
 * Score = 100 for correct recall + speed bonus (up to 50 pts for recall under 2000ms).
 */
export function calculateDuelRoundScore(isCorrect: boolean, timeMs: number): number {
  if (!isCorrect) return 0
  const baseScore = 100
  const speedBonus = Math.max(0, Math.min(50, Math.round((3000 - timeMs) / 40)))
  return baseScore + speedBonus
}

/**
 * Standard Elo rating calculation for 1v1 review duels.
 *
 * @param playerRating - Current rating of player
 * @param opponentRating - Current rating of opponent
 * @param outcome - 1.0 for win, 0.5 for draw, 0.0 for loss
 * @param kFactor - K-factor weighting (default 32)
 */
export function calculateElo(
  playerRating: number,
  opponentRating: number,
  outcome: 1.0 | 0.5 | 0.0,
  kFactor = 32,
): number {
  const expected = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400))
  const change = Math.round(kFactor * (outcome - expected))
  return Math.max(100, playerRating + change)
}

export interface SeasonTier {
  tier: number
  xpThreshold: number
  rewardName: string
  rewardType: 'badge' | 'theme' | 'perk' | 'custom_sound'
}

/**
 * Generates the 30 tiers for a Seasonal Study Pass.
 * Tiers scale linearly with slight curvature (100 XP per tier up to 3,000 XP).
 */
export function generateSeasonTiers(totalTiers = 30): SeasonTier[] {
  const tiers: SeasonTier[] = []
  for (let t = 1; t <= totalTiers; t++) {
    const xpThreshold = t * 100
    let rewardName = `Study Pass Tier ${t}`
    let rewardType: SeasonTier['rewardType'] = 'badge'

    if (t === 5) {
      rewardName = 'Cyberpunk Emerald Theme'
      rewardType = 'theme'
    } else if (t === 10) {
      rewardName = 'Streak Shield (+1 Freeze)'
      rewardType = 'perk'
    } else if (t === 15) {
      rewardName = 'Chime Synthesizer Pack'
      rewardType = 'custom_sound'
    } else if (t === 20) {
      rewardName = 'Solarized Amber Theme'
      rewardType = 'theme'
    } else if (t === 25) {
      rewardName = '2x XP Boost (Weekend)'
      rewardType = 'perk'
    } else if (t === 30) {
      rewardName = 'Grandmaster Scholar Crown'
      rewardType = 'badge'
    }

    tiers.push({
      tier: t,
      xpThreshold,
      rewardName,
      rewardType,
    })
  }
  return tiers
}

/**
 * Calculates current tier achieved given seasonal accumulated XP.
 */
export function calculateSeasonProgress(
  seasonXp: number,
  totalTiers = 30,
): {
  currentTier: number
  nextTierXp: number
  percentToNext: number
} {
  const tier = Math.min(totalTiers, Math.max(0, Math.floor(seasonXp / 100)))
  const nextTierXp = (tier + 1) * 100
  const currentTierBaseXp = tier * 100
  const percentToNext =
    tier >= totalTiers
      ? 100
      : Math.min(100, Math.max(0, Math.round(((seasonXp - currentTierBaseXp) / 100) * 100)))

  return {
    currentTier: tier,
    nextTierXp,
    percentToNext,
  }
}
