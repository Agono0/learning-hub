import { eq, sql } from 'drizzle-orm'
import { eventBus } from '@learning-hub/core'
import { db } from '@/lib/db'
import {
  achievements,
  awardXp,
  certificates,
  courseExamAttempts,
  examDates,
  focusSessions,
  ideas,
  journalEntries,
  mastery,
  palaces,
  revlog,
  streaks,
  xpEvents,
} from '@learning-hub/db'
import { ACHIEVEMENTS, unlockedAchievementKeys, type AchievementStats } from '@learning-hub/core'

/** GET /api/achievements — catalog with live unlock check from real aggregates. */
export async function GET() {
  // make sure every catalog key has a row (idempotent)
  const rows = db.select().from(achievements).all()
  const known = new Set(rows.map((r) => r.key))
  const missing = ACHIEVEMENTS.filter((a) => !known.has(a.key))
  if (missing.length > 0) {
    for (const a of missing) {
      db.insert(achievements)
        .values({ key: a.key, title: a.title, description: a.description })
        .onConflictDoNothing()
        .run()
    }
  }

  // live stats over real data
  const [reviewCount] = db
    .select({ n: sql<number>`count(*)` })
    .from(revlog)
    .where(sql`NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = ${revlog.id})`)
    .all()
  const [streakRow] = db.select().from(streaks).limit(1).all()
  const [teachbackCount] = db
    .select({ n: sql<number>`count(*)` })
    .from(xpEvents)
    .where(sql`${xpEvents.source} = 'teachback'`)
    .all()
  const [focusCount] = db
    .select({ n: sql<number>`count(*)` })
    .from(focusSessions)
    .where(eq(focusSessions.completed, true))
    .all()
  const [focusMinutes] = db
    .select({ minutes: sql<number>`coalesce(sum(${focusSessions.actualMinutes}), 0)` })
    .from(focusSessions)
    .where(eq(focusSessions.completed, true))
    .all()
  const coursesCompleted = db.all<{ n: number }>(
    sql`SELECT count(*) AS n FROM courses c WHERE EXISTS (
      SELECT 1 FROM lessons l JOIN units u ON l.unit_id = u.id
      WHERE u.course_id = c.id
    ) AND NOT EXISTS (
      SELECT 1 FROM lessons l JOIN units u ON l.unit_id = u.id
      WHERE u.course_id = c.id AND l.completed_at IS NULL
    )`,
  )
  const [mastered] = db
    .select({ n: sql<number>`count(*)` })
    .from(mastery)
    .where(sql`${mastery.pKnown} >= 0.95 AND ${mastery.attempts} >= 5`)
    .all()
  const [ideasCount] = db
    .select({ n: sql<number>`count(*)` })
    .from(ideas)
    .all()
  const [ideasEvolved] = db
    .select({ n: sql<number>`count(*)` })
    .from(ideas)
    .where(sql`${ideas.stage} != 'seed'`)
    .all()
  const [journalCount] = db
    .select({ n: sql<number>`count(*)` })
    .from(journalEntries)
    .all()
  const [examCount] = db
    .select({ n: sql<number>`count(*)` })
    .from(examDates)
    .all()
  const [palaceCount] = db
    .select({ n: sql<number>`count(*)` })
    .from(palaces)
    .all()
  const [certificateCount] = db
    .select({ n: sql<number>`count(*)` })
    .from(certificates)
    .all()
  const [examsAced] = db
    .select({ n: sql<number>`count(*)` })
    .from(courseExamAttempts)
    .where(sql`${courseExamAttempts.score} >= 0.8`)
    .all()

  const stats: AchievementStats = {
    totalReviews: reviewCount?.n ?? 0,
    streakBest: streakRow?.best ?? 0,
    streakCurrent: streakRow?.current ?? 0,
    teachbackCount: teachbackCount?.n ?? 0,
    focusSessions: focusCount?.n ?? 0,
    focusMinutes: focusMinutes?.minutes ?? 0,
    coursesCompleted: coursesCompleted[0]?.n ?? 0,
    masteredSkills: mastered?.n ?? 0,
    ideasCaptured: ideasCount?.n ?? 0,
    ideasEvolved: ideasEvolved?.n ?? 0,
    journalEntries: journalCount?.n ?? 0,
    examsPrepped: examCount?.n ?? 0,
    palacesBuilt: palaceCount?.n ?? 0,
    certificates: certificateCount?.n ?? 0,
    examsAced: examsAced?.n ?? 0,
  }

  const unlockedNow = unlockedAchievementKeys(stats)
  const byKey = new Map(
    db
      .select()
      .from(achievements)
      .all()
      .map((r) => [r.key, r]),
  )
  const nowIso = new Date().toISOString()
  const newlyUnlocked: string[] = []

  for (const key of unlockedNow) {
    const row = byKey.get(key)
    if (row && row.unlockedAt == null) {
      db.update(achievements).set({ unlockedAt: nowIso }).where(eq(achievements.id, row.id)).run()
      // Rule 7: XP via the canonical awardXp path (repos/xp.ts).
      awardXp(db, { source: 'achievement', meta: { key } })
      newlyUnlocked.push(key)
      // Fact after the write: the badge is unlocked (listeners: plugins, sounds…).
      eventBus.emit('achievement.unlocked', { achievementId: key })
    }
  }

  const catalog = ACHIEVEMENTS.map((a) => {
    const row = byKey.get(a.key)
    const unlocked = unlockedNow.includes(a.key)
    return {
      key: a.key,
      title: a.title,
      description: a.description,
      unlocked,
      unlockedAt: unlocked ? (row?.unlockedAt == null ? nowIso : row.unlockedAt) : null,
    }
  })

  return Response.json({ catalog, stats, newlyUnlocked })
}
