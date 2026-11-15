import { describe, expect, it } from 'vitest'
import {
  GET as generationGet,
  POST as generationPost,
} from '../src/server/handlers/cognitive/generation/route'

describe('Cognitive Generation Effect API Endpoint', () => {
  it('GET returns sample generation ladder with masked stems', async () => {
    const req = new Request('http://localhost/api/cognitive/generation', { method: 'GET' })
    const res = await generationGet(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.ladder.concept).toBe('Active Recall')
    expect(data.ladder.tier).toBe('stem_completion')
    expect(data.ladder.generationMultiplier).toBe(1.35)
  })

  it('POST creates an anagram ladder with scrambled tokens', async () => {
    const payload = {
      concept: 'Interleaving',
      explanation: 'Alternating distinct problem categories deepens discrimination capacity',
      tier: 'semantic_anagram',
    }

    const req = new Request('http://localhost/api/cognitive/generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const res = await generationPost(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.ladder.concept).toBe('Interleaving')
    expect(data.ladder.tierLevel).toBe(2)
    expect(data.ladder.scrambledTokens.length).toBeGreaterThan(0)
    expect(data.ladder.generationMultiplier).toBe(1.55)
  })

  it('POST evaluates learner trial and computes empirical multiplier gain', async () => {
    const payload = {
      concept: 'Interleaving',
      tier: 'semantic_anagram',
      expectedAnswer: 'Alternating distinct problem categories deepens discrimination capacity',
      userAttempt: 'Alternating distinct problem categories deepens discrimination capacity',
      latencyMs: 3800,
    }

    const req = new Request('http://localhost/api/cognitive/generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const res = await generationPost(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.result.isCorrect).toBe(true)
    expect(data.result.retentionMultiplier).toBeGreaterThanOrEqual(1.55)
    expect(data.result.recommendedNextTier).toBe('reverse_query')
  })
})
