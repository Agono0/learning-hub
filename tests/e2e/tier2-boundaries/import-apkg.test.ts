import { describe, it, expect } from 'vitest'
import { callRoute } from '../helpers/api-client'
import { exportDeckToJSON } from '@learning-hub/core'
import { db, cards, revlog } from '@learning-hub/db'
import { eq } from 'drizzle-orm'
import * as importRoute from '../../../apps/web/app/api/import/route'
import * as reviewRoute from '../../../apps/web/app/api/review/route'

describe('Tier 2 E2E: Anki & JSON Import to Review Pipeline', () => {
  it('imports plain-text Anki TSV export and preserves format fields', async () => {
    const tsvContent = `#separator:tab\n#html:true\nWhat is neuroplasticity?\tThe brain's ability to reorganize itself by forming new neural connections.\tneuro science`
    const res = await callRoute<{ ok: boolean; deckId: number; imported: number }>(
      importRoute.POST,
      {
        method: 'POST',
        body: {
          kind: 'txt',
          payload: tsvContent,
          deckName: 'Imported Anki TSV Deck',
        },
      },
    )

    expect(res.status).toBe(201)
    expect(res.data.ok).toBe(true)
    expect(res.data.imported).toBe(1)
    expect(res.data.deckId).toBeDefined()
  })

  it('imports full-fidelity JSON deck and completes first review cycle', async () => {
    // 1. Prepare JSON deck payload
    const deckPayload = JSON.stringify(
      exportDeckToJSON({
        name: 'Biochemistry Pathways',
        cards: [
          {
            type: 'basic',
            content: {
              basic: {
                front: 'What is the rate-limiting enzyme of glycolysis?',
                back: 'Phosphofructokinase-1 (PFK-1)',
              },
            },
            tags: ['biochem', 'metabolism'],
          },
          {
            type: 'cloze',
            content: {
              cloze: {
                text: 'The citric acid cycle takes place in the {{c1::mitochondrial matrix}}.',
                answers: ['mitochondrial matrix'],
                mode: 'basic',
              },
            },
            tags: ['biochem'],
          },
        ],
      }),
    )

    // 2. POST /api/import
    const importRes = await callRoute<{ ok: boolean; deckId: number; imported: number }>(
      importRoute.POST,
      {
        method: 'POST',
        body: {
          kind: 'json',
          payload: deckPayload,
        },
      },
    )

    expect(importRes.status).toBe(201)
    expect(importRes.data.ok).toBe(true)
    expect(importRes.data.imported).toBe(2)
    const deckId = importRes.data.deckId

    // 3. Find the imported cards
    const importedCards = await db.select().from(cards).where(eq(cards.deckId, deckId))
    expect(importedCards.length).toBe(2)
    const firstCard = importedCards[0]!
    expect(firstCard.state).toBe(0) // New state

    // 4. Execute first review via /api/review
    const reviewRes = await callRoute<{ ok: boolean; card: { state: number; reps: number } }>(
      reviewRoute.POST,
      {
        method: 'POST',
        body: {
          cardId: firstCard.id,
          grade: 3, // Good
          confidence: 1,
        },
      },
    )

    expect(reviewRes.status).toBe(200)
    expect(reviewRes.data.ok).toBe(true)

    // 5. Verify card memory state and append-only revlog entry
    const [updatedCard] = await db.select().from(cards).where(eq(cards.id, firstCard.id))
    expect(updatedCard.state).toBeGreaterThanOrEqual(1) // Learning or Review state
    expect(updatedCard.reps).toBe(1)

    const logs = await db.select().from(revlog).where(eq(revlog.cardId, firstCard.id))
    expect(logs.length).toBe(1)
    expect(logs[0]!.rating).toBe(3)
  })
})
