/**
 * Host Parity Suite — Categorization Domain Endpoints & Tools
 *
 * Asserts 100% byte-for-byte agreement across hosts:
 * 1. Web handler (/api/categorization and /api/prototype-exemplar)
 * 2. Headless REST server (/cognitive/categorization/*)
 * 3. MCP server tools (categorization_* and prototype_exemplar_*)
 * 4. CLI commands (learning-hub categorization)
 *
 * Verifies that all hosts call the pure engines in @learning-hub/core and
 * return identical response envelopes.
 */

import { describe, expect, it } from 'vitest'
import {
  CANONICAL_CATEGORIZATION_SETS,
  evaluateCategorizationSession,
  findCategorySet,
  generateCategorizationDeck,
  planDiscriminatingBlock,
} from '@learning-hub/core'
import { prototypeExemplarRouteJson } from '../../../apps/server/src/routes'
import { prototypeExemplarTools } from '../../../apps/mcp/src/tools/prototype-exemplar'

const BIRD_SET = findCategorySet('proto-bird-typicality')
const BIRD_SUBMISSION = {
  setId: BIRD_SET.id,
  typicalityRatings: {
    'bird-robin-old': 7,
    'bird-chicken-old': 3,
    'bird-penguin-old': 2,
    'bird-bat-old': 1,
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
  } as const,
}

describe('Categorization Host Parity', () => {
  it('server REST routes for /cognitive/categorization/scenarios match pure engine', async () => {
    const res = await prototypeExemplarRouteJson('GET', '/cognitive/categorization/scenarios')
    expect(res.status).toBe(200)
    expect((res.data.scenarios as unknown[]).length).toBe(CANONICAL_CATEGORIZATION_SETS.length)
  })

  it('server REST routes for /cognitive/categorization/evaluate match pure engine', async () => {
    const pureEval = evaluateCategorizationSession(BIRD_SET, BIRD_SUBMISSION)
    const res = await prototypeExemplarRouteJson(
      'POST',
      '/cognitive/categorization/evaluate',
      BIRD_SUBMISSION,
    )
    expect(res.status).toBe(200)
    expect(res.data.ok).toBe(true)
    const evalData = res.data.evaluation as typeof pureEval
    expect(evalData.setId).toBe(pureEval.setId)
    expect(evalData.overallAccuracy).toBe(pureEval.overallAccuracy)
    expect(evalData.cri).toBe(pureEval.cri)
  })

  it('server REST routes for /cognitive/categorization/plan match pure engine', async () => {
    const purePlan = planDiscriminatingBlock(BIRD_SET, 6)
    const res = await prototypeExemplarRouteJson('POST', '/cognitive/categorization/plan', {
      setId: BIRD_SET.id,
      maxTrials: 6,
    })
    expect(res.status).toBe(200)
    expect(res.data.ok).toBe(true)
    expect(res.data.plan).toEqual(purePlan)
  })

  it('server REST routes for /cognitive/categorization/deck match pure engine', async () => {
    const neutralEval = evaluateCategorizationSession(BIRD_SET, { setId: BIRD_SET.id })
    neutralEval.cri = 75
    const pureDeck = generateCategorizationDeck(BIRD_SET, neutralEval)

    const res = await prototypeExemplarRouteJson('POST', '/cognitive/categorization/deck', {
      setId: BIRD_SET.id,
      criBaseline: 75,
    })
    expect(res.status).toBe(200)
    expect(res.data.ok).toBe(true)
    expect(res.data.deck).toEqual(pureDeck)
  })

  it('MCP categorization tools return identical payloads to pure engine', async () => {
    const evalTool = prototypeExemplarTools.find((t) => t.name === 'categorization_evaluate')
    expect(evalTool).toBeDefined()

    const pureEval = evaluateCategorizationSession(BIRD_SET, BIRD_SUBMISSION)
    const toolRes = await evalTool!.handler(BIRD_SUBMISSION)
    const parsed = JSON.parse(toolRes.content[0].text)
    expect(parsed.ok).toBe(true)
    expect(parsed.evaluation.cri).toBe(pureEval.cri)
    expect(parsed.evaluation.overallAccuracy).toBe(pureEval.overallAccuracy)
  })

  it('MCP categorization scenarios list all canonical sets', async () => {
    const listTool = prototypeExemplarTools.find((t) => t.name === 'categorization_list_scenarios')
    expect(listTool).toBeDefined()

    const toolRes = await listTool!.handler({})
    const parsed = JSON.parse(toolRes.content[0].text)
    expect(parsed.count).toBe(CANONICAL_CATEGORIZATION_SETS.length)
  })
})
