/**
 * In-app event engines — server-side subscribers that turn the platform event
 * bus into cross-system behavior without any page calling them directly.
 *
 * Currently wired:
 * - **Guild XP bridge**: every committed review contributes its earned XP to
 *   the learner's guild (if they joined one), using the same alias the social
 *   surfaces use. Anti-cheat stays in the review engine — this bridge only
 *   distributes XP that has already been committed.
 *
 * Initialized lazily (once per process) via {@link ensureEnginesLoaded}, the
 * same pattern as ensurePluginsLoaded.
 */
import { eventBus } from '@learning-hub/core'
import { contributeGuildXp, getMyGuildMembership, getOnlineIdentity } from '@learning-hub/db'

let started = false

/** Idempotent boot of the in-app event engines. Call from request handlers. */
export function ensureEnginesLoaded(): void {
  if (started) return
  started = true

  eventBus.on('review.completed', ({ xpEarned }) => {
    try {
      if (xpEarned <= 0) return
      const alias = getOnlineIdentity().alias
      const membership = getMyGuildMembership(alias)
      if (membership) {
        contributeGuildXp(membership.guildId, membership.alias, xpEarned)
      }
    } catch (err) {
      // Engine failures never break the emitter (same isolation as plugins).
      console.error('[engines] guild XP bridge failed:', err)
    }
  })
}
