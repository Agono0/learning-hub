/**
 * @file apps/web/tests/knowledge-space-studio.test.ts
 * @description Integration and API tests for Knowledge Space Theory (KST) Studio Handlers
 *
 * Grounded in:
 * - Doignon & Falmagne (1985, 1999) Knowledge Spaces & Surmise Relations
 * - Falmagne & Doignon (1988) Markovian adaptive testing
 * - FSRS-6 calibrated deck generation
 */

import { describe, expect, it } from 'vitest'
import { GET, POST } from '../src/server/handlers/knowledge-space/route'

function createJsonRequest(body: unknown, method: string = 'POST'): Request {
  return new Request('http://localhost/api/knowledge-space', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('KST Studio Route Handler Integration Tests (/api/knowledge-space)', () => {
  it('GET /api/knowledge-space returns canonical benchmark spaces', async () => {
    const res = await GET(new Request('http://localhost/api/knowledge-space', { method: 'GET' }))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(Array.isArray(data.spaces)).toBe(true)
    expect(data.spaces.length).toBeGreaterThanOrEqual(2)

    const algebra = data.spaces.find(
      (s: { domainId: string }) => s.domainId === 'elementary-algebra',
    )
    expect(algebra).toBeDefined()
    expect(algebra.itemCount).toBe(6)
    expect(algebra.isWellGraded).toBe(true)

    const dsa = data.spaces.find((s: { domainId: string }) => s.domainId === 'dsa-graph-algorithms')
    expect(dsa).toBeDefined()
    expect(dsa.itemCount).toBe(6)
    expect(dsa.isWellGraded).toBe(true)
  })

  it('POST /api/knowledge-space action=start_session initializes Markovian session', async () => {
    const req = createJsonRequest({
      action: 'start_session',
      domainId: 'elementary-algebra',
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.action).toBe('start_session')
    expect(data.session).toBeDefined()
    expect(data.session.step).toBe(0)
    expect(data.session.domainId).toBe('elementary-algebra')
    expect(data.session.currentEntropy).toBeGreaterThan(0)
    expect(data.session.nextSuggestedItemId).toBeDefined()
  })

  it('POST /api/knowledge-space action=submit_response updates posterior belief', async () => {
    // 1. Start session
    const startReq = createJsonRequest({
      action: 'start_session',
      domainId: 'elementary-algebra',
    })
    const startRes = await POST(startReq)
    const { session } = await startRes.json()
    const targetItemId = session.nextSuggestedItemId

    // 2. Submit response
    const submitReq = createJsonRequest({
      action: 'submit_response',
      domainId: 'elementary-algebra',
      session,
      response: {
        itemId: targetItemId,
        isCorrect: true,
        responseTimeMs: 2500,
      },
    })

    const submitRes = await POST(submitReq)
    expect(submitRes.status).toBe(200)

    const data = await submitRes.json()
    expect(data.success).toBe(true)
    expect(data.session.step).toBe(1)
    expect(data.session.history).toHaveLength(1)
    expect(data.session.history[0].itemId).toBe(targetItemId)
    expect(data.session.history[0].isCorrect).toBe(true)
    expect(data.diagnosis).toBeDefined()
    expect(data.diagnosis.diagnosedState).toBeDefined()
  })

  it('POST /api/knowledge-space action=compute_fringes computes inner and outer fringes', async () => {
    const req = createJsonRequest({
      action: 'compute_fringes',
      domainId: 'elementary-algebra',
      stateItems: ['alg-01-linear-equations'],
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.fringes).toBeDefined()
    expect(data.fringes.innerFringe).toEqual(['alg-01-linear-equations'])
    // Outer fringe should contain immediate next concepts (inequalities, slope-intercept, factoring)
    expect(data.fringes.outerFringe).toContain('alg-02-linear-inequalities')
    expect(data.fringes.outerFringe).toContain('alg-03-slope-intercept')
  })

  it('POST /api/knowledge-space action=generate_deck outputs calibrated FSRS-6 cards', async () => {
    const req = createJsonRequest({
      action: 'generate_deck',
      domainId: 'elementary-algebra',
      deckConfig: {
        maxCards: 8,
        includeInnerFringe: true,
        includeOuterFringe: true,
        includePrerequisiteInvariants: true,
        includeSlipDiagnostic: true,
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(Array.isArray(data.deck)).toBe(true)
    expect(data.deck.length).toBeGreaterThan(0)
    expect(data.deck.length).toBeLessThanOrEqual(8)

    for (const card of data.deck) {
      expect(card.id).toBeDefined()
      expect(card.stability).toBeGreaterThan(0)
      expect(card.difficulty).toBeGreaterThanOrEqual(1)
      expect(card.difficulty).toBeLessThanOrEqual(10)
      expect(card.fsrsParameters).toBeDefined()
    }
  })

  it('POST /api/knowledge-space action=verify_structure confirms well-graded learning space', async () => {
    const req = createJsonRequest({
      action: 'verify_structure',
      domainId: 'elementary-algebra',
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.isWellGraded).toBe(true)
    expect(data.violations).toHaveLength(0)
  })

  it('POST /api/knowledge-space action=audit_curriculum audits curriculum DAG', async () => {
    const req = createJsonRequest({
      action: 'audit_curriculum',
      curriculum: {
        id: 'curriculum-test',
        title: 'Test Curriculum',
        modules: [
          {
            id: 'm1',
            title: 'M1',
            lessons: [
              { id: 'l1', title: 'L1', prerequisites: [] },
              { id: 'l2', title: 'L2', prerequisites: ['l1'] },
            ],
          },
        ],
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.report).toBeDefined()
    expect(data.report.totalLessons).toBe(2)
    expect(data.report.hasCycles).toBe(false)
    expect(data.report.isWellGraded).toBe(true)
  })

  it('handles invalid submission payload with 400 error', async () => {
    const req = createJsonRequest({
      action: 'submit_response',
      domainId: 'elementary-algebra',
      // Missing required session and response
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
  })
})
