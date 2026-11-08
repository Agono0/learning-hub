/**
 * Learning HUB — Serverless Social repository.
 *
 * Solo boss battles derived from revlog, and decentralized Gist friend connections.
 */
import { and, desc, eq, gt, gte, sql } from 'drizzle-orm'
import { BOSS_ROSTER, calculateCombatTurn } from '@learning-hub/core/boss'
import { computeLevel } from '@learning-hub/core/motivation'
import type { FriendStats } from '@learning-hub/core/share'
import { liveStreak } from '@learning-hub/core/streaks'
import { getDb, type LearningHubDB } from '../index'
import { bossBattles, friends, onlineIdentity, revlog, streaks, xpEvents } from '../schema'
import { withTransaction } from '../transaction'
import { awardXp } from './xp'

/** SQL predicate: this revlog row has not been undone (undone reviews never count). */
const notUndone = sql`NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = ${revlog.id})`

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

  // Read and write in one transaction so two concurrent syncs can't both
  // observe "active" and both pay the victory bounty.
  return withTransaction((tx) => {
    const active = tx
      .select()
      .from(bossBattles)
      .where(eq(bossBattles.status, 'active'))
      .orderBy(desc(bossBattles.id))
      .limit(1)
      .get()
    if (!active) return { battle: null }

    const boss = BOSS_ROSTER[active.bossKey] ?? BOSS_ROSTER.chronos!

    // Every (non-undone) review since the battle started. `timeMs` is the
    // answer time — the speed bonus is "answered in under 4 s".
    const reviews = tx
      .select({ id: revlog.id, grade: revlog.rating, timeMs: revlog.timeMs })
      .from(revlog)
      .where(and(gt(revlog.id, active.revlogStartId), notUndone))
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

    const res = tx
      .update(bossBattles)
      .set({ currentHp, playerHp, status, endedAt })
      .where(and(eq(bossBattles.id, active.id), eq(bossBattles.status, 'active')))
      .run()

    // Bounty is paid exactly once: on the transition out of 'active'.
    if (status === 'victory' && res.changes > 0) {
      // Rule 7: XP via the canonical awardXp path (repos/xp.ts); boss bounty
      // is a dynamic amount → passed explicitly.
      awardXp(tx, {
        source: 'boss',
        amount: boss.rewardXp,
        meta: { bossKey: boss.key, bossName: boss.name, battleId: active.id },
        atMs: new Date(nowIso).getTime(),
      })
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

  // 1. Total reviews (undone reviews don't count)
  const [totalRow] = conn
    .select({ count: sql<number>`count(*)` })
    .from(revlog)
    .where(notUndone)
    .all()
  const totalReviews = totalRow?.count ?? 0

  // 2. Weekly XP
  const [xpRow] = conn
    .select({ total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)` })
    .from(xpEvents)
    .where(gte(xpEvents.createdAt, sevenDaysAgo))
    .all()
  const weeklyXp = xpRow?.total ?? 0

  // 3. Level — the same curve the app shows the user (friends must see the same number)
  const [allTimeXpRow] = conn
    .select({ total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)` })
    .from(xpEvents)
    .all()
  const level = computeLevel(allTimeXpRow?.total ?? 0).level

  // 4. Streak — the live consecutive-day streak, not "distinct days ever"
  const row = conn.select().from(streaks).limit(1).get()
  const streak = row
    ? liveStreak(
        {
          current: row.current,
          best: row.best,
          lastActiveDate: row.lastActiveDate,
          freezes: row.freezes,
          weekendAmulet: Boolean(row.weekendAmulet),
        },
        now,
      )
    : 0

  // 5. Public alias (read-only — never creates an identity as a side effect)
  const alias = conn.select({ alias: onlineIdentity.alias }).from(onlineIdentity).limit(1).get()

  return {
    v: 1,
    schema: 'lh-stats/v1',
    username: alias?.alias?.trim() || 'Learner',
    streak,
    weeklyXp,
    totalReviews,
    level,
    updatedAt: now.toISOString(),
  }
}
