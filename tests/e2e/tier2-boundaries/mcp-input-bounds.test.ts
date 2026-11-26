import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { McpTestClient } from '../helpers/mcp-client'
import { getActiveDbPath } from '../helpers/setup'

/** Unbounded numeric tool inputs are rejected at the schema instead of running for ever. */
describe('Tier 2: MCP numeric input bounds', () => {
  let client: McpTestClient
  beforeAll(async () => {
    client = new McpTestClient(getActiveDbPath())
    await client.start()
  }, 40000)
  afterAll(() => client?.stop())

  it('kst_generate_deck rejects maxCards in the millions', async () => {
    const res = await client.callTool('kst_generate_deck', { maxCards: 5_000_000 })
    expect(typeof res === 'string' && /too big|invalid|less than|at most/i.test(res)).toBe(true)
  })

  it('kst_generate_deck still accepts the default', async () => {
    const res = await client.callTool('kst_generate_deck', {})
    expect(typeof res === 'string' && /invalid/i.test(res)).toBe(false)
  })

  it('successive_relearning_calculate rejects absurd daysElapsed', async () => {
    const res = await client.callTool('successive_relearning_calculate', {
      initialSeconds: 60,
      relearningSeconds: 30,
      daysElapsed: 1e9,
    })
    expect(typeof res === 'string' && /too big|invalid|less than|at most/i.test(res)).toBe(true)
  })
})
