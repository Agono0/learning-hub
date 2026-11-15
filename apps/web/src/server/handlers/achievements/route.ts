import { eventBus } from '@learning-hub/core'
import { evaluateAndUnlockAchievements } from '@learning-hub/db'

/** GET /api/achievements — catalog with live unlock check from real aggregates. */
export async function GET() {
  const { catalog, stats, newlyUnlocked } = evaluateAndUnlockAchievements()

  for (const key of newlyUnlocked) {
    // Fact after the write: the badge is unlocked (listeners: plugins, sounds…).
    eventBus.emit('achievement.unlocked', { achievementId: key })
  }

  return Response.json({ catalog, stats, newlyUnlocked })
}
