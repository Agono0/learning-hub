import { describe, it, expect, beforeAll } from 'vitest'
import { callRoute } from '../helpers/api-client'
import { db, notes, decks, cards } from '@learning-hub/db'
import * as searchNlRoute from '../../../apps/web/app/api/search/nl/route'
import * as weeklyRoute from '../../../apps/web/app/api/weekly/route'

describe('Tier 4 E2E: AI Assistant Surfaces & Manual-Mode Offline Resilience (Rule 9)', () => {
  beforeAll(async () => {
    // Seed knowledge content for AI retrieval & search planning
    await db.insert(notes).values({
      title: 'Cognitive Load Theory and Split-Attention Effect',
      content:
        'Sweller 1988: Cognitive load theory distinguishes intrinsic, extraneous, and germane load. The split-attention effect occurs when learners must divide attention between multiple sources of information.',
    })

    const [deck] = await db.insert(decks).values({ name: 'Cognitive Science Concepts' }).returning()

    await db.insert(cards).values({
      deckId: deck!.id,
      type: 'basic',
      content: {
        basic: {
          front: 'What causes extraneous cognitive load?',
          back: 'Poor instructional design or split-attention materials.',
        },
      },
      due: new Date().toISOString(),
    })
  })

  it('natural language search operates deterministically in offline manual mode', async () => {
    const res = await callRoute<{
      ok: boolean
      usedAI: boolean
      needsSetup: boolean
      plan: { queries: string[]; kinds: string[] }
      hits: Array<{ kind: string; title: string }>
    }>(searchNlRoute.POST, {
      method: 'POST',
      body: {
        question: 'split-attention cognitive load',
        mode: 'manual',
      },
    })

    expect(res.status).toBe(200)
    expect(res.data.ok).toBe(true)
    expect(res.data.usedAI).toBe(false)
    expect(res.data.needsSetup).toBe(false)
    expect(res.data.plan.queries).toContain('split-attention cognitive load')
    expect(res.data.hits.some((h) => h.title.includes('Cognitive Load'))).toBe(true)
  })

  it('gracefully degrades AI query to manual plan when no AI provider is configured', async () => {
    const res = await callRoute<{
      ok: boolean
      usedAI: boolean
      needsSetup: boolean
      plan: { queries: string[] }
      hits: Array<{ kind: string; title: string }>
    }>(searchNlRoute.POST, {
      method: 'POST',
      body: {
        question: 'How does split attention affect cognitive load?',
        mode: 'ai',
      },
    })

    expect(res.status).toBe(200)
    expect(res.data.ok).toBe(true)
    expect(res.data.usedAI).toBe(false)
    expect(res.data.needsSetup).toBe(true)
    expect(res.data.plan.queries.length).toBeGreaterThan(0)
    expect(Array.isArray(res.data.hits)).toBe(true)
  })

  it('weekly review generates rule-based insights and prompt-transport envelope', async () => {
    const res = await callRoute<{
      metrics: unknown
      suggestions: {
        mode: string
        suggestions: unknown[]
        envelope?: {
          feature: string
          prompt: string
          systemPrompt: string
        }
      }
    }>(weeklyRoute.GET, {
      method: 'GET',
      query: { tzOffset: 0 },
    })

    expect(res.status).toBe(200)
    expect(res.data.metrics).toBeDefined()
    expect(res.data.suggestions.mode).toBe('manual')
    expect(Array.isArray(res.data.suggestions.suggestions)).toBe(true)

    // Rule 9 Transport envelope must be provided for BYO-AI copy/paste workflows
    expect(res.data.suggestions.envelope).toBeDefined()
    expect(res.data.suggestions.envelope?.feature).toBe('coach')
    expect(res.data.suggestions.envelope?.prompt).toBeDefined()
  })
})
