import { describe, expect, it, vi } from 'vitest'
import {
  MAX_CARD_FRONT,
  buildCardCreate,
  buildReaderIngest,
  captureEndpoints,
  pickDeckId,
  resolveDeck,
  sendToFirst,
} from '../src/capture'

describe('context-menu capture', () => {
  it('orders native loopback before the web dev server', () => {
    expect(captureEndpoints(47615)).toEqual(['http://127.0.0.1:47615', 'http://localhost:3000'])
  })

  it('builds an ingest body using the `mode` discriminator the handler expects', () => {
    const req = buildReaderIngest('https://example.com/a', '  Article  ')
    expect(req).toEqual({
      path: '/api/reading/ingest',
      body: { mode: 'url', url: 'https://example.com/a', title: 'Article' },
    })
  })

  it('skips non-http pages and omits blank titles', () => {
    expect(buildReaderIngest('chrome://extensions', 'x')).toBeNull()
    expect(buildReaderIngest(undefined, 'x')).toBeNull()
    expect(buildReaderIngest('http://x.dev', '   ')?.body).toEqual({
      mode: 'url',
      url: 'http://x.dev',
    })
  })

  it('builds a basic card, normalising whitespace and capping length', () => {
    const req = buildCardCreate('  a\n\n b  ', 7, 'https://src.dev')
    expect(req?.body).toMatchObject({
      deckId: 7,
      type: 'basic',
      content: { basic: { front: 'a b', back: 'Source: https://src.dev' } },
      source: 'https://src.dev',
    })
    const long = buildCardCreate('x'.repeat(5000), 1, undefined)
    const front = (long?.body as { content: { basic: { front: string } } }).content.basic.front
    expect(front).toHaveLength(MAX_CARD_FRONT)
    expect(buildCardCreate('   ', 1, undefined)).toBeNull()
  })

  it('picks the first valid deck id', () => {
    expect(pickDeckId({ decks: [{ id: 'x' }, { id: 4 }, { id: 9 }] })).toBe(4)
    expect(pickDeckId({ decks: [] })).toBeNull()
    expect(pickDeckId(null)).toBeNull()
  })

  it('falls through unreachable and failing backends', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(new Response('{}', { status: 201 }))
    const out = await sendToFirst(fetchFn, ['a', 'b'], { path: '/p', body: {} })
    expect(out?.base).toBe('b')
    expect(fetchFn).toHaveBeenCalledTimes(2)

    const none = await sendToFirst(
      vi.fn().mockResolvedValue(new Response('', { status: 500 })),
      ['a'],
      { path: '/p', body: {} },
    )
    expect(none).toBeNull()
  })

  it('resolves a deck from the first backend that has one', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ decks: [] }))
      .mockResolvedValueOnce(Response.json({ decks: [{ id: 3 }] }))
    expect(await resolveDeck(fetchFn, ['a', 'b'])).toEqual({ base: 'b', deckId: 3 })
  })
})
