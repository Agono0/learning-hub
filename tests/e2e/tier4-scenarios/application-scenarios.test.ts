import { describe, it, expect } from 'vitest'
import { callRoute } from '../helpers/api-client'
import type { CardRow, DeckRow, FocusSessionRow, IdeaRow } from '../helpers/rows'
import { McpTestClient } from '../helpers/mcp-client'
import { getActiveDbPath } from '../helpers/setup'
import * as decksRoute from '../../../apps/web/app/api/decks/route'
import * as cardsRoute from '../../../apps/web/app/api/cards/route'
import * as reviewRoute from '../../../apps/web/app/api/review/route'
import * as reviewStatsRoute from '../../../apps/web/app/api/review/stats/route'
import * as streaksRoute from '../../../apps/web/app/api/streaks/route'
import * as analyticsRoute from '../../../apps/web/app/api/analytics/route'
import * as achievementsRoute from '../../../apps/web/app/api/achievements/route'
import * as notesRoute from '../../../apps/web/app/api/notes/route'
import * as ideasRoute from '../../../apps/web/app/api/ideas/route'
import * as evolveRoute from '../../../apps/web/app/api/ideas/evolve/route'
import * as graphRoute from '../../../apps/web/app/api/graph/route'
import * as goalsRoute from '../../../apps/web/app/api/goals/route'
import * as focusRoute from '../../../apps/web/app/api/focus/route'
import * as focusIdRoute from '../../../apps/web/app/api/focus/[id]/route'
import * as frictionRoute from '../../../apps/web/app/api/friction/route'

