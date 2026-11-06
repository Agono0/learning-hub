/**
 * @fileoverview Repositories for Milestone 14:
 * - Study Guilds & Clan Member Progression
 * - 30-Tier Seasonal Motivation Pass
 * - 1v1 Review Duel Match Records
 */
import { desc, eq, sql } from 'drizzle-orm'
import { calculateGuildLevel, calculateSeasonProgress } from '@learning-hub/core/guilds'
import { getDb } from '../index'
import { guildMembers, guilds, reviewDuels, seasonalProgress } from '../schema'

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
  const db = getDb()
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

  // Add the creator as leader
  db.insert(guildMembers)
    .values({
      guildId: guild!.id,
      alias: data.leaderAlias,
      role: 'leader',
      xpContributed: 0,
    })
    .run()

  return guild as GuildRow
}

export function getGuild(id: number): GuildRow | null {
  const db = getDb()
  return db.select().from(guilds).where(eq(guilds.id, id)).get() as GuildRow | null
}

export function listGuilds(limit = 20): GuildRow[] {
  const db = getDb()
  return db.select().from(guilds).orderBy(desc(guilds.totalXp)).limit(limit).all() as GuildRow[]
}

export function joinGuild(guildId: number, alias: string): boolean {
  const db = getDb()
  const existing = db.select().from(guildMembers).where(eq(guildMembers.alias, alias)).get()

  if (existing) {
    // Already in a clan or this clan
    db.update(guildMembers)
      .set({ guildId, role: 'member' })
      .where(eq(guildMembers.id, existing.id))
      .run()
    return true
  }

  db.insert(guildMembers)
    .values({
      guildId,
      alias,
      role: 'member',
      xpContributed: 0,
    })
    .run()

  return true
}

export function contributeGuildXp(guildId: number, alias: string, xp: number): void {
  const db = getDb()
  // 1. Update member contribution
  db.update(guildMembers)
    .set({
      xpContributed: sql`${guildMembers.xpContributed} + ${xp}`,
    })
    .where(eq(guildMembers.alias, alias))
    .run()

  // 2. Update clan total XP & recalculate clan level
  db.update(guilds)
    .set({
      totalXp: sql`${guilds.totalXp} + ${xp}`,
    })
    .where(eq(guilds.id, guildId))
    .run()

  const updated = getGuild(guildId)
  if (updated) {
    const milestone = calculateGuildLevel(updated.totalXp)
    if (milestone.level !== updated.level) {
      db.update(guilds).set({ level: milestone.level }).where(eq(guilds.id, guildId)).run()
    }
  }
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
  const newXp = current.seasonXp + xp
  const { currentTier } = calculateSeasonProgress(newXp, 30)

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
