import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  achievements,
  completeQuestItem,
  createGoal,
  createIfThenPlan,
  deleteGoal,
  deleteIfThenPlan,
  ensureAchievementCatalog,
  evaluateAndUnlockAchievements,
  getDailyQuest,
  getGoal,
  getIfThenPlan,
  getOrCreateDailyQuests,
  goals,
  goalsQuotes,
  ifthenPlans,
  initDb,
  linkGoalQuote,
  listAchievements,
  listGoalQuotes,
  listGoals,
  listIfThenPlans,
  quests,
  revlog,
  setDb,
  unlinkGoalQuote,
  updateGoal,
  updateIfThenPlan,
  xpEvents,
  type LearningHubDB,
} from '../src/index'

let testDb: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-goals-quests-'))
  testDb = await initDb({ path: join(tmp, 'goals-quests.db') })
  setDb(testDb)
})

beforeEach(() => {
  testDb.delete(goalsQuotes).run()
  testDb.delete(goals).run()
  testDb.delete(ifthenPlans).run()
  testDb.delete(quests).run()
  testDb.delete(achievements).run()
  testDb.delete(xpEvents).run()
  testDb.delete(revlog).run()
})

afterAll(() => {
  try {
    ;(testDb as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('Goals repository (Batch B4)', () => {
  it('creates, lists, updates, and deletes WOOP goals with status transition detection', () => {
    const g1 = createGoal(
      {
        wish: 'Master Distributed Systems',
        outcome: 'Lead architecture decisions confidently',
        obstacle: 'Complex consensus algorithms can be confusing',
        ifThenPlan: 'If I struggle with Paxos, then I will build Raft in Go',
        ifCondition: "it's 08:00 and focus block begins",
        thenAction: 'read 1 section of Raft paper',
      },
      { db: testDb },
    )

    expect(g1.id).toBeDefined()
    expect(g1.status).toBe('active')
    expect(g1.progressPct).toBe(0)

    const fetched = getGoal(g1.id, { db: testDb })
    expect(fetched?.wish).toBe('Master Distributed Systems')
    expect(fetched?.ifCondition).toBe("it's 08:00 and focus block begins")

    // Update with status transition to 'done'
    const updated = updateGoal(g1.id, { progressPct: 100, status: 'done' }, { db: testDb })
    expect(updated.goal?.status).toBe('done')
    expect(updated.goal?.progressPct).toBe(100)
    expect(updated.completedJustNow).toBe(true)

    // Updating again when already 'done' does not report completedJustNow: true
    const updatedAgain = updateGoal(g1.id, { progressPct: 100 }, { db: testDb })
    expect(updatedAgain.completedJustNow).toBe(false)

    // Filter by status
    const activeGoals = listGoals({ status: 'active', db: testDb })
    expect(activeGoals).toHaveLength(0)
    const doneGoals = listGoals({ status: 'done', db: testDb })
    expect(doneGoals).toHaveLength(1)

    // Delete goal
    const deleted = deleteGoal(g1.id, { db: testDb })
    expect(deleted).toBe(true)
    expect(getGoal(g1.id, { db: testDb })).toBeNull()
  })

  it('manages goal-quote bindings with cascade deletion', () => {
    const goal = createGoal({ wish: 'Daily writing practice' }, { db: testDb })
    linkGoalQuote(goal.id, 42, { db: testDb })
    linkGoalQuote(goal.id, 99, { db: testDb })

    const quoteIds = listGoalQuotes(goal.id, { db: testDb })
    expect(quoteIds).toContain(42)
    expect(quoteIds).toContain(99)

    unlinkGoalQuote(goal.id, 42, { db: testDb })
    expect(listGoalQuotes(goal.id, { db: testDb })).toEqual([99])

    deleteGoal(goal.id, { db: testDb })
    expect(listGoalQuotes(goal.id, { db: testDb })).toHaveLength(0)
  })

  it('manages if-then implementation intention plans', () => {
    const plan = createIfThenPlan(
      {
        condition: 'Feel urge to browse social media during deep work',
        action: 'Stand up and take 3 deep breaths, then write 1 paragraph',
        context: 'focus',
      },
      { db: testDb },
    )

    expect(plan.id).toBeDefined()
    expect(plan.active).toBe(true)

    const listed = listIfThenPlans({ context: 'focus', activeOnly: true, db: testDb })
    expect(listed).toHaveLength(1)
    expect(listed[0]!.id).toBe(plan.id)

    const updated = updateIfThenPlan(plan.id, { active: false }, { db: testDb })
    expect(updated?.active).toBe(false)

    const activeListed = listIfThenPlans({ context: 'focus', activeOnly: true, db: testDb })
    expect(activeListed).toHaveLength(0)

    deleteIfThenPlan(plan.id, { db: testDb })
    expect(getIfThenPlan(plan.id, { db: testDb })).toBeNull()
  })
})

describe('Quests & Achievements repository (Batch B4)', () => {
  it('generates daily quests deterministically and completes items atomically with XP reward', () => {
    const questsResult = getOrCreateDailyQuests({ db: testDb })
    expect(questsResult.items.length).toBeGreaterThanOrEqual(3)
    expect(questsResult.completed).toBe(false)

    const date = questsResult.date
    const questRow = getDailyQuest(date, { db: testDb })
    expect(questRow).toBeDefined()

    // Complete all items one by one
    for (let i = 0; i < questsResult.items.length - 1; i++) {
      const res = completeQuestItem({ index: i, db: testDb })
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.allDone).toBe(false)
        expect(res.xpAwarded).toBe(0)
      }
    }

    // Complete final item -> triggers allDone and awards canonical XP
    const finalRes = completeQuestItem({ index: questsResult.items.length - 1, db: testDb })
    expect(finalRes.success).toBe(true)
    if (finalRes.success) {
      expect(finalRes.allDone).toBe(true)
      expect(finalRes.xpAwarded).toBe(50)
    }

    // Completing again does not double-award XP
    const repeatRes = completeQuestItem({ index: 0, db: testDb })
    expect(repeatRes.success).toBe(true)
    if (repeatRes.success) {
      expect(repeatRes.xpAwarded).toBe(0)
    }

    // Invalid index returns error
    const badIndexRes = completeQuestItem({ index: 999, db: testDb })
    expect(badIndexRes.success).toBe(false)
    if (!badIndexRes.success) {
      expect(badIndexRes.error).toBe('invalid_index')
    }
  })

  it('populates achievement catalog and unlocks achievements with XP award', () => {
    ensureAchievementCatalog({ db: testDb })
    const allBadges = listAchievements({ db: testDb })
    expect(allBadges.length).toBeGreaterThanOrEqual(10)

    // Initially none unlocked
    const evaluation1 = evaluateAndUnlockAchievements({ db: testDb })
    expect(evaluation1.catalog.every((b) => !b.unlocked)).toBe(true)
    expect(evaluation1.newlyUnlocked).toHaveLength(0)

    // Insert 1 review into revlog to meet 'first-review' criteria
    testDb
      .insert(revlog)
      .values({
        id: Date.now(),
        cardId: 1,
        rating: 3,
        state: 0,
        elapsedDays: 0,
        scheduledDays: 1,
        timeMs: 2500,
        reviewedAt: new Date().toISOString(),
      })
      .run()

    // Next evaluation should unlock 'first_review' badge
    const evaluation2 = evaluateAndUnlockAchievements({ db: testDb })
    expect(evaluation2.newlyUnlocked).toContain('first_review')
    const firstReviewBadge = evaluation2.catalog.find((b) => b.key === 'first_review')
    expect(firstReviewBadge?.unlocked).toBe(true)
    expect(firstReviewBadge?.unlockedAt).toBeDefined()

    // Subsequent evaluation does not re-unlock
    const evaluation3 = evaluateAndUnlockAchievements({ db: testDb })
    expect(evaluation3.newlyUnlocked).toHaveLength(0)
  })
})
