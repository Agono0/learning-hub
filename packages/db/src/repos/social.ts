/**
 * Learning HUB — Serverless Social repository.
 *
 * Solo boss battles derived from revlog, and decentralized Gist friend connections.
 */
import { desc, eq, gt, gte, sql } from 'drizzle-orm'
import { BOSS_ROSTER, calculateCombatTurn, type BossBattleState } from '@learning-hub/core/boss'
import type { FriendStats } from '@learning-hub/core/share'
import { getDb, type LearningHubDB } from '../index'
import { bossBattles, friends, revlog, userSettings, xpEvents } from '../schema'
import { withTransaction } from '../transaction'

export function getActiveBossBattle(
  database?: LearningHubDB,
): typeof bossBattles.$inferSelect | null {
  const conn = database ?? getDb()
  return (
    conn
      .select()
      .from(bossBattles)
      .where(eq(bossBattles.status, 'active'))
      .orderBy(desc(bossBattles.id))
      .limit(1)
      .get() ?? null
  )
}

export function startBossBattle(
  bossKey: string,
  database?: LearningHubDB,
): typeof bossBattles.$inferSelect {
  const conn = database ?? getDb()
  const boss = BOSS_ROSTER[bossKey] ?? BOSS_ROSTER.chronos!
  const nowIso = new Date().toISOString()

  return withTransaction((tx) => {
    // End any existing active battle as defeat
    tx.update(bossBattles)
      .set({ status: 'defeat', endedAt: nowIso })
      .where(eq(bossBattles.status, 'active'))
      .run()

    // Find latest revlog id
    const [latestRev] = tx
      .select({ id: revlog.id })
      .from(revlog)
      .orderBy(desc(revlog.id))
      .limit(1)
      .all()
    const revlogStartId = latestRev?.id ?? 0

    const [created] = tx
      .insert(bossBattles)
      .values({
        bossKey: boss.key,
        bossName: boss.name,
        maxHp: boss.maxHp,
        currentHp: boss.maxHp,
        playerHp: 100,
        status: 'active',
        startedAt: nowIso,
        revlogStartId,
      })
      .returning()
      .all()

    return created!
  }, conn)
}

export function syncBossBattleProgress(database?: LearningHubDB): {
  battle: typeof bossBattles.$inferSelect | null
  combatSummary?: unknown
} {
  const conn = database ?? getDb()
  const active = getActiveBossBattle(conn)
  if (!active) return { battle: null }

  const boss = BOSS_ROSTER[active.bossKey] ?? BOSS_ROSTER.chronos!

  // Fetch all reviews performed since battle start
  const reviews = conn
    .select({
      id: revlog.id,
      grade: revlog.rating,
      timeMs: revlog.elapsedDays, // review elapsed time
    })
    .from(revlog)
    .where(gt(revlog.id, active.revlogStartId))
    .all()

  const turn = calculateCombatTurn(reviews, boss)
  const currentHp = Math.max(0, active.maxHp - turn.playerDamageDealt)
  const playerHp = Math.max(0, 100 - turn.bossDamageDealt)
  const nowIso = new Date().toISOString()

  let status: 'active' | 'victory' | 'defeat' = 'active'
  let endedAt: string | null = null

  if (currentHp === 0) {
    status = 'victory'
    endedAt = nowIso
  } else if (playerHp === 0) {
    status = 'defeat'
    endedAt = nowIso
  }

  return withTransaction((tx) => {
    tx.update(bossBattles)
      .set({
        currentHp,
        playerHp,
        status,
        endedAt,
      })
      .where(eq(bossBattles.id, active.id))
      .run()

    // If victory, award boss bounty XP
    if (status === 'victory' && active.status === 'active') {
      tx.insert(xpEvents)
        .values({
          source: 'boss',
          amount: boss.rewardXp,
          meta: { bossKey: boss.key, bossName: boss.name },
          createdAt: nowIso,
        })
        .run()
    }

    const updated = tx.select().from(bossBattles).where(eq(bossBattles.id, active.id)).get()!

    return { battle: updated, combatSummary: turn }
  }, conn)
}

// ─── Friends & Decentralized Leaderboard ───────────────────────────────────

export function listFriends(database?: LearningHubDB): (typeof friends.$inferSelect)[] {
  const conn = database ?? getDb()
  return conn.select().from(friends).orderBy(desc(friends.id)).all()
}

export function addFriend(
  alias: string,
  gistUrl: string,
  database?: LearningHubDB,
): typeof friends.$inferSelect {
  const conn = database ?? getDb()
  const nowIso = new Date().toISOString()
  const [created] = conn
    .insert(friends)
    .values({
      alias,
      gistUrl,
      createdAt: nowIso,
    })
    .returning()
    .all()
  return created!
}

export function updateFriendSync(id: number, dataJson: string, database?: LearningHubDB): void {
  const conn = database ?? getDb()
  const nowIso = new Date().toISOString()
  conn
    .update(friends)
    .set({
      lastDataJson: dataJson,
      lastSyncedAt: nowIso,
    })
    .where(eq(friends.id, id))
    .run()
}

export function deleteFriend(id: number, database?: LearningHubDB): boolean {
  const conn = database ?? getDb()
  const existing = conn.select().from(friends).where(eq(friends.id, id)).get()
  if (!existing) return false
  conn.delete(friends).where(eq(friends.id, id)).run()
  return true
}

export function generateUserStatsEnvelope(database?: LearningHubDB): FriendStats {
  const conn = database ?? getDb()
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // 1. Total reviews
  const [totalRow] = conn
    .select({ count: sql<number>`count(*)` })
    .from(revlog)
    .all()
  const totalReviews = totalRow?.count ?? 0

  // 2. Weekly XP
  const [xpRow] = conn
    .select({ total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)` })
    .from(xpEvents)
    .where(gte(xpEvents.createdAt, sevenDaysAgo))
    .all()
  const weeklyXp = xpRow?.total ?? 0

  // 3. Level estimate (every 250 XP = 1 level)
  const [allTimeXpRow] = conn
    .select({ total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)` })
    .from(xpEvents)
    .all()
  const allTimeXp = allTimeXpRow?.total ?? 0
  const level = Math.max(1, Math.floor(allTimeXp / 250) + 1)

  // 4. Streak
  const [streakDays] = conn
    .select({ count: sql<number>`count(distinct substr(${revlog.reviewedAt}, 1, 10))` })
    .from(revlog)
    .all()
  const streak = Math.min(streakDays?.count ?? 0, 999)

  return {
    v: 1,
    schema: 'lh-stats/v1',
    username: 'Learner',
    streak,
    weeklyXp,
    totalReviews,
    level,
    updatedAt: now.toISOString(),
  }
}
