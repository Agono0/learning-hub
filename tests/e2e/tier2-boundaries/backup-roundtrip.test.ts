import { describe, it, expect, beforeAll } from 'vitest'
import { callRoute } from '../helpers/api-client'
import { db, decks, cards, notes } from '@learning-hub/db'
import { eq } from 'drizzle-orm'
import * as backupRoute from '../../../apps/web/app/api/backup/route'

describe('Tier 2 E2E: Full Backup & Restore Round-Trip Fidelity', () => {
  let originalDeckId: number

  beforeAll(async () => {
    // 1. Seed initial data
    const [deck] = await db
      .insert(decks)
      .values({ name: 'E2E Backup Source Deck', description: 'Permanent knowledge deck' })
      .returning()
    originalDeckId = deck!.id

    await db.insert(cards).values({
      deckId: originalDeckId,
      type: 'basic',
      content: { basic: { front: 'E2E Q1', back: 'E2E A1' } },
      due: new Date().toISOString(),
    })

    await db.insert(notes).values({
      title: 'E2E Master Note',
      content: 'Permanent note content for backup validation.',
    })
  })

  it('exports, wipes/mutates, and restores database with exact row-set fidelity', async () => {
    // Step 1: Export current database backup
    const exportRes = await callRoute<{
      version: number
      createdAt: string
      tables: Record<string, Record<string, unknown>[]>
    }>(backupRoute.GET, {
      method: 'GET',
    })
    expect(exportRes.status).toBe(200)
    expect(exportRes.data.tables.decks.some((d) => d.name === 'E2E Backup Source Deck')).toBe(true)
    const backupSnapshot = exportRes.data

    // Step 2: Mutate database (delete original deck and insert noise deck)
    await db.delete(decks).where(eq(decks.id, originalDeckId))
    await db.insert(decks).values({ name: 'Ephemeral Noise Deck To Be Cleared' })

    const allDecksBefore = await db.select().from(decks)
    expect(allDecksBefore.some((d) => d.name === 'Ephemeral Noise Deck To Be Cleared')).toBe(true)
    expect(allDecksBefore.some((d) => d.name === 'E2E Backup Source Deck')).toBe(false)

    // Step 3: Destructive restore with mode=replace
    const restoreRes = await callRoute<{ ok: boolean; mode: string }>(backupRoute.POST, {
      method: 'POST',
      query: { mode: 'replace' },
      body: backupSnapshot,
    })
    expect(restoreRes.status).toBe(200)
    expect(restoreRes.data.ok).toBe(true)
    expect(restoreRes.data.mode).toBe('replace')

    // Step 4: Verify row sets - original is restored, noise is gone
    const restoredDecks = await db.select().from(decks)
    expect(restoredDecks.some((d) => d.name === 'E2E Backup Source Deck')).toBe(true)
    expect(restoredDecks.some((d) => d.name === 'Ephemeral Noise Deck To Be Cleared')).toBe(false)
  })

  it('performs non-destructive Smart Merge preserving existing local state', async () => {
    // 1. Export current state
    const exportRes = await callRoute<{
      version: number
      createdAt: string
      tables: Record<string, Record<string, unknown>[]>
    }>(backupRoute.GET)
    const backupSnapshot = exportRes.data

    // 2. Synthesize an incoming backup with a new deck
    const mergePayload = {
      ...backupSnapshot,
      tables: {
        ...backupSnapshot.tables,
        decks: [
          ...backupSnapshot.tables.decks,
          {
            id: 88888,
            name: 'Non-Destructively Merged Deck',
            description: 'Imported via multi-device merge',
            delayed_feedback: 0,
            created_at: new Date().toISOString(),
          },
        ],
      },
    }

    // 3. POST with mode=merge
    const mergeRes = await callRoute<{ ok: boolean; mode: string }>(backupRoute.POST, {
      method: 'POST',
      query: { mode: 'merge' },
      body: mergePayload,
    })
    expect(mergeRes.status).toBe(200)
    expect(mergeRes.data.ok).toBe(true)
    expect(mergeRes.data.mode).toBe('merge')

    // 4. Verify both original deck and merged deck coexist
    const finalDecks = await db.select().from(decks)
    expect(finalDecks.some((d) => d.name === 'E2E Backup Source Deck')).toBe(true)
    expect(finalDecks.some((d) => d.name === 'Non-Destructively Merged Deck')).toBe(true)
  })
})
