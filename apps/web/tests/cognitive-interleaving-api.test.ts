import { describe, expect, it } from 'vitest'
import { GET, POST } from '../src/server/handlers/cognitive/interleaving/route'

describe('/api/cognitive/interleaving endpoint', () => {
  it('GET returns sample interleaving optimization schedule', async () => {
    const req = new Request('http://localhost/api/cognitive/interleaving', { method: 'GET' })
    const res = await GET(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.result.schedule.length).toBe(5)
    expect(data.result.blockingFactor).toBeLessThanOrEqual(0.25)
    expect(data.result.transitionCount).toBeGreaterThanOrEqual(3)
  })

  it('POST computes optimal interleaving schedule for submitted items', async () => {
    const payload = {
      items: [
        { id: 'c1', categoryId: 'bio', difficulty: 0.5, urgency: 0.9, title: 'Mitosis' },
        { id: 'c2', categoryId: 'bio', difficulty: 0.6, urgency: 0.8, title: 'Meiosis' },
        { id: 'c3', categoryId: 'chem', difficulty: 0.7, urgency: 0.85, title: 'Oxidation' },
        { id: 'c4', categoryId: 'chem', difficulty: 0.4, urgency: 0.7, title: 'Reduction' },
      ],
      options: {
        maxConsecutiveCategory: 1,
      },
    }

    const req = new Request('http://localhost/api/cognitive/interleaving', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.result.schedule.length).toBe(4)
    expect(data.result.blockingFactor).toBe(0)
    expect(data.result.discriminationPrompts.length).toBeGreaterThan(0)
  })

  it('POST handles single category gracefully without infinite loop', async () => {
    const payload = {
      items: [
        { id: '1', categoryId: 'physics', difficulty: 0.5, urgency: 0.5, title: 'Newton I' },
        { id: '2', categoryId: 'physics', difficulty: 0.5, urgency: 0.4, title: 'Newton II' },
      ],
    }

    const req = new Request('http://localhost/api/cognitive/interleaving', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.result.schedule.length).toBe(2)
  })
})
