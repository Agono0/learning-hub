import { describe, expect, it } from 'vitest'
import {
  GET as feynmanEvalGet,
  POST as feynmanEvalPost,
} from '../src/server/handlers/cognitive/feynman-eval/route'

describe('Cognitive Feynman Teach-Back & Socratic API Endpoint', () => {
  it('GET returns sample diagnostic evaluation report', async () => {
    const req = new Request('http://localhost/api/cognitive/feynman-eval', { method: 'GET' })
    const res = await feynmanEvalGet(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.report.concept).toBe('Electric Current')
    expect(data.report.isTwelveYearOldAccessible).toBe(true)
    expect(data.report.explanatoryDepthScore).toBeGreaterThanOrEqual(50)
    expect(data.report.socraticProbes.length).toBeGreaterThanOrEqual(1)
  })

  it('POST evaluates explanation and identifies jargon and explanatory gaps', async () => {
    const payload = {
      concept: 'Spaced Repetition',
      explanation:
        'The Leitner box distributes flashcard practice across expanding temporal intervals because memory traces undergo exponential decay without reinforcement.',
      initialConfidence: 5,
    }

    const req = new Request('http://localhost/api/cognitive/feynman-eval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const res = await feynmanEvalPost(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.report.concept).toBe('Spaced Repetition')
    expect(data.report.jargonTerms.length).toBeGreaterThan(0)
    expect(data.report.causalMarkerCount).toBeGreaterThanOrEqual(1) // 'because'
    expect(data.report.suggestedGapCards.length).toBeGreaterThanOrEqual(1)
  })
})
