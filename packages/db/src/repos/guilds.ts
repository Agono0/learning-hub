/**
 * @fileoverview Repositories for Milestone 14:
 * - Study Guilds & Clan Member Progression
 * - 30-Tier Seasonal Motivation Pass
 * - 1v1 Review Duel Match Records
 */
import { and, desc, eq, sql } from 'drizzle-orm'
import { calculateGuildLevel, calculateSeasonProgress } from '@learning-hub/core/guilds'
import { getDb } from '../index'
import { guildMembers, guilds, reviewDuels, seasonalProgress } from '../schema'
import { withTransaction } from '../transaction'

/** Number of tiers in a seasonal pass (matches the season handler and core). */
export const SEASON_TIERS = 30

export interface GuildRow {
  id: number
  name: string
  tag: string
  description: string | null
  totalXp: number
  level: number
  avatarEmoji: string
  createdAt: string
}

export function createGuild(data: {
  name: string
  tag: string
  description?: string
  leaderAlias: string
  avatarEmoji?: string
}): GuildRow {
  return withTransaction((db) => {
    const [guild] = db
      .insert(guilds)
      .values({
        name: data.name,
        tag: data.tag.toUpperCase(),
        description: data.description ?? null,
        totalXp: 0,
        level: 1,
        avatarEmoji: data.avatarEmoji ?? '🛡️',
      })
      .returning()
      .all()

    // The creator leads the new guild (moving them out of any previous one).
    const existing = db
      .select()
      .from(guildMembers)
      .where(eq(guildMembers.alias, data.leaderAlias))
      .get()
    if (existing) {
      db.update(guildMembers)
        .set({ guildId: guild!.id, role: 'leader', xpContributed: 0 })
        .where(eq(guildMembers.id, existing.id))
        .run()
    } else {
      db.insert(guildMembers)
        .values({ guildId: guild!.id, alias: data.leaderAlias, role: 'leader', xpContributed: 0 })
        .run()
    }

    return guild as GuildRow
  }, getDb())
}

export function getGuild(id: number): GuildRow | null {
  const db = getDb()
  if (!Number.isInteger(id) || id <= 0) return null
  return (db.select().from(guilds).where(eq(guilds.id, id)).get() as GuildRow | undefined) ?? null
}

export function listGuilds(limit = 20): GuildRow[] {
  const db = getDb()
  return db.select().from(guilds).orderBy(desc(guilds.totalXp)).limit(limit).all() as GuildRow[]
}

/**
 * Joins `alias` to a guild. Members belong to one guild at a time, so joining
 * another guild moves them (their per-guild contribution restarts at 0).
 * Re-joining the guild you're already in is a no-op — it never demotes a leader.
 * Returns false when the guild doesn't exist.
 */
export function joinGuild(guildId: number, alias: string): boolean {
  return withTransaction((db) => {
    if (!db.select({ id: guilds.id }).from(guilds).where(eq(guilds.id, guildId)).get()) return false
    const existing = db.select().from(guildMembers).where(eq(guildMembers.alias, alias)).get()

    if (existing) {
      if (existing.guildId === guildId) return true
      db.update(guildMembers)
        .set({ guildId, role: 'member', xpContributed: 0 })
        .where(eq(guildMembers.id, existing.id))
        .run()
      return true
    }

    db.insert(guildMembers).values({ guildId, alias, role: 'member', xpContributed: 0 }).run()
    return true
  }, getDb())
}

/**
 * Remove an alias from whatever guild they belong to.
 * Returns true if a membership was removed.
 */
export function leaveGuild(alias: string): boolean {
  const db = getDb()
  const res = db.delete(guildMembers).where(eq(guildMembers.alias, alias)).run()
  return (res?.changes ?? 0) > 0
}

/**
 * Pools `xp` from a member into their guild and recomputes the guild level,
 * atomically. Only members of `guildId` can contribute to it, and only a
 * positive whole amount. Returns whether anything was credited.
 */
