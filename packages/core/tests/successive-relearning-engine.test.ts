import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_SUCCESSIVE_SUITES,
  advancePlanToNextSession,
  calculateDeceleratedLambda,
  calculateEbbinghausSavings,
  calibrateFSRSDifficulty,
  calibrateFSRSStability,
  computeQueueState,
  createRelearningItem,
  flagHighAttritionItems,
  generateRelearningAudit,
  predictRetentionAtDays,
  recordItemTrial,
  relearningPlanSchema,
  synthesizeFSRSDeckCards,
} from '../src/successive-relearning'

describe('Successive Relearning & Ebbinghaus Savings Engine (Rawson & Dunlosky 2011, 2012)', () => {
  it('calculates Ebbinghaus Savings percentage accurately across edge cases', () => {
    // 4 initial trials reduced to 2 in relearning -> 50% savings
    expect(calculateEbbinghausSavings(4, 2)).toBe(50)
    // 5 initial trials reduced to 1 in relearning -> 80% savings
    expect(calculateEbbinghausSavings(5, 1)).toBe(80)
    // 3 initial trials, 0 relearning trials -> 100% savings
    expect(calculateEbbinghausSavings(3, 0)).toBe(100)
    // Relearning took more trials than initial -> 0% savings (never negative)
    expect(calculateEbbinghausSavings(2, 4)).toBe(0)
    // Zero initial trials
    expect(calculateEbbinghausSavings(0, 2)).toBe(0)
  })

  it('computes decelerating forgetting decay lambda over successive waves', () => {
    const l0 = calculateDeceleratedLambda(0)
    const l1 = calculateDeceleratedLambda(1)
    const l2 = calculateDeceleratedLambda(2)
    const l3 = calculateDeceleratedLambda(3)

    expect(l0).toBe(0.12)
    expect(l1).toBeLessThan(l0)
    expect(l2).toBeLessThan(l1)
    expect(l3).toBeLessThan(l2)
    // Deceleration must remain positive and strictly > 0.005
    expect(l3).toBeGreaterThan(0.005)
  })

  it('predicts retention decay according to exponential forgetting curve', () => {
    const lambda = 0.1
    // Day 0: 100%
    expect(predictRetentionAtDays(lambda, 0)).toBe(1.0)
    // Day 7: exp(-0.7) ~= 0.497
    const r7 = predictRetentionAtDays(lambda, 7)
    expect(r7).toBeGreaterThan(0.49)
    expect(r7).toBeLessThan(0.51)
    // Monotonic decay
    expect(predictRetentionAtDays(lambda, 14)).toBeLessThan(r7)
  })

  it('calibrates FSRS stability and difficulty based on acquisition trials', () => {
    const stab0 = calibrateFSRSStability(0.12)
    const stab3 = calibrateFSRSStability(0.05)
    expect(stab3).toBeGreaterThan(stab0)

    // Trials equal to criterion (e.g. 2 trials for criterion 2) -> difficulty is low
    const easyDiff = calibrateFSRSDifficulty(2, 2)
    expect(easyDiff).toBe(2.5)

    // Many trials to reach criterion -> difficulty approaches high
    const hardDiff = calibrateFSRSDifficulty(6, 2)
    expect(hardDiff).toBeGreaterThan(easyDiff)
    expect(hardDiff).toBeLessThanOrEqual(10.0)
  })

  it('enforces criterion-dropout protocol on item trials', () => {
    const item = createRelearningItem({
      id: 'test-1',
      prompt: 'What is FLP theorem?',
      targetAnswer: 'Impossibility of consensus in async networks with 1 failure',
      conceptCluster: 'Distributed Systems',
      acquisitionCriterion: 2,
    })

    expect(item.sessionCriterionMet).toBe(false)
    expect(item.sessionConsecutiveStreak).toBe(0)

    // Trial 1: Correct (streak = 1, criterion is 2 -> not yet met)
    const t1 = recordItemTrial(item, {
      itemId: 'test-1',
      isCorrect: true,
      latencyMs: 1200,
    })
    expect(t1.updatedItem.sessionConsecutiveStreak).toBe(1)
    expect(t1.updatedItem.sessionCriterionMet).toBe(false)
    expect(t1.justMetCriterion).toBe(false)

    // Trial 2: Mistake (streak resets to 0)
    const t2 = recordItemTrial(t1.updatedItem, {
      itemId: 'test-1',
      isCorrect: false,
      latencyMs: 2500,
    })
    expect(t2.updatedItem.sessionConsecutiveStreak).toBe(0)
    expect(t2.updatedItem.sessionMistakeCount).toBe(1)
    expect(t2.updatedItem.sessionCriterionMet).toBe(false)

    // Trial 3: Correct (streak = 1)
    const t3 = recordItemTrial(t2.updatedItem, {
      itemId: 'test-1',
      isCorrect: true,
      latencyMs: 1100,
    })
    expect(t3.updatedItem.sessionConsecutiveStreak).toBe(1)
    expect(t3.updatedItem.sessionCriterionMet).toBe(false)

    // Trial 4: Correct (streak = 2 -> criterion met!)
    const t4 = recordItemTrial(t3.updatedItem, {
      itemId: 'test-1',
      isCorrect: true,
      latencyMs: 900,
    })
    expect(t4.updatedItem.sessionConsecutiveStreak).toBe(2)
    expect(t4.updatedItem.sessionCriterionMet).toBe(true)
    expect(t4.justMetCriterion).toBe(true)
    expect(t4.updatedItem.initialTrialsToCriterion).toBe(4)
  })

  it('computes queue state and handles advancePlanToNextSession with Ebbinghaus savings', () => {
    const suite = CALIBRATED_SUCCESSIVE_SUITES.distributed_systems!
    const plan = relearningPlanSchema.parse({
      id: 'plan-dist',
      title: suite.title,
      domain: suite.domain,
      targetCriterion: 1,
      currentSessionIndex: 0,
      scheduleDays: [1, 3, 7, 16, 35],
      items: suite.items.map((i) =>
        createRelearningItem({
          id: i.id,
          prompt: i.prompt,
          targetAnswer: i.targetAnswer,
          conceptCluster: i.conceptCluster,
          mnemonicCue: i.mnemonicCue,
          acquisitionCriterion: 1,
        }),
      ),
      sessionHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const initialQueue = computeQueueState(plan)
    expect(initialQueue.activeQueueItemIds.length).toBe(4)
    expect(initialQueue.completedItemIds.length).toBe(0)
    expect(initialQueue.sessionCriterionPercent).toBe(0)

    // Attempting to advance before criterion raises error
    expect(() => advancePlanToNextSession(plan)).toThrowError(
      /Cannot advance session: 4 items have not yet met acquisition criterion/,
    )

    // Complete all items in session 0
    let workingPlan = plan
    for (const item of workingPlan.items) {
      const res = recordItemTrial(item, {
        itemId: item.id,
        isCorrect: true,
        latencyMs: 1100,
      })
      workingPlan = {
        ...workingPlan,
        items: workingPlan.items.map((it) => (it.id === item.id ? res.updatedItem : it)),
      }
    }

    const completedQueue = computeQueueState(workingPlan)
    expect(completedQueue.activeQueueItemIds.length).toBe(0)
    expect(completedQueue.completedItemIds.length).toBe(4)
    expect(completedQueue.sessionCriterionPercent).toBe(100)

    // Advance to Session 1
    const { updatedPlan, sessionSummary } = advancePlanToNextSession(workingPlan)
    expect(updatedPlan.currentSessionIndex).toBe(1)
    expect(sessionSummary.totalTrials).toBe(4)
    expect(updatedPlan.sessionHistory.length).toBe(1)

    // In Session 1, items have been reset to active queue
    const s1Queue = computeQueueState(updatedPlan)
    expect(s1Queue.activeQueueItemIds.length).toBe(4)
    expect(s1Queue.completedItemIds.length).toBe(0)
  })

  it('detects high attrition items and generates comprehensive audit report', () => {
    const items = [
      {
        ...createRelearningItem({
          id: 'i1',
          prompt: 'P1',
          targetAnswer: 'A1',
          conceptCluster: 'C1',
        }),
        initialTrialsToCriterion: 2,
      },
      {
        ...createRelearningItem({
          id: 'i2',
          prompt: 'P2',
          targetAnswer: 'A2',
          conceptCluster: 'C1',
        }),
        initialTrialsToCriterion: 6, // High attrition outlier
      },
    ]

    const flagged = flagHighAttritionItems(items)
    expect(flagged.find((i) => i.id === 'i2')?.highAttritionFlag).toBe(true)
    expect(flagged.find((i) => i.id === 'i1')?.highAttritionFlag).toBe(false)

    const testPlan = relearningPlanSchema.parse({
      id: 'audit-plan',
      title: 'Audit Test',
      domain: 'Testing',
      targetCriterion: 2,
      currentSessionIndex: 1,
      scheduleDays: [1, 3, 7],
      items: flagged,
      sessionHistory: [
        {
          sessionIndex: 0,
          completedAt: new Date().toISOString(),
          totalTrials: 8,
          totalItems: 2,
          averageTrialsToCriterion: 4,
          averageSavingsPercent: 0,
          medianLatencyMs: 1400,
          retentionEstimateAtStart: 0.35,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const audit = generateRelearningAudit(testPlan)
    expect(audit.totalItems).toBe(2)
    expect(audit.highAttritionItems.length).toBe(1)
    expect(audit.highAttritionItems[0]?.itemId).toBe('i2')
    expect(audit.highAttritionItems[0]?.remediationRecommendation).toContain('Dual Coding')
    expect(audit.ebbinghausSavingsCurve.length).toBe(3)

    // Synthesize cards
    const cards = synthesizeFSRSDeckCards(testPlan)
    expect(cards.length).toBe(2)
    expect(cards[0]?.id).toBe('sr-card-i1')
    expect(cards[0]?.calibratedStability).toBeGreaterThan(0)
  })
})
