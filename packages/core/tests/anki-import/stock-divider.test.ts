import { describe, expect, it } from 'vitest'
import { normalizeAnswerSource } from '../../src/anki-import'
import { parse, type FxModel } from './fixtures'

// Upstream stock answer templates: ankitects/anki tag 25.09.2 rslib/src/notetype/stock.rs,
// basic() and basic_forward_reverse() build them with
//   format!("{}\n\n<hr id=answer>\n\n{}", fieldref("FrontSide"), fieldref(back))
// Read through https://api.github.com/repos/ankitects/anki/contents/rslib/src/notetype/stock.rs?ref=25.09.2
// with Accept: application/vnd.github.raw (sha256 1903e133...140fb, markup preserved).
const hr = (inner: string) => `{{FrontSide}}\n\n<hr id=answer>\n\n{{${inner}}}`
const basicStock: FxModel = {
  id: 5,
  name: 'Basic-a1b2c',
  flds: ['Front', 'Back'],
  tmpls: [{ qfmt: '{{Front}}', afmt: hr('Back') }],
}
const reversedStock: FxModel = {
  id: 6,
  name: 'Basic (and reversed card)-a1b2c',
  flds: ['Front', 'Back'],
  tmpls: [
    { qfmt: '{{Front}}', afmt: hr('Back') },
    { qfmt: '{{Back}}', afmt: hr('Front') },
  ],
}
const optionalStock: FxModel = {
  id: 7,
  name: 'Basic (optional reversed card)-a1b2c',
  flds: ['Front', 'Back', 'Add Reverse'],
  tmpls: [
    { qfmt: '{{Front}}', afmt: hr('Back') },
    { qfmt: '{{#Add Reverse}}{{Back}}{{/Add Reverse}}', afmt: hr('Front') },
  ],
}
const contents = (cards: { content: unknown }[]) => cards.map((c) => c.content)

describe('stock templates under a renamed notetype', () => {
  it('Basic copy: back is the rest, front is not duplicated', async () => {
    const { deck } = await parse({
      models: [basicStock],
      notes: [{ id: 1, mid: 5, flds: ['capital of France', 'Paris'] }],
      cards: [{ nid: 1, ord: 0 }],
    })
    expect(deck.skippedModels).toEqual([])
    expect(contents(deck.cards)).toEqual([{ basic: { front: 'capital of France', back: 'Paris' } }])
  })

  it('Basic (and reversed card) copy: both existing card rows map', async () => {
    const { deck } = await parse({
      models: [reversedStock],
      notes: [{ id: 1, mid: 6, flds: ['hola', 'hello'] }],
      cards: [
        { nid: 1, ord: 0 },
        { nid: 1, ord: 1 },
      ],
    })
    expect(contents(deck.cards)).toEqual([
      { basic: { front: 'hola', back: 'hello' } },
      { basic: { front: 'hello', back: 'hola' } },
    ])
  })

  it('optional reversed copy: card 2 only when its cards row exists', async () => {
    const withRev = await parse({
      models: [optionalStock],
      notes: [
        { id: 1, mid: 7, flds: ['a', 'b', 'y'] },
        { id: 2, mid: 7, flds: ['c', 'd', ''] },
      ],
      cards: [
        { nid: 1, ord: 0 },
        { nid: 1, ord: 1 },
        { nid: 2, ord: 0 },
      ],
    })
    expect(contents(withRev.deck.cards)).toEqual([
      { basic: { front: 'a', back: 'b' } },
      { basic: { front: 'b', back: 'a' } },
      { basic: { front: 'c', back: 'd' } },
    ])
    // A note whose reverse is on but with no ord-1 row yields only card 1 (no invented card).
    const noRow = await parse({
      models: [optionalStock],
      notes: [{ id: 1, mid: 7, flds: ['a', 'b', 'y'] }],
      cards: [{ nid: 1, ord: 0 }],
    })
    expect(contents(noRow.deck.cards)).toEqual([{ basic: { front: 'a', back: 'b' } }])
  })

  it('a template whose card-2 question is empty is refused, not mapped', async () => {
    const { deck, diagnostics } = await parse({
      models: [optionalStock],
      notes: [{ id: 1, mid: 7, flds: ['a', 'b', ''] }],
      cards: [
        { nid: 1, ord: 0 },
        { nid: 1, ord: 1 },
      ],
    })
    expect(deck.skippedModels).toEqual([optionalStock.name])
    expect(diagnostics[0]).toMatchObject({ code: 'empty-question' })
  })

  it('name-matched Basic keeps its legacy mapping (raw front/back, no divider logic)', async () => {
    const { deck } = await parse({
      models: [{ ...basicStock, name: 'Basic' }],
      notes: [{ id: 1, mid: 5, flds: ['q', 'a'] }],
      cards: [{ nid: 1, ord: 0 }],
    })
    expect(contents(deck.cards)).toEqual([{ basic: { front: 'q', back: 'a' } }])
  })
})