export function contributeGuildXp(guildId: number, alias: string, xp: number): boolean {
  if (!Number.isFinite(xp) || xp <= 0) return false
  const amount = Math.floor(xp)
  if (amount <= 0) return false

  return withTransaction((db) => {
    const member = db
      .update(guildMembers)
      .set({ xpContributed: sql`${guildMembers.xpContributed} + ${amount}` })
      .where(and(eq(guildMembers.alias, alias), eq(guildMembers.guildId, guildId)))
      .run()
    if (member.changes === 0) return false

    db.update(guilds)
      .set({ totalXp: sql`${guilds.totalXp} + ${amount}` })
      .where(eq(guilds.id, guildId))
      .run()

    const updated = db.select().from(guilds).where(eq(guilds.id, guildId)).get()
    if (updated) {
      const milestone = calculateGuildLevel(updated.totalXp)
      if (milestone.level !== updated.level) {
        db.update(guilds).set({ level: milestone.level }).where(eq(guilds.id, guildId)).run()
      }
    }
    return true
  }, getDb())
}

export function listGuildMembers(guildId: number) {
  const db = getDb()
  return db
    .select()
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId))
    .orderBy(desc(guildMembers.xpContributed))
    .all()
}

export function getSeasonalProgress(seasonId = 'season-1') {
  const db = getDb()
  let row = db.select().from(seasonalProgress).where(eq(seasonalProgress.seasonId, seasonId)).get()

  if (!row) {
    const [created] = db
      .insert(seasonalProgress)
      .values({
        seasonId,
        seasonXp: 0,
        tier: 0,
        claimedRewards: [],
      })
      .returning()
      .all()
    row = created!
  }

  return row
}

export function addSeasonXp(xp: number, seasonId = 'season-1') {
  const current = getSeasonalProgress(seasonId)
  if (!Number.isFinite(xp) || xp <= 0) return current
  const newXp = current.seasonXp + Math.floor(xp)
  const { currentTier } = calculateSeasonProgress(newXp, SEASON_TIERS)

  const db = getDb()
  db.update(seasonalProgress)
    .set({
      seasonXp: newXp,
      tier: currentTier,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(seasonalProgress.id, current.id))
    .run()

  return getSeasonalProgress(seasonId)
}

export function claimSeasonReward(tier: number, seasonId = 'season-1'): boolean {
  if (!Number.isInteger(tier) || tier < 1 || tier > SEASON_TIERS) return false
  const current = getSeasonalProgress(seasonId)
  if (current.tier < tier) return false

  const claimed = Array.isArray(current.claimedRewards) ? [...current.claimedRewards] : []
  if (claimed.includes(tier)) return true

  claimed.push(tier)
  const db = getDb()
  db.update(seasonalProgress)
    .set({
      claimedRewards: claimed,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(seasonalProgress.id, current.id))
    .run()

  return true
}

export function recordDuelResult(data: {
  player1Alias: string
  player2Alias: string
  winnerAlias?: string | null
  player1Score: number
  player2Score: number
}) {
  const db = getDb()
  const [duel] = db
    .insert(reviewDuels)
    .values({
      player1Alias: data.player1Alias,
      player2Alias: data.player2Alias,
      winnerAlias: data.winnerAlias ?? null,
      player1Score: data.player1Score,
      player2Score: data.player2Score,
    })
    .returning()
    .all()

  return duel!
}

export function listRecentDuels(limit = 10) {
  const db = getDb()
  return db.select().from(reviewDuels).orderBy(desc(reviewDuels.completedAt)).limit(limit).all()
}

export interface GuildMembershipRow {
  guildId: number
  alias: string
  role: string
  xpContributed: number
}

/** The caller's guild membership (their alias), or null when guildless. */
export function getMyGuildMembership(alias: string): GuildMembershipRow | null {
  const db = getDb()
  const row = db
    .select({
      guildId: guildMembers.guildId,
      alias: guildMembers.alias,
      role: guildMembers.role,
      xpContributed: guildMembers.xpContributed,
    })
    .from(guildMembers)
    .where(eq(guildMembers.alias, alias))
    .limit(1)
    .get()
  return row ?? null
}
