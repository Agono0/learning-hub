import { describe, expect, it } from 'vitest'
import {
  MAP_LIMITS,
  mapUnmatchedModel,
  NOTETYPE_LIMITS,
  TEMPLATE_LIMITS,
} from '../../src/anki-import'
import { buildCollection, model, parse, PLAIN, US, type FxModel } from './fixtures'
import { zipSync } from 'fflate'
import { parseApkg } from '../../src/anki'

// Every refusal keeps the model's PLAIN name in skippedModels (existing string contract) and
// reports a stable code through onDiagnostic. No cards from a refused model are imported.
const base = { notes: [{ id: 1, mid: 100, flds: ['q', 'a'] }], cards: [{ nid: 1, ord: 0 }] }
const withTmpl = (qfmt: string, afmt = '{{Back}}', flds = ['Front', 'Back']): FxModel => ({
  id: 100,
  name: 'Skipme',
  flds,
  tmpls: [{ qfmt, afmt }],
})

async function skipped(models: FxModel[], b = base) {
  const { deck, diagnostics } = await parse({ models, ...b })
  return {
    names: deck.skippedModels,
    cards: deck.cards.length,
    codes: diagnostics.map((d) => d.code),
  }
}

describe('typed refusals leave the model in skippedModels', () => {
  const cases: [string, FxModel, string][] = [
    ['filter text:', withTmpl('{{text:Front}}'), 'filter'],
    ['filter cloze:', withTmpl('{{cloze:Front}}'), 'filter'],
    ['filter hint:', withTmpl('{{hint:Front}}'), 'filter'],
    ['filter type:', withTmpl('{{Front}}{{type:Back}}'), 'filter'],
    ['unknown filter', withTmpl('{{nonsense:Front}}'), 'filter'],
    ['html in template', withTmpl('<b>{{Front}}</b>'), 'html-or-media'],
    ['media in template', withTmpl('[sound:a.mp3]{{Front}}'), 'html-or-media'],
    ['unknown field', withTmpl('{{Missing}}'), 'unknown-key'],
    ['Deck special field', withTmpl('{{Deck}}'), 'unknown-key'],
    ['FrontSide on question', withTmpl('{{FrontSide}}'), 'frontside-on-question'],
    ['unbalanced conditional', withTmpl('{{#Front}}x'), 'unbalanced'],
    ['syntax switch', withTmpl('{{=<% %>=}}{{Front}}'), 'syntax'],
    [
      'empty question for the card row',
      withTmpl('{{#Back}}{{Front}}{{/Back}}', '{{Back}}', ['Front', 'Back']),
      'empty-question',
    ],
  ]
  for (const [name, m, code] of cases) {
    it(name, async () => {
      const b = name.startsWith('empty')
        ? { ...base, notes: [{ id: 1, mid: 100, flds: ['q', ''] }] }
        : base
      const r = await skipped([m], b)
      expect(r).toEqual({ names: ['Skipme'], cards: 0, codes: [code] })
    })
  }

  it('field value with markup or media in a referenced field skips the whole model', async () => {
    for (const bad of ['a<br>b', 'AT&amp;T', '[sound:x.mp3]', '<img src="a.png">']) {
      const r = await skipped([PLAIN], { ...base, notes: [{ id: 1, mid: 100, flds: [bad, 'ok'] }] })
      expect(r, bad).toEqual({ names: ['Renamed Plain'], cards: 0, codes: ['html-or-media'] })
    }
  })

  it('markup in a field no template references does not matter', async () => {
    const m = { ...PLAIN, flds: ['Front', 'Back', 'Unused'] }
    const r = await skipped([m], {
      ...base,
      notes: [{ id: 1, mid: 100, flds: ['q', 'a', '<b>x</b>'] }],
    })
    expect(r).toEqual({ names: [], cards: 1, codes: [] })
  })

  it('field count mismatch between note and notetype', async () => {
    const r = await skipped([PLAIN], { ...base, notes: [{ id: 1, mid: 100, flds: ['only one'] }] })
    expect(r.codes).toEqual(['field-count'])
  })

  it('a cards row whose ord has no template', async () => {
    const r = await skipped([PLAIN], { ...base, cards: [{ nid: 1, ord: 3 }] })
    expect(r).toEqual({ names: ['Renamed Plain'], cards: 0, codes: ['no-template-for-ord'] })
  })

  it('image-occlusion style or any kind other than 0 is refused as unsupported-kind', async () => {
    const r = await skipped([{ ...PLAIN, type: 2 }])
    expect(r.codes).toEqual(['unsupported-kind'])
  })

  it('malformed notetypes: no fields, no templates, duplicate field, bad ord', async () => {
    const bad: FxModel[] = [
      { ...PLAIN, flds: [] },
      { ...PLAIN, tmpls: [] },
      { ...PLAIN, flds: ['Front', 'Front'] },
      {
        ...PLAIN,
        tmpls: [
          { ...PLAIN.tmpls[0]!, ord: 0 },
          { ...PLAIN.tmpls[0]!, ord: 0 },
        ],
      },
    ]
    for (const m of bad) expect((await skipped([m])).codes).toEqual(['bad-notetype'])
  })

  it('a refused model does not affect an accepted model in the same file', async () => {
    const good: FxModel = { ...PLAIN, id: 101, name: 'Good' }
    const { deck } = await parse({
      models: [withTmpl('{{text:Front}}'), good],
      notes: [
        { id: 1, mid: 100, flds: ['q', 'a'] },
        { id: 2, mid: 101, flds: ['q2', 'a2'] },
      ],
      cards: [
        { nid: 1, ord: 0 },
        { nid: 2, ord: 0 },
      ],
    })
    expect(deck.skippedModels).toEqual(['Skipme'])
    expect(deck.cards).toHaveLength(1)
  })
})

