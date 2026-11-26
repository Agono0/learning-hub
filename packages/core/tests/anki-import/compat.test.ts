import { describe, expect, it } from 'vitest'
import { zipSync } from 'fflate'
import { parseApkg } from '../../src/anki'
import { parseCloze } from '../../src/cards'
import { buildCollection, parse, PLAIN } from './fixtures'

describe('public result shape and compatibility', () => {
  it('ParsedDeck keys are unchanged: name, cards, skippedModels only', async () => {
    const { deck } = await parse({
      models: [PLAIN],
      notes: [{ id: 1, mid: 100, flds: ['q', 'a'] }],
      cards: [{ nid: 1, ord: 0 }],
    })
    expect(Object.keys(deck).sort()).toEqual(['cards', 'name', 'skippedModels'])
    expect(Object.keys(deck.cards[0]!).sort()).toEqual(['content', 'format', 'tags'])
  })

  it('works without an onDiagnostic callback (route path)', async () => {
    const zip = zipSync({
      'collection.anki2': buildCollection({
        models: [{ ...PLAIN, tmpls: [{ qfmt: '{{text:Front}}', afmt: '{{Back}}' }] }],
        notes: [{ id: 1, mid: 100, flds: ['q', 'a'] }],
        cards: [{ nid: 1, ord: 0 }],
      }),
    })
    const deck = await parseApkg(zip)
    expect(deck.skippedModels).toEqual(['Renamed Plain'])
    expect(deck.cards).toEqual([])
  })

  it('mixed deck: matched model first by note order, new-path cards after', async () => {
    const basic = {
      id: 7,
      name: 'Basic',
      flds: ['Front', 'Back'],
      tmpls: [{ qfmt: '{{Front}}', afmt: '{{Back}}' }],
    }
    const { deck } = await parse({
      models: [basic, PLAIN],
      notes: [
        { id: 1, mid: 100, flds: ['p-q', 'p-a'] },
        { id: 2, mid: 7, flds: ['b-q', 'b-a'] },
      ],
      cards: [
        { nid: 1, ord: 0 },
        { nid: 2, ord: 0 },
      ],
    })
    expect(deck.cards.map((c) => (c.content as { basic: { front: string } }).basic.front)).toEqual([
      'b-q',
      'p-q',
    ])
  })

  it('the cards table is not read when every model is matched (no extra query cost)', async () => {
    const seen: string[] = []
    const real = buildCollection({
      models: [
        {
          id: 7,
          name: 'Basic',
          flds: ['Front', 'Back'],
          tmpls: [{ qfmt: '{{Front}}', afmt: '{{Back}}' }],
        },
      ],
      notes: [{ id: 1, mid: 7, flds: ['q', 'a'] }],
      cards: [{ nid: 1, ord: 0 }],
    })
    const Database = (await import('better-sqlite3')).default
    const opener = (b: Uint8Array) => {
      const db = new Database(Buffer.from(b))
      db.pragma('query_only = ON')
      return {
        readOnly: true as const,
        prepare: (sql: string) => {
          seen.push(sql)
          return db.prepare(sql) as never
        },
        close: () => db.close(),
      }
    }
    await parseApkg(zipSync({ 'collection.anki2': real }), { openDatabase: opener })
    expect(seen.some((s) => s.includes('FROM cards WHERE id >'))).toBe(false)
  })

  it('parseCloze does not handle nested clozes, which is why cloze stays on the legacy path', () => {
    // {{c1::bar {{c2::baz}}}}: the non-greedy regex closes at the first }} and the answer is mangled
    // text is cut. Nested support is therefore NOT claimed or enabled for the new path.
    const r = parseCloze('foo {{c1::bar {{c2::baz}}}}')
    expect(r.answers).toEqual(['bar {{c2'])
  })
})
