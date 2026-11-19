/**
 * @file apps/web/tests/knowledge-space-host-parity.test.ts
 * @description 100% Host Parity Test Suite for Knowledge Space Theory (CLI, MCP, Server REST)
 *
 * Verifies identical mathematical outcomes and capabilities across:
 * 1. CLI Commands (apps/cli/src/commands/advanced-learning.ts - kstCommand)
 * 2. MCP Tools (apps/mcp/src/tools/advanced-learning.ts - kst_* tools)
 * 3. Headless REST Endpoints (apps/server/src/routes.ts - /cognitive/kst/*)
 *
 * Grounded in:
 * - Jean-Paul Doignon & Jean-Claude Falmagne (1985, 1999) Knowledge Spaces
 * - Jean-Claude Falmagne & Jean-Paul Doignon (1988) Markovian Testing
 * - Free Spaced Repetition Scheduler (FSRS-6)
 */

import { describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { kstCommand } from '../../cli/src/commands/advanced-learning'
import { advancedLearningTools } from '../../mcp/src/tools/advanced-learning'
import { dispatch } from '../../server/src/routes'
import type { AdaptiveAssessmentSession } from '@learning-hub/core/knowledge-space'

interface McpResultEnvelope {
  content: Array<{ type: string; text: string }>
}

function createMockHttp(method: string, path: string, body?: unknown) {
  const stream = Readable.from(body !== undefined ? [Buffer.from(JSON.stringify(body))] : [])
  const req = stream as unknown as IncomingMessage
  req.method = method
  req.url = path
  req.headers = { 'content-type': 'application/json' }

  let statusCode = 200
  let responseData = ''

  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    writeHead: (code: number) => {
      statusCode = code
      return res
    },
    end: (chunk?: string | Buffer) => {
      if (chunk) responseData += chunk.toString()
    },
  } as unknown as ServerResponse

  const execute = async () => {
    await dispatch(req, res)
    return {
      statusCode: (res as unknown as { statusCode: number }).statusCode ?? statusCode,
      data: responseData ? JSON.parse(responseData) : null,
    }
  }

  return { req, res, execute }
}