describe('resource caps on the new path', () => {
  it('template recursion depth and size', async () => {
    const deep =
      '{{#Front}}'.repeat(TEMPLATE_LIMITS.maxDepth + 1) +
      'x' +
      '{{/Front}}'.repeat(TEMPLATE_LIMITS.maxDepth + 1)
    expect((await skipped([withTmpl(deep)])).codes).toEqual(['too-deep'])
    const big = 'a'.repeat(TEMPLATE_LIMITS.maxTemplateChars + 1)
    expect((await skipped([withTmpl(big)])).codes).toEqual(['template-too-large'])
  })

  it('rendered output per side', async () => {
    const m = withTmpl('{{Front}}{{Front}}')
    const big = 'x'.repeat(TEMPLATE_LIMITS.maxRenderedChars / 2 + 1)
    const r = await skipped([m], { ...base, notes: [{ id: 1, mid: 100, flds: [big, 'a'] }] })
    expect(r.codes).toEqual(['output-too-large'])
  })

  it('too many fields or templates', async () => {
    const f = Array.from({ length: NOTETYPE_LIMITS.maxFields + 1 }, (_, i) => `F${i}`)
    expect((await skipped([{ ...PLAIN, flds: f }])).codes).toEqual(['bad-notetype'])
    const t = Array.from({ length: NOTETYPE_LIMITS.maxTemplates + 1 }, () => PLAIN.tmpls[0]!)
    expect((await skipped([{ ...PLAIN, tmpls: t }])).codes).toEqual(['bad-notetype'])
  })

  it('cards rows scanned are budgeted (named whole-file refusal)', async () => {
    // fake opener: unlimited cards pages; the budget must stop the scan
    let pages = 0
    const opener = () => ({
      readOnly: true,
      prepare(sql: string) {
        if (sql.includes('FROM sqlite_master')) return { get: () => undefined, all: () => [] }
        if (sql.includes('FROM col')) {
          return {
            get: () => ({
              models: JSON.stringify({
                100: JSON.parse(JSON.stringify({ id: 100, name: 'X', type: 0 })),
              }),
              decks: JSON.stringify({}),
            }),
            all: () => [],
          }
        }
        if (sql.includes('FROM notes')) {
          return {
            get: () => undefined,
            all: () => [{ id: 1, mid: 100, tags: '', flds: 'a' + US + 'b' }],
          }
        }
        if (sql.includes('FROM cards WHERE id >')) {
          const after = Number(/id > (\d+)/.exec(sql)![1])
          pages++
          return {
            get: () => undefined,
            all: () =>
              Array.from({ length: 1000 }, (_, i) => ({ id: after + i + 1, nid: 99, ord: 0 })),
          }
        }
        return { get: () => undefined, all: () => [] }
      },
      close() {},
    })
    const zip = zipSync({
      'collection.anki2': buildCollection({ models: [PLAIN], notes: [], cards: [] }),
    })
    await expect(parseApkg(zip, { openDatabase: opener })).rejects.toThrow(
      /more than 1000000 cards rows/,
    )
    expect(pages).toBe(1001)
  })

  it('total rendered output across the cards of one model is budgeted', () => {
    // 340 cards x (100k front + 100k back) chars is just over the 64 Mi budget; every single
    // side is within its own cap, so only the aggregate budget can refuse.
    const m = model({
      id: 1,
      name: 'Big',
      flds: ['Front', 'Back'],
      tmpls: [{ qfmt: '{{Front}}{{Front}}', afmt: '{{Back}}{{Back}}' }],
    })
    const half = 'x'.repeat(TEMPLATE_LIMITS.maxRenderedChars / 2)
    const n = Math.ceil(MAP_LIMITS.maxOutputChars / (2 * TEMPLATE_LIMITS.maxRenderedChars)) + 1
    const notes = Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      tags: [],
      flds: half + US + half,
    }))
    const ords = new Map(notes.map((x) => [x.id, [0]]))
    const r = mapUnmatchedModel(m, 'Big', notes, ords)
    expect(r).toMatchObject({ ok: false, code: 'output-too-large' })
  })
})

