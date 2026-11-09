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
    expect(toolNames).toContain('habit_list')
    expect(toolNames).toContain('habit_checkin')
    expect(toolNames).toContain('journal_write')
    expect(toolNames).toContain('journal_search')
    expect(toolNames).toContain('physio_log')
    expect(toolNames).toContain('reading_list')
    expect(toolNames).toContain('reading_add')
    expect(toolNames).toContain('study_plan_get')
    expect(toolNames).toContain('study_plan_set')
    expect(toolNames).toContain('gkt_session')
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

  it('manages habits, journal, and physio via lifestyle tools (Batch C1)', async () => {
    // 1. habit_list
    const habitsRes = await client.callTool<{
      ok: boolean
      habits: Array<{ id: number; name: string }>
    }>('habit_list', {})
    expect(habitsRes.ok).toBe(true)
    expect(Array.isArray(habitsRes.habits)).toBe(true)

    // 2. habit_checkin
    if (habitsRes.habits.length > 0) {
      const habitId = habitsRes.habits[0].id
      const checkin1 = await client.callTool<{ ok: boolean; created: boolean; xpAwarded: number }>(
        'habit_checkin',
        { habitId, date: '2026-11-09' },
      )
      expect(checkin1.ok).toBe(true)

      // Idempotency: second checkin returns alreadyDone / created: false
      const checkin2 = await client.callTool<{
        ok: boolean
        created: boolean
        alreadyDone: boolean
        xpAwarded: number
      }>('habit_checkin', { habitId, date: '2026-11-09' })
      expect(checkin2.ok).toBe(true)
      expect(checkin2.created).toBe(false)
      expect(checkin2.alreadyDone).toBe(true)
      expect(checkin2.xpAwarded).toBe(0)
    }

    // 3. journal_write
    const writeRes = await client.callTool<{ ok: boolean; entry: { date: string; mood: number } }>(
      'journal_write',
      {
        date: '2026-11-09',
        mood: 5,
        smallWins: 'Completed MCP lifestyle tools parity test',
        gratitude: 'Disciplined codebase and fast tests',
      },
    )
    expect(writeRes.ok).toBe(true)
    expect(writeRes.entry.date).toBe('2026-11-09')
    expect(writeRes.entry.mood).toBe(5)

    // 4. journal_search
    const searchRes = await client.callTool<{
      ok: boolean
      count: number
      entries: Array<{ date: string }>
    }>('journal_search', { q: 'lifestyle' })
    expect(searchRes.ok).toBe(true)
    expect(searchRes.count).toBeGreaterThanOrEqual(1)
    expect(searchRes.entries.some((e) => e.date === '2026-11-09')).toBe(true)

    // 5. physio_log
    const physioRes = await client.callTool<{
      ok: boolean
      saved: boolean
      log: { sleepHours: number } | null
      insights: { caffeine: { cutoffTime: number }; arousal: { zone: string } }
    }>('physio_log', {
      date: '2026-11-09',
      sleepHours: 7.5,
      sleepQuality: 4,
      exerciseMinutes: 30,
      arousal: 6,
    })
    expect(physioRes.ok).toBe(true)
    expect(physioRes.saved).toBe(true)
    expect(physioRes.log?.sleepHours).toBe(7.5)
    expect(physioRes.insights.caffeine).toBeDefined()
    expect(physioRes.insights.arousal.zone).toBeDefined()
  })

  it('manages reading, study-plan, and gkt via learning-path tools (Batch C2)', async () => {
    // 1. reading_add & reading_list
    const addSource = await client.callTool<{
      ok: boolean
      source: { id: number; title: string; priority: number }
    }>('reading_add', {
      title: 'Active Recall vs Passive Review in Medical Education',
      content: 'Empirical study demonstrating long-term retention benefits of testing effects.',
      kind: 'article',
      priority: 85,
    })
    expect(addSource.ok).toBe(true)
    expect(addSource.source.id).toBeDefined()
    expect(addSource.source.priority).toBe(85)

    const listReading = await client.callTool<{
      ok: boolean
      count: number
      sources: Array<{ id: number; title: string }>
    }>('reading_list', { limit: 10 })
    expect(listReading.ok).toBe(true)
    expect(listReading.sources.some((s) => s.title.includes('Active Recall'))).toBe(true)

    // 2. study_plan_set & study_plan_get
    const planSet = await client.callTool<{
      ok: boolean
      plan: { weeklyMinutes: number; weeks: number }
      weeklyMinutes: number
    }>('study_plan_set', {
      weeklyMinutes: 240,
      restDay: 0,
    })
    expect(planSet.ok).toBe(true)
    expect(planSet.weeklyMinutes).toBe(240)

    const planGet = await client.callTool<{
      ok: boolean
      weeklyMinutes: number
      schedule: string[]
    }>('study_plan_get', { format: 'summary' })
    expect(planGet.ok).toBe(true)
    expect(planGet.weeklyMinutes).toBe(240)
    expect(Array.isArray(planGet.schedule)).toBe(true)

    // 3. gkt_session
    const gktStart = await client.callTool<{
      ok: boolean
      nodeCount: number
      concepts: Array<{ id: string; title: string; mastery: number }>
    }>('gkt_session', { action: 'start' })
    expect(gktStart.ok).toBe(true)
    expect(gktStart.nodeCount).toBeGreaterThanOrEqual(1)

    const conceptId = gktStart.concepts[0].id
    const gktAnswer = await client.callTool<{
      ok: boolean
      conceptId: string
      passed: boolean
      updatedMasteries: Record<string, number>
    }>('gkt_session', {
      action: 'answer',
      item: conceptId,
      correct: true,
    })
    expect(gktAnswer.ok).toBe(true)
    expect(gktAnswer.updatedMasteries[conceptId]).toBeDefined()
  })
})
