import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dispatch } from '../../../apps/server/src/routes'

describe('Headless REST Server Cognitive Routes', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    server = createServer((req, res) => {
      dispatch(req, res).catch((err) => {
        if (!res.writableEnded) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    })

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })

    const addr = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${addr.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  })

  it('GET /health returns 200 with server info', async () => {
    const res = await fetch(`${baseUrl}/health`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.name).toBe('learning-hub-server')
  })

  it('POST /cognitive/generation/challenge creates a 4-tier generation ladder', async () => {
    const res = await fetch(`${baseUrl}/cognitive/generation/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        concept: 'Active Recall',
        explanation:
          'Retrieving memories strengthens synaptic connections and reduces forgetting curve decay',
        tier: 'stem_completion',
      }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.ladder).toBeDefined()
    expect(data.ladder.concept).toBe('Active Recall')
    expect(data.ladder.tier).toBe('stem_completion')
    expect(data.ladder.challengeText).toBeDefined()
  })

  it('POST /cognitive/generation/eval evaluates a learner attempt', async () => {
    const res = await fetch(`${baseUrl}/cognitive/generation/eval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        concept: 'Active Recall',
        tier: 'stem_completion',
        expectedAnswer: 'Active Recall',
        userAttempt: 'Active Recall',
        latencyMs: 2500,
      }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.result.isCorrect).toBe(true)
    expect(data.result.similarityScore).toBe(1.0)
    expect(data.result.retentionMultiplier).toBeGreaterThan(1.0)
  })

  it('POST /cognitive/feynman-eval evaluates explanation clarity and socratic probes', async () => {
    const res = await fetch(`${baseUrl}/cognitive/feynman-eval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        concept: 'Photosynthesis',
        explanation:
          'Plants use sunlight to turn water and carbon dioxide into oxygen and sugar for energy.',
        initialConfidence: 4,
      }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.report).toBeDefined()
    expect(data.report.fleschReadingEase).toBeGreaterThan(0)
    expect(Array.isArray(data.report.socraticProbes)).toBe(true)
  })

  it('POST /cognitive/metacognition evaluates explicit trial calibration', async () => {
    const res = await fetch(`${baseUrl}/cognitive/metacognition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trials: [
          { confidence: 0.9, outcome: 1.0, latencyMs: 1200 },
          { confidence: 0.8, outcome: 1.0, latencyMs: 1400 },
          { confidence: 0.7, outcome: 0.0, latencyMs: 3100 },
        ],
      }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.trialsCount).toBe(3)
    expect(data.report.brierScore).toBeGreaterThanOrEqual(0)
    expect(data.report.status).toBeDefined()
  })

  it('GET /cognitive/difficulty-audit returns measured spacing + interleaving audits', async () => {
    const res = await fetch(`${baseUrl}/cognitive/difficulty-audit?tzOffset=0`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.measured).toBeDefined()
    expect(Array.isArray(data.measured.retrievalMinutesByDay)).toBe(true)
    expect(data.measured.retrievalMinutesByDay).toHaveLength(7)
    expect(typeof data.spacing.verdict).toBe('string')
    expect(typeof data.interleaving.verdict).toBe('string')
    // The honesty boundary: technique mix is NOT measurable from telemetry.
    expect(data.techniqueMix.measurable).toBe(false)
    expect(Array.isArray(data.techniqueMix.prompts)).toBe(true)
  })

  it('POST /cognitive/difficulty-audit scores a self-reported mix against Dunlosky utilities', async () => {
    const res = await fetch(`${baseUrl}/cognitive/difficulty-audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        windowDays: 7,
        minutesByTechnique: { rereading: 180, highlighting: 90, practice_testing: 30 },
      }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.report.mix.status).toBe('fluency_trap')
    expect(data.report.compositeIndex).toBeGreaterThan(0)
    expect(data.report.substitutions.length).toBeGreaterThan(0)
    const top = data.report.substitutions[0]
    expect(top.toId).toBe('practice_testing')
    expect(typeof top.dividendDelta).toBe('number')
  })

  it('GET /cognitive/pretesting returns pretest questions for young cards', async () => {
    const res = await fetch(`${baseUrl}/cognitive/pretesting`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.candidates)).toBe(true)
    expect(data.protocol.citation).toContain('Kornell')
    for (const q of data.candidates) {
      expect(typeof q.question).toBe('string')
      expect(q.question.length).toBeGreaterThan(10)
      expect(q.relatedness).toBeGreaterThanOrEqual(0)
      expect(q.relatedness).toBeLessThanOrEqual(1)
      expect(typeof q.solidPretest).toBe('boolean')
    }
  })

  it('POST /cognitive/analogy evaluates a structure-mapping attempt', async () => {
    const list = await fetch(`${baseUrl}/cognitive/analogy`, { method: 'POST', body: '{}' })
    expect(list.status).toBe(200)
    const listing = await list.json()
    expect(listing.ok).toBe(true)
    expect(listing.suites.length).toBeGreaterThanOrEqual(3)

    const evalRes = await fetch(`${baseUrl}/cognitive/analogy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suiteKey: 'convergence_radiation_oncology',
        attempt: {
          suiteId: 'convergence_radiation_oncology',
          selectedBaseAnalogId: 'military_raids',
          entityMappings: [],
          predicateMappings: [],
          articulatedConvergenceSchema: 'Multiple weak rays converge on a hard target.',
          confidenceScore: 3,
          timeSpentMs: 60000,
        },
      }),
    })
    expect(evalRes.status).toBe(200)
    const data = await evalRes.json()
    expect(data.ok).toBe(true)
    expect(typeof data.telemetry.entityAlignmentAccuracy).toBe('number')
    expect(typeof data.telemetry.systematicityScore).toBe('number')
    expect(typeof data.telemetry.spontaneousTransferProbability).toBe('number')
    expect(typeof data.telemetry.feedbackMessage).toBe('string')
  })

  it('POST /cognitive/flexibility evaluates criss-cross attempts', async () => {
    const suitesRes = await fetch(`${baseUrl}/cognitive/flexibility`, {
      method: 'POST',
      body: '{}',
    })
    expect(suitesRes.status).toBe(200)
    const suites = await suitesRes.json()
    expect(suites.ok).toBe(true)
    expect(suites.suites.length).toBeGreaterThanOrEqual(2)

    const evalRes = await fetch(`${baseUrl}/cognitive/flexibility`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suiteKey: 'distributed_chaos_cascade',
        attempts: [
          {
            caseId: 'primary',
            selectedHat: 'white_hat',
            activeLens: 'mechanistic_technical',
            studentObservations: 'Traced the failure propagation chain.',
            identifiedThematicNodeIds: [],
            diagnosedReductiveTrapIds: [],
          },
          {
            caseId: 'primary',
            selectedHat: 'green_hat',
            activeLens: 'ecological_systemic',
            studentObservations: 'Reframed as ecosystem feedback.',
            identifiedThematicNodeIds: [],
            diagnosedReductiveTrapIds: [],
          },
        ],
      }),
    })
    expect(evalRes.status).toBe(200)
    const data = await evalRes.json()
    expect(data.ok).toBe(true)
    expect(typeof data.evaluation.perspectiveDispersionIndex).toBe('number')
    expect(data.evaluation.hatCoverageCount).toBe(2)
    expect(typeof data.evaluation.cognitiveFlexibilityScore).toBe('number')
    expect(typeof data.evaluation.feedbackSummary).toBe('string')
  })

  it('GET /cognitive/metacognition evaluates calibration from revlog', async () => {
    const res = await fetch(`${baseUrl}/cognitive/metacognition?limit=50`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(typeof data.trialsCount).toBe('number')
    expect(data.report).toBeDefined()
    expect(data.report.brierScore).toBeGreaterThanOrEqual(0)
  })

  it("GET /cognitive/tmr/plan builds tonight's TMR plan from FSRS state", async () => {
    const res = await fetch(
      `${baseUrl}/cognitive/tmr/plan?bedtime=23:00&wakeTime=07:00&sleepDebtHours=2&limit=8`,
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(typeof data.candidatesSelected).toBe('number')
    expect(data.hypnogram.cycleCount).toBeGreaterThanOrEqual(1)
    expect(data.hypnogram.totalOpportunityMinutes).toBe(480)
    expect(Array.isArray(data.swsBlocks)).toBe(true)
    expect(Array.isArray(data.cues)).toBe(true)
    for (const cue of data.cues) {
      expect(typeof cue.cardId).toBe('number')
      expect(cue.offsetMinutes).toBeGreaterThanOrEqual(0)
      expect(cue.blockDeltaWeight).toBeGreaterThan(0)
      expect(cue.predictedBoostPct).toBeGreaterThanOrEqual(0)
      expect(['optimal', 'moderate', 'marginal']).toContain(cue.stabilizationTier)
    }
    expect(data.safety.withinArousalCeiling).toBe(true)
    expect(typeof data.advisory).toBe('string')
  })

  it('GET /cognitive/metacognition/hypercorrection returns the crucible report + queue', async () => {
    const res = await fetch(`${baseUrl}/cognitive/metacognition/hypercorrection?limit=200`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(typeof data.correctionsCount).toBe('number')
    expect(data.report).toBeDefined()
    expect(typeof data.report.hypercorrectionIndex).toBe('number')
    expect(typeof data.report.uncorrectedHighConfidenceErrors).toBe('number')
    expect(Array.isArray(data.report.bands)).toBe(true)
    expect(Array.isArray(data.queue)).toBe(true)
    for (const item of data.queue) {
      expect(typeof item.cardId).toBe('number')
      expect(item.priority).toBeGreaterThanOrEqual(0)
      expect(item.priority).toBeLessThanOrEqual(100)
      expect(typeof item.rationale).toBe('string')
      expect(item.predictedCorrectionProbability).toBeGreaterThanOrEqual(0)
      expect(item.predictedCorrectionProbability).toBeLessThanOrEqual(1)
    }
  })
})