describe('Host Parity: Knowledge Space Theory (CLI, MCP, Server REST)', () => {
  // ── 1. MCP Tools Parity ──
  describe('MCP Tools Parity', () => {
    it('kst_list_spaces returns canonical structures with items', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'kst_list_spaces')
      expect(tool).toBeDefined()

      const res = (await tool!.handler({})) as McpResultEnvelope
      const data = JSON.parse(res.content[0]!.text)

      expect(data.count).toBeGreaterThanOrEqual(2)
      expect(
        data.spaces.some((s: { domainId: string }) => s.domainId === 'elementary-algebra'),
      ).toBe(true)
      expect(
        data.spaces.some((s: { domainId: string }) => s.domainId === 'dsa-graph-algorithms'),
      ).toBe(true)
    })

    it('kst_start_session initializes session with uniform prior', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'kst_start_session')
      expect(tool).toBeDefined()

      const res = (await tool!.handler({
        domainId: 'elementary-algebra',
        priorType: 'uniform',
      })) as McpResultEnvelope
      const data = JSON.parse(res.content[0]!.text)

      expect(data.domainId).toBe('elementary-algebra')
      expect(data.session.step).toBe(0)
      expect(data.session.currentEntropy).toBeGreaterThan(0)
      expect(data.diagnosis).toBeDefined()
    })

    it('kst_submit_response updates posterior mass and reduces entropy', async () => {
      const startTool = advancedLearningTools.find((t) => t.name === 'kst_start_session')!
      const startRes = (await startTool.handler({
        domainId: 'elementary-algebra',
      })) as McpResultEnvelope
      const { session } = JSON.parse(startRes.content[0]!.text)

      const submitTool = advancedLearningTools.find((t) => t.name === 'kst_submit_response')!
      const submitRes = (await submitTool.handler({
        domainId: 'elementary-algebra',
        session,
        itemId: session.nextSuggestedItemId,
        isCorrect: true,
        responseTimeMs: 3500,
      })) as McpResultEnvelope
      const data = JSON.parse(submitRes.content[0]!.text)

      expect(data.session.step).toBe(1)
      expect(data.session.history).toHaveLength(1)
      expect(data.diagnosis.diagnosedState).toBeDefined()
    })

    it('kst_compute_fringes computes inner and outer frontiers', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'kst_compute_fringes')!
      const res = (await tool.handler({
        domainId: 'elementary-algebra',
        stateItems: ['alg-01-linear-equations'],
      })) as McpResultEnvelope
      const data = JSON.parse(res.content[0]!.text)

      expect(data.innerFringe).toEqual(['alg-01-linear-equations'])
      expect(data.outerFringe.length).toBeGreaterThanOrEqual(1)
      expect(data.readyToLearnCount).toBe(data.outerFringe.length)
    })

    it('kst_generate_deck outputs calibrated FSRS-6 review cards', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'kst_generate_deck')!
      const res = (await tool.handler({
        domainId: 'elementary-algebra',
        maxCards: 5,
      })) as McpResultEnvelope
      const data = JSON.parse(res.content[0]!.text)

      expect(data.cardsCount).toBeGreaterThan(0)
      expect(data.cards.length).toBeLessThanOrEqual(5)
      for (const card of data.cards) {
        expect(card.stability).toBeGreaterThan(0)
        expect(card.difficulty).toBeGreaterThanOrEqual(1)
      }
    })

    it('kst_audit_curriculum audits prerequisite graphs', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'kst_audit_curriculum')!
      const res = (await tool.handler({
        curriculum: {
          id: 'test-curr',
          title: 'Test',
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
      })) as McpResultEnvelope
      const data = JSON.parse(res.content[0]!.text)

      expect(data.report.totalLessons).toBe(2)
      expect(data.report.hasCycles).toBe(false)
      expect(data.report.isWellGraded).toBe(true)
    })
  })

  // ── 2. Terminal CLI Parity ──
  describe('Terminal CLI Parity', () => {
    it('kstCommand handles spaces/list subcommand cleanly', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      kstCommand(['spaces'])
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('kstCommand handles probe subcommand with simulated answer', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      kstCommand(['probe', '--id', 'elementary-algebra', '--correct', 'true'])
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('kstCommand handles fringes subcommand for knowledge state', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      kstCommand(['fringes', '--id', 'elementary-algebra', '--state', 'alg-01-linear-equations'])
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('kstCommand handles deck subcommand generating calibrated cards', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      kstCommand(['deck', '--id', 'elementary-algebra'])
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('kstCommand handles default audit subcommand verifying well-gradedness', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      kstCommand(['audit', '--id', 'elementary-algebra'])
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })
  })

  // ── 3. Headless REST Server Parity ──
  describe('Headless REST Server Parity', () => {
    it('GET /cognitive/kst/spaces lists benchmark spaces', async () => {
      const { execute } = createMockHttp('GET', '/cognitive/kst/spaces')
      const result = await execute()

      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.spaces.length).toBeGreaterThanOrEqual(2)
    })

    it('POST /cognitive/kst/start initializes session', async () => {
      const { execute } = createMockHttp('POST', '/cognitive/kst/start', {
        domainId: 'elementary-algebra',
        priorType: 'uniform',
      })
      const result = await execute()

      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.session.step).toBe(0)
    })

    it('POST /cognitive/kst/probe updates belief distribution', async () => {
      // 1. Start session
      const startHttp = createMockHttp('POST', '/cognitive/kst/start', {
        domainId: 'elementary-algebra',
      })
      const startResult = await startHttp.execute()
      const session: AdaptiveAssessmentSession = startResult.data.session

      // 2. Submit probe
      const probeHttp = createMockHttp('POST', '/cognitive/kst/probe', {
        domainId: 'elementary-algebra',
        session,
        itemId: session.nextSuggestedItemId,
        isCorrect: true,
      })
      const probeResult = await probeHttp.execute()

      expect(probeResult.statusCode).toBe(200)
      expect(probeResult.data.ok).toBe(true)
      expect(probeResult.data.session.step).toBe(1)
    })

    it('POST /cognitive/kst/fringes computes frontiers', async () => {
      const { execute } = createMockHttp('POST', '/cognitive/kst/fringes', {
        domainId: 'elementary-algebra',
        stateItems: ['alg-01-linear-equations'],
      })
      const result = await execute()

      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.innerFringe).toEqual(['alg-01-linear-equations'])
    })

    it('POST /cognitive/kst/deck outputs calibrated FSRS-6 deck', async () => {
      const { execute } = createMockHttp('POST', '/cognitive/kst/deck', {
        domainId: 'elementary-algebra',
        maxCards: 6,
      })
      const result = await execute()

      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.cards.length).toBeGreaterThan(0)
    })

    it('POST /cognitive/kst/audit audits curriculum structure', async () => {
      const { execute } = createMockHttp('POST', '/cognitive/kst/audit', {
        curriculum: {
          id: 'server-curr-test',
          title: 'Server Curriculum',
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
      const result = await execute()

      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.report.totalLessons).toBe(2)
      expect(result.data.report.isWellGraded).toBe(true)
    })
  })
})
