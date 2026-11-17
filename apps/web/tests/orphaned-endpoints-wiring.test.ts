/**
 * Wiring contract for the six previously-orphaned endpoints, each now called
 * from a real page component (FlowStatePanel /focus, DualCodingAnalyzer
 * /canvas, QuickReviewWidget dashboard, DetoxWizard /settings, AudioDigestCard
 * /audio-commute, RemedialPanel /curriculum). The tests mirror exactly what
 * the components send, against an isolated temp DB.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-orphan-wiring-')), 'api.db')

type Handlers = {
  flowGet: typeof import('@/server/handlers/cognitive/flow-state/route').GET
  flowPost: typeof import('@/server/handlers/cognitive/flow-state/route').POST
  dualGet: typeof import('@/server/handlers/cognitive/dual-coding/route').GET
  dualPost: typeof import('@/server/handlers/cognitive/dual-coding/route').POST
  quickGet: typeof import('@/server/handlers/hud/quick-review/route').GET
  detoxGet: typeof import('@/server/handlers/onboarding/detox/route').GET
  detoxPost: typeof import('@/server/handlers/onboarding/detox/route').POST
  digestGet: typeof import('@/server/handlers/audio/digest/route').GET
  remedialPost: typeof import('@/server/handlers/curriculum/graph/remedial/route').POST
}
let H: Handlers

beforeAll(async () => {
  H = {
    flowGet: (await import('@/server/handlers/cognitive/flow-state/route')).GET,
    flowPost: (await import('@/server/handlers/cognitive/flow-state/route')).POST,
    dualGet: (await import('@/server/handlers/cognitive/dual-coding/route')).GET,
    dualPost: (await import('@/server/handlers/cognitive/dual-coding/route')).POST,
    quickGet: (await import('@/server/handlers/hud/quick-review/route')).GET,
    detoxGet: (await import('@/server/handlers/onboarding/detox/route')).GET,
    detoxPost: (await import('@/server/handlers/onboarding/detox/route')).POST,
    digestGet: (await import('@/server/handlers/audio/digest/route')).GET,
    remedialPost: (await import('@/server/handlers/curriculum/graph/remedial/route')).POST,
  }
})
const post = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

describe('flow-state wiring (FlowStatePanel on /focus)', () => {
  it('GET returns the ultradian phase readout the panel renders', async () => {
    const res = await H.flowGet(
      new Request('http://localhost/api/cognitive/flow-state?elapsedMinutes=20&accuracy=0.85'),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.flow.zone).toBeDefined()
    expect(data.flow.ultradianPhase).toBeDefined()
    expect(typeof data.flow.flowScore).toBe('number')
    expect(data.flow.remainingFocusMinutes).toBeGreaterThanOrEqual(0)
    expect(typeof data.flow.recommendation).toBe('string')
    expect(typeof data.flow.suggestedAction).toBe('string')
  })

  it('POST grades session telemetry with subjective strain', async () => {
    const res = await H.flowPost(
      new Request('http://localhost/api/cognitive/flow-state', {
        ...post({
          accuracy: 0.9,
          averageLatencyMs: 2100,
          expectedLatencyMs: 2500,
          cardsAnswered: 30,
          elapsedFocusMinutes: 25,
          subjectiveStrain: 3,
        }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.flow.flowScore).toBeGreaterThan(0)
  })
})

describe('dual-coding wiring (DualCodingAnalyzer on /canvas)', () => {
  it('GET analyzes pasted text for viability', async () => {
    const res = await H.dualGet(
      new Request(
        'http://localhost/api/cognitive/dual-coding?text=The%20hippocampus%20consolidates%20memory%20during%20sleep',
      ),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.analysis.isDualCoded).toBeDefined()
    expect(data.analysis.compositeRetention).toBeGreaterThan(0)
    expect(data.analysis.recommendedModality).toBeDefined()
    expect(data.analysis.visualPromptSuggestion.length).toBeGreaterThan(0)
  })

  it('POST evaluates composite retention with image/diagram flags', async () => {
    const res = await H.dualPost(
      new Request('http://localhost/api/cognitive/dual-coding', {
        ...post({
          text: 'Raft leader election proceeds in terms of randomized timeouts',
          hasImage: true,
          hasDiagram: true,
        }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.analysis.forgettingReductionFactor).toBeGreaterThan(1)
  })
})

describe('quick-review wiring (QuickReviewWidget on the dashboard)', () => {
  it('GET returns top due cards for the micro-review loop', async () => {
    const res = await H.quickGet(new Request('http://localhost/api/hud/quick-review?limit=3'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.cards)).toBe(true)
    expect(data.cards.length).toBeLessThanOrEqual(3)
    // Empty deck → honest empty list (the widget shows the clear-queue state).
  })
})

describe('detox wizard wiring (DetoxWizard on /settings)', () => {
  it('GET returns the 10 steps with honest progress', async () => {
    const res = (await H.detoxGet()) as unknown as Response
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.steps).toHaveLength(10)
    expect(data.done).toBe(false)
  })

  it('POST toggles one step and merges into persisted state', async () => {
    const mark = await H.detoxPost(
      new Request('http://localhost/api/onboarding/detox', { ...post({ step: 'why' }) }),
    )
    expect(mark.status).toBe(200)
    const marked = await mark.json()
    expect(marked.ok).toBe(true)
    expect(marked.state.why).toBe(true)

    const unmark = await H.detoxPost(
      new Request('http://localhost/api/onboarding/detox', {
        ...post({ step: 'why', done: false }),
      }),
    )
    const unmarked = await unmark.json()
    expect(unmarked.state.why).toBe(false)

    const bad = await H.detoxPost(
      new Request('http://localhost/api/onboarding/detox', { ...post({ step: 'made_up' }) }),
    )
    expect(bad.status).toBe(400)
  })
})

describe('audio digest wiring (AudioDigestCard on /audio-commute)', () => {
  it('GET generates a narration script from due cards', async () => {
    const res = await H.digestGet(
      new Request('http://localhost/api/audio/digest?limit=10&minutes=8'),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.script.cues).toBeDefined()
    expect(data.script.cardCount).toBeGreaterThanOrEqual(0)
    expect(data.script.totalEstimatedSeconds).toBeGreaterThanOrEqual(0)
    // Empty deck → honest empty script (the card shows the fill-from-queue state).
  })
})

describe('remedial wiring (RemedialPanel on /curriculum)', () => {
  it('POST evaluates remedial blocks from caller-supplied nodes', async () => {
    const res = await H.remedialPost(
      new Request('http://localhost/api/curriculum/graph/remedial', {
        ...post({
          conceptId: 'raft_consensus',
          nodes: [
            { id: 'raft_consensus', title: 'Raft consensus', mastery: 0.9, lapses: 0 },
            { id: 'distributed_locks', title: 'Distributed locks', mastery: 0.4, lapses: 2 },
          ],
        }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.result.conceptId).toBe('raft_consensus')
    expect(typeof data.result.blocked).toBe('boolean')
  })
})