// Upstream stock templates, as rslib/src/notetype/stock.rs at tag 25.09.2 builds them with
// format!("{}\n\n<hr id=answer>\n\n{}", fieldref("FrontSide"), fieldref(back)); read through the
// GitHub contents API (raw media type), which preserved the markup.
describe('verbatim stock templates under a renamed notetype', () => {
  const stock = '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}'
  it.each([
    ['Basic copy', [{ qfmt: '{{Front}}', afmt: stock }]],
    [
      'Basic (optional reversed card) copy',
      [
        { qfmt: '{{Front}}', afmt: stock },
        {
          qfmt: '{{#Add Reverse}}{{Back}}{{/Add Reverse}}',
          afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}',
        },
      ],
    ],
  ])('%s stays skipped with html-or-media', async (_n, tmpls) => {
    const { deck, diagnostics } = await parse({
      models: [{ id: 5, name: 'Basic-copy', flds: ['Front', 'Back', 'Add Reverse'], tmpls }],
      notes: [{ id: 1, mid: 5, flds: ['q', 'a', 'y'] }],
      cards: [{ nid: 1, ord: 0 }],
    })
    expect(deck.skippedModels).toEqual(['Basic-copy'])
    expect(diagnostics[0]).toMatchObject({ code: 'html-or-media' })
  })

  it('an empty answer side renders the "..." placeholder, so the card is always valid', async () => {
    const { deck } = await parse({
      models: [
        {
          id: 5,
          name: 'Q-only',
          flds: ['Front', 'Back'],
          tmpls: [{ qfmt: '{{Front}}', afmt: '{{Back}}' }],
        },
      ],
      notes: [{ id: 1, mid: 5, flds: ['q', '   '] }],
      cards: [{ nid: 1, ord: 0 }],
    })
    expect(deck.cards.map((c) => c.content)).toEqual([{ basic: { front: 'q', back: '...' } }])
  })
})
