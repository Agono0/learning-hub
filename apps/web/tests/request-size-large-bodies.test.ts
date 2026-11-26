/**
 * Routes whose schema legitimately allows a body above the 1 MiB default must say so with an
 * explicit maxBytes sized from the schema: the largest valid body is accepted (never a 413) and a
 * field one unit over the schema max is refused by validation (400), not by the byte cap.
 * Only counts and statuses are asserted, no timing.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_JSON_BODY_BYTES } from '@/lib/api'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-large-body-')), 'a.db')

type Handler = { POST: (req: Request) => Promise<Response> }
let attemptImage: Handler
let multimodal: Handler

let cardId = 0

beforeAll(async () => {
  const dbm = await import('@learning-hub/db')
  const deck = dbm.db.insert(dbm.decks).values({ name: 'Sketch' }).returning().all()[0]!
  cardId = dbm.db
    .insert(dbm.cards)
    .values({
      deckId: deck.id,
      type: 'basic',
      content: { basic: { front: 'f', back: 'b' } },
      due: '2026-01-01T00:00:00.000Z',
    })
    .returning()
    .all()[0]!.id
  attemptImage = await import('../src/server/handlers/review/attempt-image/route')
  multimodal = await import('../src/server/handlers/ingest/multimodal/route')
})

async function status(h: Handler, raw: string): Promise<number> {
  const res = await h.POST(
    new Request('http://localhost/api/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw,
    }),
  )
  return res.status
}

const MAX_IMAGE_CHARS = 8 * 1024 * 1024
const MAX_CONTENT_CHARS = 500_000
const image = (n: number) =>
  JSON.stringify({ cardId, imageData: 'data:image/png;base64,'.padEnd(n, 'A') })
const notes = (rawContent: string) => JSON.stringify({ kind: 'markdown_notes', rawContent })

describe('review/attempt-image body', () => {
  it('accepts an image data URL above 1 MiB, up to the schema maximum', async () => {
    const body = image(MAX_IMAGE_CHARS)
    expect(body.length).toBeGreaterThan(DEFAULT_JSON_BODY_BYTES * 4)
    expect(await status(attemptImage, body)).toBe(200)
  })
  it('refuses one character over the schema maximum with 400 validation', async () => {
    expect(await status(attemptImage, image(MAX_IMAGE_CHARS + 1))).toBe(400)
  })
  it('still refuses a body far past the route cap with 413', async () => {
    expect(await status(attemptImage, image(MAX_IMAGE_CHARS + 64 * 1024))).toBe(413)
  })
})

describe('ingest/multimodal body', () => {
  it('accepts 500k multibyte characters (over 1 MiB as bytes)', async () => {
    const body = notes('€'.repeat(MAX_CONTENT_CHARS))
    expect(Buffer.byteLength(body)).toBeGreaterThan(DEFAULT_JSON_BODY_BYTES)
    expect(await status(multimodal, body)).toBe(200)
  })
  it('accepts 500k characters that JSON-escape to six bytes each', async () => {
    const body = notes('\u0001'.repeat(MAX_CONTENT_CHARS))
    expect(Buffer.byteLength(body)).toBeGreaterThan(DEFAULT_JSON_BODY_BYTES * 2)
    expect(await status(multimodal, body)).toBe(200)
  })
  it('refuses one character over the schema maximum with 400 validation', async () => {
    expect(await status(multimodal, notes('€'.repeat(MAX_CONTENT_CHARS + 1)))).toBe(400)
  })
})
