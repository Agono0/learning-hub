/**
 * Host Parity Integration Tests — Prototype & Exemplar Categorization
 *
 * Verifies the four hosts agree on the SAME engine outputs for canonical
 * scenarios (the parity contract: one engine, every host):
 * 1. Web handler  — apps/web/src/server/handlers/prototype-exemplar/route.ts
 * 2. MCP tool     — apps/mcp/src/tools/prototype-exemplar.ts
 * 3. CLI command  — apps/cli/src/commands/prototype-exemplar.ts (via --json)
 * 4. REST server  — apps/server/src/routes.ts (/cognitive/prototype-exemplar/*)
 *
 * The comparison anchor is the pure core engine itself: every host response
 * must deep-equal `evaluateCategorizationSession(...)` byte-for-byte (the
 * engines are deterministic, so JSON.stringify equality is exact).
 *
 * Grounded in: Rosch (1975); Reed (1972); Medin & Schaffer (1978); Nosofsky
 * (1986); Ashby & Gott (1988); Landauer & Bjork (1978); Kang (2016).
 */

import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { POST, GET } from '../src/server/handlers/prototype-exemplar/route'
import { prototypeExemplarTools } from '../../mcp/src/tools/prototype-exemplar'
import { prototypeExemplarCommand } from '../../cli/src/commands/prototype-exemplar'
import { routes, dispatch } from '../../server/src/routes'
import {
  BIRD_TYPICALITY_SET,
  evaluateCategorizationSession,
  type CategorizationSubmission,
} from '@learning-hub/core'

interface McpResultEnvelope {
  content: Array<{ type: string; text: string }>
}

/** Normative-consistent, fully correct bird session (mirrors the engine tests). */
const CANONICAL_SUBMISSION: CategorizationSubmission = {
  setId: BIRD_TYPICALITY_SET.id,
  typicalityRatings: {
    'bird-robin-old': 1,
    'bird-eagle': 2,
    'bird-chicken-old': 4,
    'bird-penguin-old': 5,
  },
  classifications: {
    'bird-robin-old': 'A',
    'bird-chicken-old': 'A',
    'bird-penguin-old': 'A',
    'bird-bat-old': 'B',
    'bird-eagle': 'A',
    'bird-dove': 'A',
    'bird-kiwi': 'A',
    'bird-butterfly': 'B',
    'bird-moth': 'B',
  },
}

const CANONICAL_NOW = '2026-01-15T09:00:00.000Z'
const CANONICAL_HISTORY = [
  {
    setId: BIRD_TYPICALITY_SET.id,
    completedAt: '2026-01-10T08:00:00.000Z',
    accuracy: 88,
    transferAccuracy: 85,
    tsc: 72,
    cri: 76,
    maturityBand: 'boundary_tracer',
  },
  {
    setId: BIRD_TYPICALITY_SET.id,
    completedAt: '2026-01-12T08:00:00.000Z',
    accuracy: 92,
    transferAccuracy: 90,
    tsc: 78,
    cri: 81,
    maturityBand: 'boundary_tracer',
  },
]

const post = (body: unknown): Request =>
  new Request('http://localhost/api/prototype-exemplar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

// Mock HTTP request/response for the headless REST server (same helper shape
// as host-parity-advanced-cognitive.test.ts).
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
      data: responseData ? (JSON.parse(responseData) as Record<string, unknown>) : {},
    }
  }
  return { req, res, execute }
}

/** Run the CLI with captured stdout and parse the single --json line. */
function runCliJson(args: string[]): Record<string, unknown> {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    prototypeExemplarCommand(args)
    const lines = spy.mock.calls.map((call) => call.map((a) => String(a)).join(' '))
    const jsonLine = lines.find((line) => line.trim().startsWith('{'))
    expect(jsonLine).toBeDefined()
    return JSON.parse(jsonLine!) as Record<string, unknown>
  } finally {
    spy.mockRestore()
  }
}

const mcpTool = (name: string) => {
  const tool = prototypeExemplarTools.find((t) => t.name === name)
  expect(tool, `MCP tool ${name} must be registered`).toBeDefined()
  return tool!
}