describe('divider token outside the stock prefix', () => {
  it('becomes one newline and keeps FrontSide and all answer text', async () => {
    const m: FxModel = {
      id: 8,
      name: 'Custom',
      flds: ['Front', 'Back'],
      tmpls: [{ qfmt: '{{Front}}', afmt: 'Note: {{Back}}<hr id=answer>again {{FrontSide}}' }],
    }
    const { deck } = await parse({
      models: [m],
      notes: [{ id: 1, mid: 8, flds: ['q', 'a'] }],
      cards: [{ nid: 1, ord: 0 }],
    })
    expect(contents(deck.cards)).toEqual([{ basic: { front: 'q', back: 'Note: a\nagain q' } }])
  })

  it('prefix with FrontSide first but no whitespace after the token is the newline form', () => {
    expect(normalizeAnswerSource('{{FrontSide}}\n<hr id=answer>{{Back}}')).toBe(
      '{{FrontSide}}\n\n{{Back}}',
    )
  })

  it('exact stock prefix is dropped whole, any amount of whitespace', () => {
    expect(normalizeAnswerSource('{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}')).toBe('{{Back}}')
    expect(normalizeAnswerSource('{{FrontSide}} \t<hr id=answer> {{Back}}')).toBe('{{Back}}')
  })

  it('returns text without the token untouched', () => {
    expect(normalizeAnswerSource('{{FrontSide}} - {{Back}}')).toBe('{{FrontSide}} - {{Back}}')
  })
})

describe('negatives: anything but the exact token stays refused', () => {
  const code = async (afmt: string, qfmt = '{{Front}}', back = 'a') => {
    const { deck, diagnostics } = await parse({
      models: [{ id: 9, name: 'Neg', flds: ['Front', 'Back'], tmpls: [{ qfmt, afmt }] }],
      notes: [{ id: 1, mid: 9, flds: ['q', back] }],
      cards: [{ nid: 1, ord: 0 }],
    })
    return {
      cards: deck.cards.length,
      skipped: deck.skippedModels,
      codes: diagnostics.map((d) => d.code),
    }
  }
  const refused = { cards: 0, skipped: ['Neg'], codes: ['html-or-media'] }

  it.each([
    ['quoted id', '{{FrontSide}}\n\n<hr id="answer">\n\n{{Back}}'],
    ['single-quoted id', "{{FrontSide}}\n\n<hr id='answer'>\n\n{{Back}}"],
    ['uppercase tag', '{{FrontSide}}\n\n<HR id=answer>\n\n{{Back}}'],
    ['uppercase attribute', '{{FrontSide}}\n\n<hr ID=answer>\n\n{{Back}}'],
    ['self-closing', '{{FrontSide}}\n\n<hr id=answer/>\n\n{{Back}}'],
    ['self-closing with space', '{{FrontSide}}\n\n<hr id=answer />\n\n{{Back}}'],
    ['extra attribute', '{{FrontSide}}\n\n<hr id=answer class=x>\n\n{{Back}}'],
    ['different id', '{{FrontSide}}\n\n<hr id=answer2>\n\n{{Back}}'],
    ['bare hr', '{{FrontSide}}\n\n<hr>\n\n{{Back}}'],
    ['br next to a valid token', '{{FrontSide}}<br><hr id=answer>{{Back}}'],
    ['two tokens', '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}<hr id=answer>'],
    ['token twice, no prefix', 'a<hr id=answer>{{Back}}<hr id=answer>'],
  ])('%s', async (_n, afmt) => {
    expect(await code(afmt)).toEqual(refused)
  })

  it('token in the question template', async () => {
    expect(await code('{{Back}}', '{{Front}}<hr id=answer>')).toEqual(refused)
  })

  it('token inside a field value', async () => {
    expect(
      await code('{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}', '{{Front}}', 'a<hr id=answer>'),
    ).toEqual(refused)
  })

  it('token with a type: filter is still refused as a filter', async () => {
    expect(await code('{{FrontSide}}\n\n<hr id=answer>\n\n{{type:Back}}')).toEqual({
      cards: 0,
      skipped: ['Neg'],
      codes: ['filter'],
    })
  })
})
