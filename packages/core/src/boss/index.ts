/**
 * Learning HUB — Solo Boss Battle engine (pure domain logic).
 *
 * Derives combat progress, hits, criticals, and damage directly from review log events.
 * Connects spaced repetition performance to epic boss battles without extra grind.
 */
import { z } from 'zod'

export interface BossProfile {
  key: string
  name: string
  title: string
  maxHp: number
  attackPower: number
  description: string
  avatar: string
  rewardXp: number
}

export const BOSS_ROSTER: Record<string, BossProfile> = {
  chronos: {
    key: 'chronos',
    name: 'Chronos',
    title: 'The Time Eater',
    maxHp: 200,
    attackPower: 12,
    description:
      'Devours spare moments and feeds on procrastination. High review accuracy weakens his temporal shield.',
    avatar: '⏳',
    rewardXp: 150,
  },
  hydra: {
    key: 'hydra',
    name: 'Hydra of Distraction',
    title: 'Multi-Headed Impulse',
    maxHp: 400,
    attackPower: 18,
    description:
      'Every time you lose focus, two new distractions sprout. Fast and decisive answers sever its heads.',
    avatar: '🐉',
    rewardXp: 300,
  },
  goliath: {
    key: 'goliath',
    name: 'Goliath of Forgetting',
    title: 'The Ebbinghaus Titan',
    maxHp: 650,
    attackPower: 22,
    description:
      'An ancient colossus that personifies the exponential forgetting curve. Only high-stability retention can topple him.',
    avatar: '🗿',
    rewardXp: 500,
  },
}

export interface ReviewCombatInput {
  id: number
  grade: number // 1..4 (FSRS rating)
  timeMs?: number
}

export interface CombatTurnResult {
  playerDamageDealt: number
  bossDamageDealt: number
  critCount: number
  hitsCount: number
  missesCount: number
}

/**
 * Derives combat damage dealt to the boss and taken by the player from a list of review ratings.
 */
export function calculateCombatTurn(
  reviews: ReviewCombatInput[],
  boss: BossProfile,
): CombatTurnResult {
  let playerDamageDealt = 0
  let bossDamageDealt = 0
  let critCount = 0
  let hitsCount = 0
  let missesCount = 0

  for (const r of reviews) {
    if (r.grade === 4) {
      // Easy = Critical Hit
      critCount++
      hitsCount++
      playerDamageDealt += 35
      // Speed bonus if answered in under 4 seconds
      if (r.timeMs && r.timeMs < 4000) {
        playerDamageDealt += 5
      }
    } else if (r.grade === 3) {
      // Good = Solid Hit
      hitsCount++
      playerDamageDealt += 20
      if (r.timeMs && r.timeMs < 4000) {
        playerDamageDealt += 5
      }
    } else if (r.grade === 2) {
      // Hard = Glancing Hit
      hitsCount++
      playerDamageDealt += 10
    } else {
      // Again (Grade 1) = Miss + Boss Counterattack
      missesCount++
      bossDamageDealt += boss.attackPower
    }
  }

  return {
    playerDamageDealt,
    bossDamageDealt,
    critCount,
    hitsCount,
    missesCount,
  }
}

export const bossBattleStateSchema = z.object({
  id: z.number().optional(),
  bossKey: z.string(),
  currentHp: z.number(),
  maxHp: z.number(),
  playerHp: z.number(),
  status: z.enum(['active', 'victory', 'defeat']),
})

export type BossBattleState = z.infer<typeof bossBattleStateSchema>
