import { describe, it, expect } from 'vitest'
import { callRoute } from '../helpers/api-client'
import { db, decks, revlog } from '@learning-hub/db'
import { eq } from 'drizzle-orm'
import * as imagesRoute from '../../../apps/web/app/api/images/route'
import * as imagesIdRoute from '../../../apps/web/app/api/images/[id]/route'
import * as cardsRoute from '../../../apps/web/app/api/cards/route'
import * as reviewRoute from '../../../apps/web/app/api/review/route'

describe('Tier 3 E2E: Dual-Coding Image Upload, Storage & Review Cycle', () => {
  // 1x1 transparent PNG payload
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  const pngBytes = Buffer.from(pngBase64, 'base64')

  it('uploads image, serves bytes with caching headers, and attaches to occlusion card for review', async () => {
    // 1. Upload image via multipart/form-data
    const formData = new FormData()
    const file = new File([pngBytes], 'anatomy_diagram.png', { type: 'image/png' })
    formData.append('file', file)

    const uploadRes = await callRoute<{
      ok: boolean
      id: number
      filename: string
      mime: string
    }>(imagesRoute.POST, {
      method: 'POST',
      body: formData,
    })

    expect(uploadRes.status).toBe(201)
    expect(uploadRes.data.ok).toBe(true)
    const imageId = uploadRes.data.id
    expect(imageId).toBeDefined()
    expect(uploadRes.data.mime).toBe('image/png')

    // 2. Fetch image bytes via GET /api/images/[id]
    const getRes = await callRoute<string>(imagesIdRoute.GET, {
      method: 'GET',
      params: { id: String(imageId) },
    })

    expect(getRes.status).toBe(200)
    expect(getRes.headers.get('content-type')).toContain('image/png')
    expect(getRes.headers.get('cache-control')).toContain('immutable')

    // 3. Create a deck and card referencing this dual-coding image
    const [deck] = await db.insert(decks).values({ name: 'Dual Coding Anatomy Deck' }).returning()
    const deckId = deck!.id

    const cardRes = await callRoute<{ card: { id: number } }>(cardsRoute.POST, {
      method: 'POST',
      body: {
        deckId,
        type: 'basic',
        content: {
          front: 'Identify structure indicated in the diagram',
          back: 'Hippocampus dentate gyrus',
          imageId,
        },
      },
    })

    expect(cardRes.status).toBe(201)
    const cardId = cardRes.data.card.id
    expect(cardId).toBeDefined()

    // 4. Complete review on this card
    const reviewRes = await callRoute<{ ok: boolean }>(reviewRoute.POST, {
      method: 'POST',
      body: {
        cardId,
        grade: 4, // Easy
        confidence: 1,
      },
    })

    expect(reviewRes.status).toBe(200)
    expect(reviewRes.data.ok).toBe(true)

    // 5. Verify revlog entry is recorded
    const logs = await db.select().from(revlog).where(eq(revlog.cardId, cardId))
    expect(logs.length).toBe(1)
    expect(logs[0]!.rating).toBe(4)
  })
})