describe('Tier 4: End-to-End Real-World Application Workflows', () => {
  it('executes the full Accelerated Learner Lifecycle from onboarding to analytics', async () => {
    // Phase 1: Deck Creation
    const deckRes = await callRoute<{ deck: DeckRow }>(decksRoute.POST, {
      method: 'POST',
      body: {
        name: 'Quantum Information Science',
        emoji: '⚛️',
        description: 'Qubits, entanglement, teleportation and quantum circuits',
      },
    })
    expect(deckRes.status).toBe(201)
    const deckId = deckRes.data.deck.id

    // Phase 2: Card Authoring across 4 formats
    // 1. Basic
    const basicRes = await callRoute<{ card: CardRow }>(cardsRoute.POST, {
      method: 'POST',
      body: {
        deckId,
        type: 'basic',
        content: {
          front: 'What is quantum superposition?',
          back: 'Linear combination of basis states: |ψ⟩ = α|0⟩ + β|1⟩',
        },
        due: new Date(Date.now() - 10000).toISOString(),
      },
    })
    expect(basicRes.status).toBe(201)
    const cardBasicId = basicRes.data.card.id

    // 2. Cloze
    const clozeRes = await callRoute<{ card: CardRow }>(cardsRoute.POST, {
      method: 'POST',
      body: {
        deckId,
        type: 'cloze',
        content: {
          text: 'The {{c1::Hadamard}} gate creates equal superposition from computational basis states.',
          answers: ['Hadamard'],
          mode: 'basic',
        },
        due: new Date(Date.now() - 10000).toISOString(),
      },
    })
    expect(clozeRes.status).toBe(201)
    const cardClozeId = clozeRes.data.card.id

    // 3. Typein
    const typeinRes = await callRoute<{ card: CardRow }>(cardsRoute.POST, {
      method: 'POST',
      body: {
        deckId,
        type: 'typein',
        content: {
          question: 'What is the dimension of the Hilbert space for n qubits?',
          acceptedAnswers: ['2^n', '2**n'],
        },
        due: new Date(Date.now() - 10000).toISOString(),
      },
    })
    expect(typeinRes.status).toBe(201)
    const cardTypeinId = typeinRes.data.card.id

    // 4. MCQ
    const mcqRes = await callRoute<{ card: CardRow }>(cardsRoute.POST, {
      method: 'POST',
      body: {
        deckId,
        type: 'mcq',
        content: {
          question: 'Which theorem states that an unknown quantum state cannot be copied?',
          options: ['No-cloning theorem', 'Bell theorem', 'Shor theorem', 'Heisenberg principle'],
          correctIndex: 0,
        },
        due: new Date(Date.now() - 10000).toISOString(),
      },
    })
    expect(mcqRes.status).toBe(201)
    const cardMcqId = mcqRes.data.card.id

    // Phase 3: Start Review Session
    const sessionRes = await callRoute<{ cards: CardRow[] }>(reviewRoute.GET, { query: { deckId } })
    expect(sessionRes.status).toBe(200)
    expect(sessionRes.data.cards.length).toBeGreaterThanOrEqual(4)

    // Phase 4: Grade each card with distinct outcomes
    // Card 1: Again (relearning / lapse)
    const r1 = await callRoute<{ card: CardRow; intervalDays: number }>(reviewRoute.POST, {
      method: 'POST',
      body: { cardId: cardBasicId, grade: 1, confidence: 0, timeMs: 6000 },
    })
    expect(r1.status).toBe(200)
    expect(r1.data.card.reps).toBe(1)
    expect(r1.data.card.state).toBe(1) // State 1: Learning

    // Card 2: Good (recalled)
    const r2 = await callRoute<{ card: CardRow; intervalDays: number }>(reviewRoute.POST, {
      method: 'POST',
      body: { cardId: cardClozeId, grade: 3, confidence: 1, timeMs: 4000 },
    })
    expect(r2.status).toBe(200)
    expect(r2.data.intervalDays).toBeGreaterThanOrEqual(0)

    // Card 3: Easy (rapid recall)
    const r3 = await callRoute<{ card: CardRow; intervalDays: number }>(reviewRoute.POST, {
      method: 'POST',
      body: { cardId: cardTypeinId, grade: 4, confidence: 1, timeMs: 2500 },
    })
    expect(r3.status).toBe(200)
    expect(r3.data.intervalDays).toBeGreaterThanOrEqual(1)

    // Card 4: Good
    const r4 = await callRoute<{ card: CardRow; intervalDays: number }>(reviewRoute.POST, {
      method: 'POST',
      body: { cardId: cardMcqId, grade: 3, confidence: 1, timeMs: 3800 },
    })
    expect(r4.status).toBe(200)

    // Phase 5: Verify Streaks & Level Growth
    const streakRes = await callRoute<{ xp: { total: number; level: number } }>(streaksRoute.GET)
    expect(streakRes.status).toBe(200)
    expect(streakRes.data.xp.total).toBeGreaterThan(0)
    expect(streakRes.data.xp.level).toBeGreaterThanOrEqual(1)

    // Phase 6: Verify Analytics & Workload Forecast
    const statsRes = await callRoute<{ today: { reviews: number; correct: number } }>(
      reviewStatsRoute.GET,
    )
    expect(statsRes.status).toBe(200)
    expect(statsRes.data.today.reviews).toBeGreaterThanOrEqual(4)
    expect(statsRes.data.today.correct).toBeGreaterThanOrEqual(3)

    const analyticsRes = await callRoute<{ forecast: unknown; heatmap: unknown }>(
      analyticsRoute.GET,
    )
    expect(analyticsRes.status).toBe(200)
    expect(analyticsRes.data.forecast).toBeDefined()
    expect(analyticsRes.data.heatmap).toBeDefined()

    // Phase 7: Check Achievements Live Aggregate
    const achievementsRes = await callRoute<{ stats: { totalReviews: number } }>(
      achievementsRoute.GET,
    )
    expect(achievementsRes.status).toBe(200)
    expect(achievementsRes.data.stats.totalReviews).toBeGreaterThanOrEqual(4)
  })

  it('executes the Zettelkasten Research & Idea Evolution workflow', async () => {
    // 1. Capture foundational ideas
    const idea1Res = await callRoute<{ idea: IdeaRow }>(ideasRoute.POST, {
      method: 'POST',
      body: {
        title: 'Hebbian Plasticity in Artificial Networks',
        content: 'Local synaptic learning rules as an alternative to global backpropagation.',
      },
    })
    const idea1Id = idea1Res.data.idea.id

    const idea2Res = await callRoute<{ idea: IdeaRow }>(ideasRoute.POST, {
      method: 'POST',
      body: {
        title: 'Spike-Timing-Dependent Plasticity (STDP)',
        content:
          'Temporal asymmetry in synaptic modification driven by millisecond order of action potentials.',
      },
    })
    const idea2Id = idea2Res.data.idea.id

    // 2. Synthesize & evolve ideas into combinatorial hybrid offspring
    const evolveRes = await callRoute<{ ok: boolean; offspring: IdeaRow }>(evolveRoute.POST, {
      method: 'POST',
      body: { aId: idea1Id, bId: idea2Id },
    })
    expect(evolveRes.status).toBe(200)
    expect(evolveRes.data.ok).toBe(true)
    const offspringId = evolveRes.data.offspring.id

    // 3. Draft permanent concept note with wikilinks
    const noteRes = await callRoute(notesRoute.POST, {
      method: 'POST',
      body: {
        title: 'Neuromorphic Computing Architectures',
        content:
          'Neuromorphic systems synthesize [[Hebbian Plasticity in Artificial Networks]] and [[Spike-Timing-Dependent Plasticity (STDP)]] on silicon chips.',
        supertag: 'THEOREM',
      },
    })
    expect(noteRes.status).toBe(200)

    // 4. Query knowledge graph and verify full cluster
    const graphRes = await callRoute<{ nodes: Array<{ id: string }> }>(graphRoute.GET)
    expect(graphRes.status).toBe(200)

    const hasOffspring = graphRes.data.nodes.some((n) => n.id === `idea:${offspringId}`)
    expect(hasOffspring).toBe(true)
  })

  it('executes the Deep Work Focus & Distraction Defense Loop across Web & MCP', async () => {
    // 1. Formulate WOOP Goal
    const goalRes = await callRoute(goalsRoute.POST, {
      method: 'POST',
      body: {
        wish: 'Finish Chapter 4 Draft',
        outcome: 'Ready for peer review',
        obstacle: 'Checking email every 10 minutes',
        ifThenPlan: 'If I want to open email, then I take a breath and refocus',
      },
    })
    expect(goalRes.status).toBe(201)

    // 2. Start Focus Session
    const startRes = await callRoute<{ session: FocusSessionRow }>(focusRoute.POST, {
      method: 'POST',
      body: {
        plannedMinutes: 25,
        type: 'pomodoro',
        task: 'Chapter 4 draft writing',
      },
    })
    expect(startRes.status).toBe(201)
    const sessionId = startRes.data.session.id

    // 3. Log a resisted friction distraction
    const frictionRes = await callRoute(frictionRoute.POST, {
      method: 'POST',
      body: {
        trigger: 'distraction',
        proceeded: false,
        sessionId,
      },
    })
    expect(frictionRes.status).toBe(201)

    // 4. Complete Session
    const completeRes = await callRoute<{ session: FocusSessionRow; xpAwarded: number }>(
      focusIdRoute.PATCH,
      {
        method: 'PATCH',
        params: { id: String(sessionId) },
        body: {
          actualMinutes: 25,
          completed: true,
          leaks: 0,
          mood: 4,
        },
      },
    )
    expect(completeRes.status).toBe(200)
    expect(completeRes.data.session.completed).toBe(true)
    expect(completeRes.data.xpAwarded).toBeGreaterThan(0)

    // 5. Verify stats via MCP client
    const mcpClient = new McpTestClient(getActiveDbPath())
    try {
      await mcpClient.start()
      const summary = await mcpClient.callTool<{ recentSessions: FocusSessionRow[] }>(
        'focus_summary',
        {},
      )
      expect(Array.isArray(summary.recentSessions)).toBe(true)
      const found = summary.recentSessions.find((s) => s.id === sessionId)
      expect(found).toMatchObject({ completed: true })
    } finally {
      mcpClient.stop()
    }
  })
})
