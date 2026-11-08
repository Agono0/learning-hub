import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { McpTestClient } from '../helpers/mcp-client'
import { getActiveDbPath } from '../helpers/setup'
import type { IdeaRow, NoteRow } from '../helpers/rows'

describe('Tier 1: MCP Server Tools Execution', () => {
  let client: McpTestClient

  beforeAll(async () => {
    client = new McpTestClient(getActiveDbPath())
    await client.start()
  }, 15000)

  afterAll(() => {
    client?.stop()
  })

  it('lists registered MCP tools via tools/list', async () => {
    const tools = await client.listTools()
    expect(Array.isArray(tools)).toBe(true)
    const toolNames = tools.map((t) => t.name)

    expect(toolNames).toContain('idea_create')
    expect(toolNames).toContain('idea_search')
    expect(toolNames).toContain('note_create')
    expect(toolNames).toContain('review_log')
    expect(toolNames).toContain('review_stats')
    expect(toolNames).toContain('goal_woop')
    expect(toolNames).toContain('focus_summary')
    expect(toolNames).toContain('quote_random')
    expect(toolNames).toContain('card_generate')
    expect(toolNames).toContain('search')
    expect(toolNames).toContain('fsrs_optimize')
    expect(toolNames).toContain('starter_install')
    expect(toolNames).toContain('cloud_sync')
  })

  it('captures and searches ideas via idea_create and idea_search', async () => {
    const createRes = await client.callTool<{ ok: boolean; idea: IdeaRow }>('idea_create', {
      title: 'MCP Autonomous Spaced Repetition Agent',
      content: 'An agent that creates review decks from chat sessions automatically.',
      tags: ['mcp', 'automation'],
    })

    expect(createRes.ok).toBe(true)
    expect(createRes.idea.id).toBeDefined()
    expect(createRes.idea.title).toBe('MCP Autonomous Spaced Repetition Agent')

    const searchRes = await client.callTool<{ count: number; ideas: IdeaRow[] }>('idea_search', {
      query: 'Autonomous',
    })
    expect(searchRes.count).toBeGreaterThanOrEqual(1)
    expect(searchRes.ideas.some((i) => i.title.includes('Autonomous'))).toBe(true)
  })

  it('creates notes and resolves wikilinks via note_create', async () => {
    const res = await client.callTool<{
      ok: boolean
      note: NoteRow
      wikilinksUnresolved: string[]
    }>('note_create', {
      title: 'Hebbian Learning Principle',
      content: 'Neurons that fire together wire together. Contextualized in [[Neural Plasticity]].',
      supertag: 'DEFINITION',
    })

    expect(res.ok).toBe(true)
    expect(res.note.id).toBeDefined()
    expect(res.note.title).toBe('Hebbian Learning Principle')
    expect(Array.isArray(res.wikilinksUnresolved)).toBe(true)
  })

  it('retrieves review retention stats via review_stats', async () => {
    const res = await client.callTool<{ trueRetention: unknown; dueCount: number }>(
      'review_stats',
      {},
    )

    expect(res.trueRetention).toBeDefined()
    expect(typeof res.dueCount).toBe('number')
  })

  it('generates basic cards without AI via card_generate', async () => {
    const res = await client.callTool<{ ok: boolean; created: number; cardIds: number[] }>(
      'card_generate',
      {
        text: 'What is neurogenesis? :: The creation of new neurons in the brain\nWhat is myelin? :: Insulating layer around nerves',
        deckName: 'MCP Neuroscience Deck',
      },
    )

    expect(res.ok).toBe(true)
    expect(res.created).toBe(2)
    expect(Array.isArray(res.cardIds)).toBe(true)
    expect(res.cardIds.length).toBe(2)
  })

  it('retrieves random quote via quote_random', async () => {
    const res = await client.callTool<{ quote: { text: string; author: string } }>(
      'quote_random',
      {},
    )

    expect(res.quote).toBeDefined()
    expect(res.quote.text).toBeDefined()
    expect(res.quote.author).toBeDefined()
  })

  it('executes search, fsrs_optimize, starter_install, and cloud_sync tools', async () => {
    const searchRes = await client.callTool<{ ok: boolean; count: number }>('search', {
      query: 'Hebbian',
      limit: 10,
    })
    expect(searchRes.ok).toBe(true)
    expect(searchRes.count).toBeGreaterThanOrEqual(1)

    const fsrsRes = await client.callTool<{ ok: boolean; desiredRetention: number }>(
      'fsrs_optimize',
      {
        mode: 'status',
      },
    )
    expect(fsrsRes.ok).toBe(true)
    expect(typeof fsrsRes.desiredRetention).toBe('number')

    const starterRes = await client.callTool<{ ok: boolean; courses: unknown[] }>(
      'starter_install',
      {
        action: 'list',
      },
    )
    expect(starterRes.ok).toBe(true)
    expect(Array.isArray(starterRes.courses)).toBe(true)
    expect(starterRes.courses.length).toBeGreaterThanOrEqual(3)

    const syncRes = await client.callTool<{ ok: boolean; sync: { provider: string } }>(
      'cloud_sync',
      {
        action: 'status',
      },
    )
    expect(syncRes.ok).toBe(true)
    expect(syncRes.sync.provider).toBeDefined()
  })
})
