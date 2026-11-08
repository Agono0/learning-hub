/**
 * XP system — RuneScape-style exponential curves with skill milestones.
 * Levels encode *skill milestones*, not raw time (overjustification-safe design).
 */

/** XP required to reach level L (exponential, level 1 at 0 XP, ~99 at 13M — RS-inspired). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0
  let total = 0
  for (let l = 1; l < level; l++) {
    total += Math.floor(l + 300 * Math.pow(2, l / 7)) / 4
  }
  return Math.floor(total)
}

/** Inverse of xpForLevel: level reached for a total XP amount (capped). */
export function levelFromXp(xp: number, maxLevel = 50): number {
  let level = 1
  while (level < maxLevel && xp >= xpForLevel(level + 1)) level++
  return level
}

/** Progress within the current level 0..1 — feeds goal-gradient progress bars. */
export function levelProgress(xp: number): number {
  const level = levelFromXp(xp)
  const cur = xpForLevel(level)
  const next = xpForLevel(level + 1)
  if (next === cur) return 1
  return Math.min(1, (xp - cur) / (next - cur))
}

/** XP awarded per event (science-first: depth over time). */
export const XP_REWARDS = {
  review: 2, // per completed review
  reviewRecall: 5, // extra for confident-correct (Good/Easy + sure)
  lesson: 30,
  teachback: 60,
  focusSession: 40, // completed focus block
  quest: 50,
  habit: 10,
  journal: 15,
  ideaCapture: 10,
  ideaEvolve: 25,
  courseComplete: 500,
  achievement: 100,
  debate: 35, // judged debate ruling or protégé explanation (dialectic arena)
} as const
