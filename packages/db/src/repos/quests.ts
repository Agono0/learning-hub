/**
 * Quests & Achievements repository — daily 4-part quest loops, live multi-metric progress tracking,
 * and unlock evaluations citing Clear's immediate rewards and Ryan & Deci's SDT competence.
 */
import { and, eq, gte, lt, lte, sql } from 'drizzle-orm'
import {
  ACHIEVEMENTS,
  dayKey,
  generateDailyQuests,
  unlockedAchievementKeys,
  type AchievementStats,
  type QuestItem,
} from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import {
  arenaRuns,
  achievements,
  cards,
  certificates,
  courseExamAttempts,
  examDates,
  focusSessions,
  habitLogs,
  habits,
  ideas,
  journalEntries,
  lessons,
  mastery,
  palaces,
  quests,
  revlog,
  streaks,
  userSettings,
  xpEvents,
} from '../schema'
import { withTransaction, type Transaction } from '../transaction'
import { awardXp } from './xp'

export type QuestRow = typeof quests.$inferSelect
export type AchievementRow = typeof achievements.$inferSelect

export interface DailyQuestsResult {
  date: string
  items: QuestItem[]
  allDone: boolean
  completed: boolean
  xpReward: number
}

export type CompleteQuestResult =
  | { success: true; items: QuestItem[]; allDone: boolean; xpAwarded: number; date: string }
  | { success: false; error: 'no_quests_today' | 'invalid_index' }

export interface UnlockedAchievementsResult {
  catalog: Array<{
    key: string
    title: string
    description: string | null
    unlocked: boolean
    unlockedAt: string | null
  }>
  stats: AchievementStats
  newlyUnlocked: string[]
}

function localDayRange(day: string, tzOffsetMinutes: number): { start: string; end: string } {
  const startMs = Date.parse(day + 'T00:00:00Z') + tzOffsetMinutes * 60_000
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 86_400_000).toISOString(),
  }
}

/**
 * Get or create today's daily quest set with live progress evaluated across
 * reviews, focus minutes, habits, and lessons.
 */
export function getOrCreateDailyQuests(
  opts: {
    tzOffset?: number
    now?: Date
    db?: LearningHubDB
  } = {},
): DailyQuestsResult {
  const db = opts.db ?? getDb()
  const tz = opts.tzOffset ?? 0
  const nowDate = opts.now ?? new Date()
  const today = dayKey(nowDate, tz)
  const nowIso = nowDate.toISOString()
  const { start, end } = localDayRange(today, tz)

  const [dueRow] = db
    .select({ n: sql<number>`count(*)` })
    .from(cards)
    .where(and(lte(cards.due, nowIso), eq(cards.suspended, false)))
    .all()

  const [habitsRow] = db
    .select({ n: sql<number>`count(*)` })
    .from(habits)
    .where(eq(habits.archived, false))
    .all()

  const [settings] = db.select().from(userSettings).limit(1).all()
  const focusMinutesTarget = settings?.sessionMinutes ?? 25
  // Learner profile (migration 030): attention style scales the daily dose.
  const attentionStyle = settings?.learnerProfile?.traits.attentionStyle
  const maxReviews =
    attentionStyle === 'sustained'
      ? 25
      : attentionStyle === 'sprints'
        ? 12
        : attentionStyle === 'variable'
          ? 18
          : undefined

  db.insert(quests)
    .values({
      date: today,
      items: generateDailyQuests({
        date: today,
        dueCount: dueRow?.n ?? 0,
        habitsCount: habitsRow?.n ?? 0,
        focusMinutesTarget,
        maxReviews,
      }),
    })
    .onConflictDoNothing()
    .run()

  const [row] = db.select().from(quests).where(eq(quests.date, today)).all()
  const stored: QuestItem[] = (row?.items ?? []) as QuestItem[]

  // Live progress within local day window
  const [reviewsToday] = db
    .select({ n: sql<number>`count(*)` })
    .from(revlog)
    .where(
      and(
        gte(revlog.reviewedAt, start),
        lt(revlog.reviewedAt, end),
        sql`NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = ${revlog.id})`,
      ),
    )
    .all()

  const [focusToday] = db
    .select({ minutes: sql<number>`coalesce(sum(${focusSessions.actualMinutes}), 0)` })
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.completed, true),
        gte(focusSessions.startedAt, start),
        lt(focusSessions.startedAt, end),
      ),
    )
    .all()

  const [habitsToday] = db
    .select({ n: sql<number>`count(*)` })
    .from(habitLogs)
    .where(eq(habitLogs.date, today))
    .all()

  const [lessonsToday] = db
    .select({ n: sql<number>`count(*)` })
    .from(lessons)
    .where(and(gte(lessons.completedAt, start), lt(lessons.completedAt, end)))
    .all()

  const items: QuestItem[] = stored.map((q) => {
    const live =
      q.type === 'reviews'
        ? (reviewsToday?.n ?? 0)
        : q.type === 'lesson'
          ? (lessonsToday?.n ?? 0)
          : q.type === 'focus'
            ? (focusToday?.minutes ?? 0)
            : (habitsToday?.n ?? 0)
    const progress = Math.max(q.progress, live)
    return { ...q, progress, done: q.done || progress >= q.target }
  })

  return {
    date: today,
    items,
    allDone: items.every((i) => i.done),
    completed: row ? row.completed : false,
    xpReward: row ? row.xpReward : 50,
  }
}

