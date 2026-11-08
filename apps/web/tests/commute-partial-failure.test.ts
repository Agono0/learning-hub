/**
 * POST /api/audio/circadian/commute — once reviews are committed, a failure in
 * the follow-up bookkeeping (session log, TMR cue minting) must NOT surface as a
 * 500: the client would offer "retry" and grade the same cards twice. Isolated
 * temp DB; the db module's mintTmrCues is forced to throw.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-commute-fail-')), 'c.db')

vi.mock('@learning-hub/db', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    mintTmrCues: () => {
      throw new Error('simulated: ON CONFLICT clause does not match any UNIQUE constraint')
    },
  }
})

type Modules = {
  route: typeof import('../app/api/audio/circadian/commute/route')
  db: typeof import('@learning-hub/db')
}
// Assigned in beforeAll, after LEARNING_HUB_DB points at the temp database.
let M: Modules
let cardId: number

beforeAll(async () => {
  M = {
    route: await import('../app/api/audio/circadian/commute/route'),
    db: await import('@learning-hub/db'),
  }
  const deckId = M.db.db.insert(M.db.decks).values({ name: 'D' }).returning().all()[0].id
  cardId = M.db.db
    .insert(M.db.cards)
    .values({
      deckId,
      type: 'basic',
      due: '2020-01-01T00:00:00.000Z',
      content: { basic: { front: 'Q', back: 'A' } },
    })
    .returning()
    .all()[0].id
})

describe('commute POST after a bookkeeping failure', () => {
  it('still reports the committed reviews (200) with a warning', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = await M.route.POST(
      new Request('http://localhost/api/audio/circadian/commute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionMode: 'commute',
          cardsReviewed: 1,
          durationSeconds: 30,
          handsFreeInputs: [
            { cardId, inputType: 'manual_tap', grade: 3, latencyMs: 1500, timestamp: 'x' },
          ],
        }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.gradedCount).toBe(1)
    expect(body.tmrCuesMinted).toBe(0)
    expect(body.warnings).toContain('sleep cues not queued')
    expect(body.session?.cardsReviewed).toBe(1)
    errorSpy.mockRestore()
  })
})
