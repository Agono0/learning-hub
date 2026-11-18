import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import {
  CALIBRATED_SUCCESSIVE_SUITES,
  createRelearningItem,
  relearningPlanSchema,
} from '@learning-hub/core/successive-relearning'
import { SuccessiveRelearningHUD } from '../src/ui/SuccessiveRelearningHUD'
import { GET, POST } from '../src/server/handlers/practice/successive-relearning/route'

describe('Successive Relearning Studio & API Integration', () => {
  it('GET /api/practice/successive-relearning initializes and returns calibrated suite plan', async () => {
    const req = new Request(
      'http://localhost/api/practice/successive-relearning?suiteId=distributed_systems',
    )
    const res = await GET(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.plan.title).toContain('Distributed Consensus')
    expect(data.plan.items.length).toBe(4)
    expect(data.queue.activeQueueItemIds.length).toBe(4)
    expect(data.queue.sessionCriterionPercent).toBe(0)
    expect(data.audit.totalItems).toBe(4)
  })

  it('POST /api/practice/successive-relearning records trials and enforces dropout queue', async () => {
    const suite = CALIBRATED_SUCCESSIVE_SUITES.distributed_systems!
    const plan = relearningPlanSchema.parse({
      id: 'test-plan',
      title: suite.title,
      domain: suite.domain,
      targetCriterion: 2,
      currentSessionIndex: 0,
      scheduleDays: [1, 3, 7, 16, 35],
      items: suite.items.map((i) =>
        createRelearningItem({
          id: i.id,
          prompt: i.prompt,
          targetAnswer: i.targetAnswer,
          conceptCluster: i.conceptCluster,
          acquisitionCriterion: 2,
        }),
      ),
      sessionHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const targetItemId = plan.items[0]!.id

    // First trial: correct
    const postReq1 = new Request('http://localhost/api/practice/successive-relearning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'record_trial',
        plan,
        trial: { itemId: targetItemId, isCorrect: true },
      }),
    })
    const res1 = await POST(postReq1)
    expect(res1.status).toBe(200)
    const data1 = await res1.json()
    expect(data1.ok).toBe(true)
    expect(data1.updatedItem.sessionConsecutiveStreak).toBe(1)
    expect(data1.justMetCriterion).toBe(false)
    expect(data1.queue.completedItemIds.length).toBe(0)

    // Second trial: correct (criterion 2 met -> drops out)
    const postReq2 = new Request('http://localhost/api/practice/successive-relearning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'record_trial',
        plan: data1.plan,
        trial: { itemId: targetItemId, isCorrect: true },
      }),
    })
    const res2 = await POST(postReq2)
    const data2 = await res2.json()
    expect(data2.ok).toBe(true)
    expect(data2.updatedItem.sessionConsecutiveStreak).toBe(2)
    expect(data2.justMetCriterion).toBe(true)
    expect(data2.queue.completedItemIds).toContain(targetItemId)
    expect(data2.queue.activeQueueItemIds).not.toContain(targetItemId)
  })

  it('POST /api/practice/successive-relearning advances wave and generates audit & deck cards', async () => {
    const suite = CALIBRATED_SUCCESSIVE_SUITES.distributed_systems!
    // Construct plan where all items already met criterion
    const plan = relearningPlanSchema.parse({
      id: 'completed-plan',
      title: suite.title,
      domain: suite.domain,
      targetCriterion: 1,
      currentSessionIndex: 0,
      scheduleDays: [1, 3, 7, 16, 35],
      items: suite.items.map((i) => ({
        ...createRelearningItem({
          id: i.id,
          prompt: i.prompt,
          targetAnswer: i.targetAnswer,
          conceptCluster: i.conceptCluster,
          acquisitionCriterion: 1,
        }),
        sessionCriterionMet: true,
        sessionConsecutiveStreak: 1,
        trialsInCurrentSession: 2,
        initialTrialsToCriterion: 2,
      })),
      sessionHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    // Advance wave
    const advanceReq = new Request('http://localhost/api/practice/successive-relearning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'advance_session',
        plan,
      }),
    })
    const advanceRes = await POST(advanceReq)
    expect(advanceRes.status).toBe(200)
    const advanceData = await advanceRes.json()
    expect(advanceData.ok).toBe(true)
    expect(advanceData.plan.currentSessionIndex).toBe(1)
    expect(advanceData.sessionSummary.totalTrials).toBe(8)
    expect(advanceData.queue.activeQueueItemIds.length).toBe(4)

    // Synthesize deck cards
    const deckReq = new Request('http://localhost/api/practice/successive-relearning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'synthesize_deck',
        plan: advanceData.plan,
      }),
    })
    const deckRes = await POST(deckReq)
    const deckData = await deckRes.json()
    expect(deckData.ok).toBe(true)
    expect(deckData.totalCards).toBe(4)
    expect(deckData.cards[0].calibratedStability).toBeGreaterThan(0)
  })

  it('renders SuccessiveRelearningHUD without errors or ghost classes', () => {
    const html = renderToString(
      React.createElement(SuccessiveRelearningHUD, {
        currentSessionIndex: 1,
        totalSessions: 5,
        sessionCriterionPercent: 75,
        activeQueueCount: 1,
        completedCount: 3,
        ebbinghausSavingsPercent: 62.5,
        retentionDecayLambda: 0.082,
        estimatedRetention: 0.91,
        nextSessionDueInDays: 3,
        canAdvanceSession: false,
      }),
    )

    expect(html).toContain('Successive Relearning &amp; Ebbinghaus Savings HUD')
    expect(html).toContain('75%')
    expect(html).toContain('62.5%')
    expect(html).toContain('0.0820')
    expect(html).toContain('91%')
  })
})