/**
 * Mark a quest item done at index. If completing the final item, flips completed:true
 * and awards the canonical XP once atomically.
 */
export function completeQuestItem(opts: {
  index: number
  tzOffset?: number
  now?: Date
  db?: LearningHubDB
}): CompleteQuestResult {
  const tz = opts.tzOffset ?? 0
  const nowDate = opts.now ?? new Date()
  const today = dayKey(nowDate, tz)

  return withTransaction((tx) => {
    const [row] = tx.select().from(quests).where(eq(quests.date, today)).all()
    if (!row) return { success: false, error: 'no_quests_today' }

    const storedItems = row.items as QuestItem[]
    if (opts.index < 0 || opts.index >= storedItems.length) {
      return { success: false, error: 'invalid_index' }
    }

    const items: QuestItem[] = storedItems.map((q, i) =>
      i === opts.index ? { ...q, done: true } : q,
    )
    tx.update(quests).set({ items }).where(eq(quests.id, row.id)).run()

    let xpAwarded = 0
    if (items.every((i) => i.done)) {
      const res = tx
        .update(quests)
        .set({ completed: true })
        .where(and(eq(quests.id, row.id), eq(quests.completed, false)))
        .run()

      if (res.changes > 0) {
        awardXp(tx, { source: 'quest', amount: row.xpReward, meta: { date: today } })
        xpAwarded = row.xpReward
      }
    }

    return {
      success: true,
      items,
      allDone: items.every((i) => i.done),
      xpAwarded,
      date: today,
    }
  }, opts.db)
}

/**
 * Get daily quest by date string.
 */
export function getDailyQuest(date: string, opts: { db?: LearningHubDB } = {}): QuestRow | null {
  const db = opts.db ?? getDb()
  const [row] = db.select().from(quests).where(eq(quests.date, date)).limit(1).all()
  return row ?? null
}

/**
 * Ensure all catalog items from ACHIEVEMENTS exist in the database.
 */
export function ensureAchievementCatalog(opts: { db?: LearningHubDB | Transaction } = {}): void {
  const db = opts.db ?? getDb()
  const rows = db.select().from(achievements).all()
  const known = new Set(rows.map((r) => r.key))
  const missing = ACHIEVEMENTS.filter((a) => !known.has(a.key))
  for (const a of missing) {
    db.insert(achievements)
      .values({ key: a.key, title: a.title, description: a.description })
      .onConflictDoNothing()
      .run()
  }
}

/**
 * Compute current aggregates across review, focus, streak, courses, skills, and ideas.
 */
export function getAchievementStats(
  opts: { db?: LearningHubDB | Transaction } = {},
): AchievementStats {
  const db = opts.db ?? getDb()

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

  const [arenaAgg] = db
    .select({
      runs: sql<number>`count(*)`,
      victories: sql<number>`sum(case when ${arenaRuns.result} = 'victory' then 1 else 0 end)`,
      bestCombo: sql<number>`coalesce(max(${arenaRuns.bestCombo}), 0)`,
      bossWins: sql<number>`sum(case when ${arenaRuns.result} = 'victory' and ${arenaRuns.boss} = true then 1 else 0 end)`,
      flawlessWins: sql<number>`sum(case when ${arenaRuns.result} = 'victory' and ${arenaRuns.rounds} >= 10 and ${arenaRuns.correct} = ${arenaRuns.rounds} then 1 else 0 end)`,
      totalCrits: sql<number>`coalesce(sum(${arenaRuns.crits}), 0)`,
    })
    .from(arenaRuns)
    .all()

  return {
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
    arenaRuns: Number(arenaAgg?.runs ?? 0),
    arenaVictories: Number(arenaAgg?.victories ?? 0),
    arenaBestCombo: Number(arenaAgg?.bestCombo ?? 0),
    arenaBossWins: Number(arenaAgg?.bossWins ?? 0),
    arenaFlawlessWins: Number(arenaAgg?.flawlessWins ?? 0),
    arenaTotalCrits: Number(arenaAgg?.totalCrits ?? 0),
  }
}

/**
 * Check achievements against current stats, unlock any eligible ones with canonical XP award,
 * and return the full catalog.
 */
export function evaluateAndUnlockAchievements(
  opts: {
    now?: Date
    db?: LearningHubDB | Transaction
  } = {},
): UnlockedAchievementsResult {
  const db = opts.db ?? getDb()
  ensureAchievementCatalog({ db })
  const stats = getAchievementStats({ db })
  const unlockedNow = unlockedAchievementKeys(stats)

  const byKey = new Map(
    db
      .select()
      .from(achievements)
      .all()
      .map((r) => [r.key, r]),
  )
  const nowIso = (opts.now ?? new Date()).toISOString()
  const newlyUnlocked: string[] = []

  for (const key of unlockedNow) {
    const row = byKey.get(key)
    if (row && row.unlockedAt == null) {
      db.update(achievements).set({ unlockedAt: nowIso }).where(eq(achievements.id, row.id)).run()
      awardXp(db, { source: 'achievement', meta: { key } })
      newlyUnlocked.push(key)
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

  return { catalog, stats, newlyUnlocked }
}

/**
 * List all achievement badge rows.
 */
export function listAchievements(opts: { db?: LearningHubDB } = {}): AchievementRow[] {
  const db = opts.db ?? getDb()
  return db.select().from(achievements).all()
}
