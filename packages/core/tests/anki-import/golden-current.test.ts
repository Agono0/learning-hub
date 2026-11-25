import { describe, expect, it } from 'vitest'
import { parse, type FxModel } from './fixtures'

// Golden outputs of the importer BEFORE the notetype-driven path existed, measured by running
// the pre-change parseApkg on these exact inputs (base 30d66cf). Models matched by name or by
// cloze type must keep these results byte for byte, including raw markup and media strings.
const stdTmpl = [{ qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}' }]
const basic = (name: string): FxModel => ({ id: 7, name, flds: ['Front', 'Back'], tmpls: stdTmpl })
const cloze = (name: string): FxModel => ({
  id: 7,
  name,
  type: 1,
  flds: ['Text', 'Back Extra'],
  tmpls: [{ qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>{{Back Extra}}' }],
})
const run = async (m: FxModel, flds: string[]) => {
  const { deck, diagnostics } = await parse({
    models: [m],
    notes: [{ id: 1, mid: 7, flds }],
    cards: [{ nid: 1, ord: 0 }],
  })
  return { cards: deck.cards.map((c) => c.content), skipped: deck.skippedModels, diagnostics }
}

describe('name-matched models are unchanged', () => {
  it('Basic plain', async () => {
    const r = await run(basic('Basic'), ['Q', 'A'])
    expect(r.cards).toEqual([{ basic: { front: 'Q', back: 'A' } }])
    expect(r.skipped).toEqual([])
    expect(r.diagnostics).toEqual([])
  })

  it('Basic with markup keeps the raw HTML (no conversion)', async () => {
    const r = await run(basic('Basic'), ['Line1<br>Line2 &amp; <b>x</b>&nbsp;y', '<div>ans</div>'])
    expect(r.cards).toEqual([
      { basic: { front: 'Line1<br>Line2 &amp; <b>x</b>&nbsp;y', back: '<div>ans</div>' } },
    ])
    expect(r.skipped).toEqual([])
  })

  it('Basic with media references keeps them raw', async () => {
    const r = await run(basic('Basic'), ['<img src="a.png">', '[sound:b.mp3]'])
    expect(r.cards).toEqual([{ basic: { front: '<img src="a.png">', back: '[sound:b.mp3]' } }])
  })

  it('Cloze plain keeps its enumeration cloze card', async () => {
    const r = await run(cloze('Cloze'), ['The {{c1::sky}} is {{c2::blue}}', ''])
    expect(r.cards).toEqual([
      {
        cloze: {
          text: 'The {{c1::sky}} is {{c2::blue}}',
          answers: ['sky', 'blue'],
          mode: 'enumeration',
        },
      },
    ])
  })

  it('Cloze with markup keeps the markup', async () => {
    const r = await run(cloze('Cloze'), ['The <b>{{c1::sky}}</b>', ''])
    expect(r.cards).toEqual([
      { cloze: { text: 'The <b>{{c1::sky}}</b>', answers: ['sky'], mode: 'basic' } },
    ])
  })

  it('a type-1 model under any name stays on the legacy cloze path, never the new one', async () => {
    const r = await run(cloze('My Cloze Copy'), ['A {{c1::b}}', ''])
    expect(r.cards).toHaveLength(1)
    expect(r.diagnostics).toEqual([])
  })

  it('Basic (and reversed card) still yields two reciprocal cards from the model name', async () => {
    const { deck } = await parse({
      models: [basic('Basic (and reversed card)')],
      notes: [{ id: 1, mid: 7, flds: ['Q', 'A'] }],
      cards: [{ nid: 1, ord: 0 }],
    })
    expect(deck.cards.map((c) => c.content)).toEqual([
      { basic: { front: 'Q', back: 'A' } },
      { basic: { front: 'A', back: 'Q' } },
    ])
  })

  it('stock default answer template has markup, so a renamed copy stays skipped by name', async () => {
    const r = await run(basic('Basic-a1b2c'), ['Q', 'A'])
    expect(r.cards).toEqual([])
    expect(r.skipped).toEqual(['Basic-a1b2c'])
    expect(r.diagnostics.map((d) => d.code)).toEqual(['html-or-media'])
  })
})
