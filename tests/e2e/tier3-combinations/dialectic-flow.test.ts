import { describe, it, expect } from 'vitest'
import { callRoute } from '../helpers/api-client'
import { db, xpEvents } from '@learning-hub/db'
import { eq } from 'drizzle-orm'
import * as arenaRoute from '../../../apps/web/app/api/dialectic/arena/route'

describe('Tier 3 E2E: Dialectic Courtroom Debate, Fallacy Grading & Canonical XP Award', () => {
  it('runs complete dialectic case from initiation to fallacy grading, verdict, and XP reward', async () => {
    // 1. Start a library debate case
    const startRes = await callRoute<{
      ok: boolean
      debate: { id: number; topic: string }
    }>(arenaRoute.POST, {
      method: 'POST',
      body: {
        action: 'start_case',
        slug: 'monolith-vs-microservices',
      },
    })

    expect(startRes.status).toBe(201)
    expect(startRes.data.ok).toBe(true)
    const debateId = startRes.data.debate.id
    expect(debateId).toBeDefined()

    // 2. Query the active debate
    const getRes = await callRoute<{
      ok: boolean
      debate: { id: number; transcript: Array<{ id: string; speaker: string }> }
    }>(arenaRoute.GET, {
      method: 'GET',
      query: { id: debateId },
    })

    expect(getRes.status).toBe(200)
    expect(getRes.data.debate.transcript.length).toBeGreaterThanOrEqual(2)

    // 3. Evaluate planted fallacy on turn-1 (ad_hominem planted in Marcus's turn)
    const fallacyRes = await callRoute<{ ok: boolean; correct: boolean; explanation: string }>(
      arenaRoute.POST,
      {
        method: 'POST',
        body: {
          action: 'evaluate_fallacy',
          id: debateId,
          turnId: 'turn-1',
          fallacy: 'ad_hominem',
        },
      },
    )

    expect(fallacyRes.status).toBe(200)
    expect(fallacyRes.data.ok).toBe(true)
    expect(fallacyRes.data.correct).toBe(true)

    // 4. Submit synthesized ruling/verdict
    const verdictText =
      'A principled architectural synthesis recommends beginning with a clean modular monolith to eliminate distributed network latency and boundary overhead, while adhering to strict domain interfaces so services can be extracted independently when team and load scale dictate.'
    const verdictRes = await callRoute<{
      ok: boolean
      assessment: { score: number; feedback: string }
      xpAwarded: number
    }>(arenaRoute.POST, {
      method: 'POST',
      body: {
        action: 'submit_verdict',
        id: debateId,
        verdict: verdictText,
      },
    })

    expect(verdictRes.status).toBe(200)
    expect(verdictRes.data.ok).toBe(true)
    expect(verdictRes.data.assessment.score).toBeGreaterThanOrEqual(40)
    expect(verdictRes.data.xpAwarded).toBeGreaterThan(0)

    // 5. Verify Rule 7 & Rule 8: XP was awarded canonically in xp_events append-only table
    const events = await db.select().from(xpEvents).where(eq(xpEvents.source, 'debate'))
    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events.some((e) => e.amount === verdictRes.data.xpAwarded)).toBe(true)
  })
})
