import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createIsolatedTestDb, type TestDbContext } from '../helpers/test-db'
import { callRoute } from '../helpers/api-client'
import * as decksRoute from '../../../apps/web/app/api/decks/route'
import * as deckIdRoute from '../../../apps/web/app/api/decks/[id]/route'
import * as cardsRoute from '../../../apps/web/app/api/cards/route'
import * as cardIdRoute from '../../../apps/web/app/api/cards/[id]/route'

describe('Tier 1: Decks and Cards API Lifecycle', () => {
  let createdDeckId: number

  it('creates a new deck with name, emoji, and description', async () => {
    const res = await callRoute(decksRoute.POST, {
      method: 'POST',
      body: {
        name: 'E2E Test Deck: Neuroscience',
        emoji: '🧠',
        description: 'Flashcards covering memory and synapses',
      },
    })

    expect(res.status).toBe(201)
    expect(res.data.ok).toBe(true)
    expect(res.data.deck.id).toBeDefined()
    expect(res.data.deck.name).toBe('E2E Test Deck: Neuroscience')
    expect(res.data.deck.emoji).toBe('🧠')
    createdDeckId = res.data.deck.id
  })

  it('lists decks including card counts and due counts', async () => {
    const res = await callRoute(decksRoute.GET)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.data.decks)).toBe(true)
    const found = res.data.decks.find((d: any) => d.id === createdDeckId)
    expect(found).toBeDefined()
    expect(found.total).toBe(0)
    expect(found.due).toBe(0)
  })

  it('updates deck details via PATCH /api/decks/[id]', async () => {
    const res = await callRoute(deckIdRoute.PATCH, {
      method: 'PATCH',
      params: { id: String(createdDeckId) },
      body: {
        description: 'Updated description for neuroscience',
        emoji: '🔬',
      },
    })

    expect(res.status).toBe(200)
    expect(res.data.ok).toBe(true)
    expect(res.data.deck.id).toBe(createdDeckId)
    expect(res.data.deck.description).toBe('Updated description for neuroscience')
    expect(res.data.deck.emoji).toBe('🔬')
  })

  it('creates cards of various formats: basic, cloze, typein, and mcq', async () => {
    // 1. Basic card
    const basicRes = await callRoute(cardsRoute.POST, {
      method: 'POST',
      body: {
        deckId: createdDeckId,
        type: 'basic',
        content: { front: 'What is LTP?', back: 'Long-Term Potentiation' },
        tags: ['neuroscience', 'synapse'],
      },
    })
    expect(basicRes.status).toBe(201)
    expect(basicRes.data.card.type).toBe('basic')
    expect(basicRes.data.card.deckId).toBe(createdDeckId)
    const basicCardId = basicRes.data.card.id

    // 2. Cloze card
    const clozeRes = await callRoute(cardsRoute.POST, {
      method: 'POST',
      body: {
        deckId: createdDeckId,
        type: 'cloze',
        content: {
          text: 'Synaptic plasticity is the basis of {{c1::learning}} and memory.',
          answers: ['learning'],
          mode: 'basic',
        },
        tags: ['cloze', 'memory'],
      },
    })
    expect(clozeRes.status).toBe(201)
    expect(clozeRes.data.card.type).toBe('cloze')

    // 3. Typein card
    const typeinRes = await callRoute(cardsRoute.POST, {
      method: 'POST',
      body: {
        deckId: createdDeckId,
        type: 'typein',
        content: {
          question: 'What neurotransmitter is key for motor neurons?',
          acceptedAnswers: ['acetylcholine', 'ACh'],
        },
        tags: ['neurotransmitter'],
      },
    })
    expect(typeinRes.status).toBe(201)
    expect(typeinRes.data.card.type).toBe('typein')

    // 4. MCQ card
    const mcqRes = await callRoute(cardsRoute.POST, {
      method: 'POST',
      body: {
        deckId: createdDeckId,
        type: 'mcq',
        content: {
          question: 'Which brain region is critical for declarative memory consolidation?',
          options: ['Hippocampus', 'Cerebellum', 'Medulla', 'Basal Ganglia'],
          correctIndex: 0,
          rationale: 'The hippocampus is essential for consolidating short-term memory to long-term memory.',
        },
        tags: ['brain'],
      },
    })
    expect(mcqRes.status).toBe(201)
    expect(mcqRes.data.card.type).toBe('mcq')

    // Verify GET /api/cards returns all 4 cards for this deck
    const listRes = await callRoute(cardsRoute.GET, {
      query: { deckId: createdDeckId },
    })
    expect(listRes.status).toBe(200)
    expect(listRes.data.cards.length).toBe(4)

    // Verify GET /api/cards/[id]
    const singleRes = await callRoute(cardIdRoute.GET, {
      params: { id: String(basicCardId) },
    })
    expect(singleRes.status).toBe(200)
    expect(singleRes.data.card.id).toBe(basicCardId)

    // Verify PATCH /api/cards/[id] (suspension toggle)
    const patchRes = await callRoute(cardIdRoute.PATCH, {
      method: 'PATCH',
      params: { id: String(basicCardId) },
      body: { suspended: true },
    })
    expect(patchRes.status).toBe(200)
    expect(patchRes.data.card.suspended).toBe(true)

    // Verify DELETE /api/cards/[id]
    const delRes = await callRoute(cardIdRoute.DELETE, {
      method: 'DELETE',
      params: { id: String(basicCardId) },
    })
    expect(delRes.status).toBe(200)
    expect(delRes.data.ok).toBe(true)

    // After deletion, 3 cards remain
    const afterDelRes = await callRoute(cardsRoute.GET, {
      query: { deckId: createdDeckId },
    })
    expect(afterDelRes.data.cards.length).toBe(3)
  })

  it('supports bulk card creation via PUT /api/cards?bulk=1', async () => {
    const bulkRes = await callRoute(cardsRoute.PUT, {
      method: 'PUT',
      query: { bulk: 1 },
      body: {
        deckId: createdDeckId,
        items: [
          { type: 'basic', content: { front: 'Axon', back: 'Transmits action potentials' } },
          { type: 'basic', content: { front: 'Dendrite', back: 'Receives signals' } },
        ],
      },
    })

    expect(bulkRes.status).toBe(201)
    expect(bulkRes.data.ok).toBe(true)
    expect(bulkRes.data.created).toBe(2)
  })
})