describe('Host Parity Suite — Prototype & Exemplar Categorization', () => {
  // ── 1. Evaluate: every host reproduces the pure engine byte-for-byte ──────
  describe('evaluate parity', () => {
    const engine = evaluateCategorizationSession(BIRD_TYPICALITY_SET, CANONICAL_SUBMISSION)

    it('web handler POST evaluate equals the pure engine', async () => {
      const res = await POST(post({ action: 'evaluate', submission: CANONICAL_SUBMISSION }))
      expect(res.status).toBe(200)
      const data = (await res.json()) as { ok: boolean; evaluation: unknown }
      expect(data.ok).toBe(true)
      expect(JSON.stringify(data.evaluation)).toBe(JSON.stringify(engine))
    })

    it('MCP prototype_exemplar_evaluate equals the pure engine', async () => {
      const result = (await mcpTool('prototype_exemplar_evaluate').handler({
        setId: CANONICAL_SUBMISSION.setId,
        typicalityRatings: CANONICAL_SUBMISSION.typicalityRatings,
        classifications: CANONICAL_SUBMISSION.classifications,
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as { ok: boolean; evaluation: unknown }
      expect(data.ok).toBe(true)
      expect(JSON.stringify(data.evaluation)).toBe(JSON.stringify(engine))
    })

    it('headless REST server evaluate equals the pure engine', async () => {
      const { execute } = createMockHttp('/cognitive/prototype-exemplar/evaluate', 'POST', {
        ...CANONICAL_SUBMISSION,
      })
      const { statusCode, data } = await execute()
      expect(statusCode).toBe(200)
      expect((data as { ok: boolean }).ok).toBe(true)
      expect(JSON.stringify((data as { evaluation: unknown }).evaluation)).toBe(
        JSON.stringify(engine),
      )
    })

    it('CLI evaluate --json equals the pure engine', () => {
      const data = runCliJson([
        'evaluate',
        '--data',
        JSON.stringify(CANONICAL_SUBMISSION),
        '--json',
      ])
      expect((data as { ok: boolean }).ok).toBe(true)
      expect(JSON.stringify((data as { evaluation: unknown }).evaluation)).toBe(
        JSON.stringify(engine),
      )
    })

    it('every host registers the same scenario catalog', async () => {
      const webRes = await GET(new Request('http://localhost/api/prototype-exemplar'))
      const webData = (await webRes.json()) as { ok: boolean; scenarios: unknown }
      expect(webData.ok).toBe(true)

      const mcpResult = (await mcpTool('prototype_exemplar_list_scenarios').handler(
        {},
      )) as unknown as McpResultEnvelope
      const mcpData = JSON.parse(mcpResult.content[0]!.text) as { scenarios: unknown }

      const serverCall = createMockHttp('/cognitive/prototype-exemplar/scenarios', 'GET')
      const serverData = (await serverCall.execute()).data as { scenarios: unknown }

      // The full set list is identical across hosts (same canonical array).
      const webJson = JSON.stringify(webData.scenarios)
      expect(webJson).toBe(JSON.stringify(serverData.scenarios))
      // The MCP list view is a projection — assert ids and framing survive.
      expect(JSON.stringify(mcpData)).toContain(BIRD_TYPICALITY_SET.id)
      expect(JSON.stringify(mcpData)).toContain('Rosch')
    })
  })

  // ── 2. Plan: discriminating trials + multi-day schedule parity ────────────
  describe('plan & schedule parity', () => {
    const planBody = {
      action: 'plan',
      setId: BIRD_TYPICALITY_SET.id,
      maxTrials: 6,
      sessions: CANONICAL_HISTORY,
      scheduleOptions: { horizonDays: 7 },
      now: CANONICAL_NOW,
    }

    it('web handler plan (with history) returns the same schedule as the server', async () => {
      const webRes = await POST(post(planBody))
      expect(webRes.status).toBe(200)
      const webData = (await webRes.json()) as {
        ok: boolean
        plan: unknown
        schedule: unknown
      }
      expect(webData.ok).toBe(true)
      expect(webData.schedule).not.toBeNull()

      const { execute } = createMockHttp('/cognitive/prototype-exemplar/plan', 'POST', {
        setId: planBody.setId,
        maxTrials: planBody.maxTrials,
        sessions: planBody.sessions,
        scheduleOptions: planBody.scheduleOptions,
        now: planBody.now,
      })
      const serverData = (await execute()).data as { plan: unknown; schedule: unknown }

      expect(JSON.stringify(webData.plan)).toBe(JSON.stringify(serverData.plan))
      expect(JSON.stringify(webData.schedule)).toBe(JSON.stringify(serverData.schedule))
    })

    it('MCP prototype_exemplar_plan agrees with the web handler', async () => {
      const webRes = await POST(post(planBody))
      const webData = (await webRes.json()) as { plan: unknown; schedule: unknown }

      const result = (await mcpTool('prototype_exemplar_plan').handler({
        setId: planBody.setId,
        maxTrials: planBody.maxTrials,
        sessions: planBody.sessions,
        horizonDays: 7,
        now: planBody.now,
      })) as unknown as McpResultEnvelope
      const mcpData = JSON.parse(result.content[0]!.text) as { plan: unknown; schedule: unknown }

      expect(JSON.stringify(mcpData.plan)).toBe(JSON.stringify(webData.plan))
      expect(JSON.stringify(mcpData.schedule)).toBe(JSON.stringify(webData.schedule))
    })

    it('CLI plan --history --json agrees with the web handler', async () => {
      const webRes = await POST(post(planBody))
      const webData = (await webRes.json()) as { plan: unknown; schedule: unknown }

      const dir = mkdtempSync(join(tmpdir(), 'lh-parity-proto-'))
      const historyPath = join(dir, 'history.json')
      writeFileSync(historyPath, JSON.stringify(CANONICAL_HISTORY))

      const data = runCliJson([
        'plan',
        '--set',
        BIRD_TYPICALITY_SET.id,
        '--trials',
        '6',
        '--history',
        historyPath,
        '--days',
        '7',
        '--now',
        CANONICAL_NOW,
        '--json',
      ]) as { plan: unknown; schedule: unknown }

      expect(JSON.stringify(data.plan)).toBe(JSON.stringify(webData.plan))
      expect(JSON.stringify(data.schedule)).toBe(JSON.stringify(webData.schedule))

      // The schedule actually encodes expanding retrieval: the mastered bird
      // set refreshes at +3d (2026-01-15) and +7d (2026-01-19) from the anchor.
      const schedule = data.schedule as {
        frontierSetId: string
        days: Array<{ day: string; blocks: Array<{ kind: string; setId: string }> }>
      }
      expect(schedule.frontierSetId).not.toBe(BIRD_TYPICALITY_SET.id)
      const day0 = schedule.days[0]!.blocks.filter((b) => b.setId === BIRD_TYPICALITY_SET.id)
      expect(day0).toHaveLength(1)
      expect(day0[0]!.kind).toBe('refresh')
    })
  })

  // ── 3. Deck parity ────────────────────────────────────────────────────────
  describe('deck parity', () => {
    it('web handler, MCP, server and CLI synthesize the identical deck', async () => {
      const criBaseline = 72

      const webRes = await POST(
        post({ action: 'deck', setId: BIRD_TYPICALITY_SET.id, criBaseline }),
      )
      const webData = (await webRes.json()) as { ok: boolean; deck: unknown }

      const mcpResult = (await mcpTool('prototype_exemplar_deck').handler({
        setId: BIRD_TYPICALITY_SET.id,
        criBaseline,
      })) as unknown as McpResultEnvelope
      const mcpData = JSON.parse(mcpResult.content[0]!.text) as { ok: boolean; deck: unknown }

      const { execute } = createMockHttp('/cognitive/prototype-exemplar/deck', 'POST', {
        setId: BIRD_TYPICALITY_SET.id,
        criBaseline,
      })
      const serverData = (await execute()).data as { ok: boolean; deck: unknown }

      const cliData = runCliJson([
        'deck',
        '--set',
        BIRD_TYPICALITY_SET.id,
        '--cri',
        String(criBaseline),
        '--json',
      ]) as { ok: boolean; deck: unknown }

      const expected = JSON.stringify(webData.deck)
      expect(webData.ok).toBe(true)
      expect(JSON.stringify(mcpData.deck)).toBe(expected)
      expect(JSON.stringify(serverData.deck)).toBe(expected)
      expect(JSON.stringify(cliData.deck)).toBe(expected)
    })
  })

  // ── 4. Route registration sanity ──────────────────────────────────────────
  it('registers all four prototype-exemplar REST routes', () => {
    for (const [method, path] of [
      ['GET', '/cognitive/prototype-exemplar/scenarios'],
      ['POST', '/cognitive/prototype-exemplar/evaluate'],
      ['POST', '/cognitive/prototype-exemplar/plan'],
      ['POST', '/cognitive/prototype-exemplar/deck'],
    ] as const) {
      expect(
        routes.some((r) => r.method === method && r.path === path),
        `${method} ${path} must be registered`,
      ).toBe(true)
    }
  })
})
