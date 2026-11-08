import { describe, it, expect, beforeAll } from 'vitest'
import { callRoute } from '../helpers/api-client'
import type { CardRow, DeckRow, NoteRow } from '../helpers/rows'
import * as decksRoute from '../../../apps/web/app/api/decks/route'
import * as cardsRoute from '../../../apps/web/app/api/cards/route'
import * as cardIdRoute from '../../../apps/web/app/api/cards/[id]/route'
import * as reviewRoute from '../../../apps/web/app/api/review/route'
import * as goalsRoute from '../../../apps/web/app/api/goals/route'
import * as focusRoute from '../../../apps/web/app/api/focus/route'
import * as highlightsRoute from '../../../apps/web/app/api/reading/highlights/route'
import * as notesRoute from '../../../apps/web/app/api/notes/route'

describe('Tier 2: Boundary, Extreme Limits & Corner Case Validations', () => {
  let validDeckId: number

  beforeAll(async () => {
    const res = await callRoute<{ deck: DeckRow }>(decksRoute.POST, {
      method: 'POST',
      body: { name: 'Tier 2 Boundary Verification Deck' },
    })
    validDeckId = res.data.deck.id
  })

  describe('Empty and Missing Required Inputs', () => {
    it('rejects deck creation with empty or whitespace-only name (400)', async () => {
      const emptyRes = await callRoute<{ error?: string }>(decksRoute.POST, {
        method: 'POST',
        body: { name: '' },
      })
      expect(emptyRes.status).toBe(400)
      expect(emptyRes.data.error).toBeDefined()

      const whitespaceRes = await callRoute(decksRoute.POST, {
        method: 'POST',
        body: { name: '    \t   ' },
      })
      expect(whitespaceRes.status).toBe(400)
    })

    it('rejects card creation when missing required format content (400)', async () => {
      // Missing content entirely
      const missingContent = await callRoute(cardsRoute.POST, {
        method: 'POST',
        body: { deckId: validDeckId, type: 'basic' },
      })
      expect(missingContent.status).toBe(400)

      // Cloze card missing {{cN::}} markers
      const invalidCloze = await callRoute(cardsRoute.POST, {
        method: 'POST',
        body: {
          deckId: validDeckId,
          type: 'cloze',
          content: { text: 'No cloze markers here.', answers: ['markers'], mode: 'basic' },
        },
      })
      expect(invalidCloze.status).toBe(400)

      // MCQ card with out of bounds correctIndex
      const invalidMcq = await callRoute(cardsRoute.POST, {
        method: 'POST',
        body: {
          deckId: validDeckId,
          type: 'mcq',
          content: {
            question: 'What is 1+1?',
            options: ['1', '2'],
            correctIndex: 5, // out of bounds
          },
        },
      })
      expect(invalidMcq.status).toBe(400)
    })

    it('rejects review logging with missing cardId, grade or confidence (400)', async () => {
      const missingCard = await callRoute(reviewRoute.POST, {
        method: 'POST',
        body: { grade: 3, confidence: 1 },
      })
      expect(missingCard.status).toBe(400)

      const missingGrade = await callRoute(reviewRoute.POST, {
        method: 'POST',
        body: { cardId: 1, confidence: 1 },
      })
      expect(missingGrade.status).toBe(400)

      const missingConfidence = await callRoute(reviewRoute.POST, {
        method: 'POST',
        body: { cardId: 1, grade: 3 },
      })
      expect(missingConfidence.status).toBe(400)
    })

    it('rejects WOOP goal with empty wish (400)', async () => {
      const res = await callRoute(goalsRoute.POST, {
        method: 'POST',
        body: { wish: '   ' },
      })
      expect(res.status).toBe(400)
    })
  })

  describe('Out-of-Bounds & Invalid Numeric Limits', () => {
    it('rejects focus session with plannedMinutes <= 0 or > 600 (400)', async () => {
      const zeroMin = await callRoute(focusRoute.POST, {
        method: 'POST',
        body: { plannedMinutes: 0 },
      })
      expect(zeroMin.status).toBe(400)

      const negMin = await callRoute(focusRoute.POST, {
        method: 'POST',
        body: { plannedMinutes: -25 },
      })
      expect(negMin.status).toBe(400)

      const overMin = await callRoute(focusRoute.POST, {
        method: 'POST',
        body: { plannedMinutes: 720 }, // 12 hours > 600 min cap
      })
      expect(overMin.status).toBe(400)
    })

    it('clamps review session limit parameter between 1 and 100', async () => {
      const resLarge = await callRoute<{ cards: CardRow[] }>(reviewRoute.GET, {
        query: { deckId: validDeckId, limit: 500 },
      })
      expect(resLarge.status).toBe(200)
      // Limit capped at 100 internally
      expect(resLarge.data.cards.length).toBeLessThanOrEqual(100)
    })
  })

  describe('Conflict & Non-Existent Entity Handling (404 / 409)', () => {
    it('returns 409 Conflict when creating a deck with an already existing name', async () => {
      const res = await callRoute<{ error?: string }>(decksRoute.POST, {
        method: 'POST',
        body: { name: 'Tier 2 Boundary Verification Deck' },
      })
      expect(res.status).toBe(409)
      expect(res.data.error).toMatch(/already exists/i)
    })

    it('returns 404 Not Found when reviewing a non-existent card ID', async () => {
      const res = await callRoute<{ error?: string }>(reviewRoute.POST, {
        method: 'POST',
        body: { cardId: 9999999, grade: 3, confidence: 1 },
      })
      expect(res.status).toBe(404)
      expect(res.data.error).toMatch(/card not found/i)
    })

    it('returns 404 Not Found when fetching a non-existent card by ID', async () => {
      const res = await callRoute(cardIdRoute.GET, {
        params: { id: '9999999' },
      })
      expect(res.status).toBe(404)
    })

    it('returns 404 Not Found when adding highlights to non-existent source', async () => {
      const res = await callRoute(highlightsRoute.POST, {
        method: 'POST',
        body: { sourceId: 9999999, max: 5 },
      })
      expect(res.status).toBe(404)
    })
  })

  describe('Extreme Payloads, Escaping & Character Sets', () => {
    it('correctly handles large markdown text (30,000 chars) in notes', async () => {
      const longContent = 'Cognitive science principles.\n\n'.repeat(1000) // ~30,000 chars
      const res = await callRoute<{ note: NoteRow }>(notesRoute.POST, {
        method: 'POST',
        body: {
          title: 'Large Knowledge Synthesis Note',
          content: longContent,
        },
      })

      expect(res.status).toBe(200)
      expect(res.data.note.content.length).toBeGreaterThanOrEqual(30000)
    })

    it('correctly preserves KaTeX math, multi-byte Unicode, and emojis in card content', async () => {
      const mathPrompt = 'What is the Gaussian integral: $\\int_{-\\infty}^{\\infty} e^{-x^2} dx$?'
      const mathReveal = '$\\sqrt{\\pi}$ 🎯 (Euler-Poisson integral — 日本語: ガウス積分)'

      const res = await callRoute<{ card: CardRow }>(cardsRoute.POST, {
        method: 'POST',
        body: {
          deckId: validDeckId,
          type: 'basic',
          content: { front: mathPrompt, back: mathReveal },
          tags: ['math', '積分', 'emoji🚀'],
        },
      })

      expect(res.status).toBe(201)
      expect(res.data.card.content.basic?.front).toBe(mathPrompt)
      expect(res.data.card.content.basic?.back).toBe(mathReveal)
      expect(res.data.card.tags).toContain('emoji🚀')
      expect(res.data.card.tags).toContain('積分')
    })
  })
})
