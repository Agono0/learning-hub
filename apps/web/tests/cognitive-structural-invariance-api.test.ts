import { describe, expect, it } from 'vitest'
import { GET, POST } from '../src/server/handlers/cognitive/structural-invariance/route'

describe('/api/cognitive/structural-invariance endpoint', () => {
  it('GET returns the calibrated plan with interleaved vs blocked comparator metrics', async () => {
    const req = new Request('http://localhost/api/cognitive/structural-invariance', {
      method: 'GET',
    })
    const res = await GET(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.plan.mode).toBe('interleaved')
    expect(data.plan.schedule).toHaveLength(12)
    expect(data.plan.contrastMatrix).toHaveLength(6)
    expect(data.plan.deck).toHaveLength(12)
    // The Rohrer-Taylor comparator: shuffling must beat blocking on contrast exposure.
    const inter = data.plan.interleavedMetrics
    const blocked = data.plan.blockedMetrics
    expect(inter.transitionCount).toBeGreaterThan(blocked.transitionCount)
    expect(inter.meanAdjacentContrast * inter.transitionCount).toBeGreaterThan(
      blocked.meanAdjacentContrast * blocked.transitionCount,
    )
  })

  it('GET ?mode=blocked returns the blocked comparator schedule', async () => {
    const req = new Request('http://localhost/api/cognitive/structural-invariance?mode=blocked', {
      method: 'GET',
    })
    const res = await GET(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.plan.mode).toBe('blocked')
    expect(data.plan.metrics.blockingFactor).toBeGreaterThan(0.6)
    // Blocked run: every category appears as exactly one contiguous run.
    const runs: string[] = []
    for (const p of data.plan.schedule) {
      if (runs[runs.length - 1] !== p.categoryId) runs.push(p.categoryId)
    }
    expect(runs).toHaveLength(4)
  })

  it('POST computes the plan and scores attempts into confusion telemetry', async () => {
    const payload = {
      mode: 'interleaved',
      attempts: [
        {
          problemId: 'rate_pipes_pool',
          trueCategoryId: 'rate_completion',
          chosenCategoryId: 'partwhole_proportion',
          reactionMs: 1500,
        },
        {
          problemId: 'prop_trains_occupancy',
          trueCategoryId: 'partwhole_proportion',
          chosenCategoryId: 'partwhole_proportion',
          reactionMs: 900,
        },
      ],
    }

    const req = new Request('http://localhost/api/cognitive/structural-invariance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.plan.schedule).toHaveLength(12)
    expect(data.telemetry).not.toBeNull()
    expect(data.telemetry.totalAttempts).toBe(2)
    expect(data.telemetry.accuracy).toBeCloseTo(0.5, 5)
    expect(data.telemetry.topConfusions[0]).toMatchObject({
      trueCategoryId: 'rate_completion',
      chosenCategoryId: 'partwhole_proportion',
      count: 1,
    })
    expect(data.telemetry.meanReactionMs).toBe(1200)
  })

  it('POST without attempts returns null telemetry', async () => {
    const req = new Request('http://localhost/api/cognitive/structural-invariance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'blocked' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.telemetry).toBeNull()
  })

  it('POST rejects invalid mode and malformed attempts with 400', async () => {
    const bad = new Request('http://localhost/api/cognitive/structural-invariance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'chaos' }),
    })
    const res = await POST(bad)
    expect(res.status).toBe(400)

    const badAttempts = new Request('http://localhost/api/cognitive/structural-invariance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attempts: [{ problemId: 1 }] }),
    })
    const res2 = await POST(badAttempts)
    expect(res2.status).toBe(400)
  })
})
