import { describe, expect, it } from 'vitest'
import { mapUnmatchedModel } from '../../src/anki-import'
import { model, parse, PLAIN, US } from './fixtures'

describe('unmatched plain-text notetypes map to basic cards by existing ordinals', () => {
  it('renamed Basic-style notetype with plain templates', async () => {
    const { deck, diagnostics } = await parse({
      models: [PLAIN],
      notes: [{ id: 1, mid: 100, flds: ['capital of France', 'Paris'], tags: ' geo easy ' }],
      cards: [{ nid: 1, ord: 0 }],
    })
    expect(deck.skippedModels).toEqual([])
    expect(diagnostics).toEqual([])
    expect(deck.cards).toEqual([
      {
        format: 'basic',
        content: { basic: { front: 'capital of France', back: 'capital of France - Paris' } },
        tags: ['geo', 'easy'],
      },
    ])
    expect(deck.name).toBe('Fixture Deck')
  })

  it('optional-reverse shape: only the card rows that exist produce cards', async () => {
    const m = {
      ...PLAIN,
      tmpls: [
        { qfmt: '{{Front}}', afmt: '{{Back}}' },
        { qfmt: '{{#Add Reverse}}{{Back}}{{/Add Reverse}}', afmt: '{{Front}}' },
      ],
      flds: ['Front', 'Back', 'Add Reverse'],
    }
    const { deck } = await parse({
      models: [m],
      notes: [
        { id: 1, mid: 100, flds: ['a', 'b', ''] },
        { id: 2, mid: 100, flds: ['c', 'd', 'y'] },
      ],
      // note 1 has no reverse card row; note 2 has both
      cards: [
        { nid: 1, ord: 0 },
        { nid: 2, ord: 0 },
        { nid: 2, ord: 1 },
      ],
    })
    expect(deck.cards.map((c) => c.content)).toEqual([
      { basic: { front: 'a', back: 'b' } },
      { basic: { front: 'c', back: 'd' } },
      { basic: { front: 'd', back: 'c' } },
    ])
  })

  it('an ordinal Anki did not generate is not synthesized, even if its template would render', async () => {
    const m = { ...PLAIN, tmpls: [...PLAIN.tmpls, { qfmt: '{{Back}}', afmt: '{{Front}}' }] }
    const { deck } = await parse({
      models: [m],
      notes: [{ id: 1, mid: 100, flds: ['a', 'b'] }],
      cards: [{ nid: 1, ord: 1 }],
    })
    expect(deck.cards.map((c) => c.content)).toEqual([{ basic: { front: 'b', back: 'a' } }])
  })

  it('a three-field notetype uses the template, not field positions', async () => {
    const m = {
      id: 100,
      name: 'Vocab',
      flds: ['Word', 'Meaning', 'Example'],
      tmpls: [{ qfmt: '{{Word}}', afmt: '{{Meaning}}{{#Example}} e.g. {{Example}}{{/Example}}' }],
    }
    const { deck } = await parse({
      models: [m],
      notes: [{ id: 1, mid: 100, flds: ['gato', 'cat', 'el gato duerme'] }],
      cards: [{ nid: 1, ord: 0 }],
    })
    expect(deck.cards.map((c) => c.content)).toEqual([
      { basic: { front: 'gato', back: 'cat e.g. el gato duerme' } },
    ])
  })

  it('Tags and Type special fields render; a note field of the same name wins', () => {
    const m = model({
      id: 1,
      name: 'Meta',
      flds: ['Front', 'Tags'],
      tmpls: [{ qfmt: '{{Front}} {{Type}}', afmt: '{{Tags}}' }],
    })
    const r = mapUnmatchedModel(
      m,
      'Meta',
      [{ id: 1, tags: ['t1', 't2'], flds: `q${US}note field` }],
      new Map([[1, [0]]]),
    )
    expect(r).toMatchObject({ ok: true })
    if (r.ok)
      expect(r.cards[0]!.content).toEqual({ basic: { front: 'q Meta', back: 'note field' } })
    const m2 = model({
      id: 1,
      name: 'Meta',
      flds: ['Front'],
      tmpls: [{ qfmt: '{{Front}}', afmt: '{{Tags}}' }],
    })
    const r2 = mapUnmatchedModel(
      m2,
      'Meta',
      [{ id: 1, tags: ['t1', 't2'], flds: 'q' }],
      new Map([[1, [0]]]),
    )
    if (r2.ok) expect(r2.cards[0]!.content).toEqual({ basic: { front: 'q', back: 't1 t2' } })
  })

  it('empty answer becomes "..." like the legacy mapper', async () => {
    const m = { ...PLAIN, tmpls: [{ qfmt: '{{Front}}', afmt: '{{Back}}' }] }
    const { deck } = await parse({
      models: [m],
      notes: [{ id: 1, mid: 100, flds: ['q', ''] }],
      cards: [{ nid: 1, ord: 0 }],
    })
    expect(deck.cards.map((c) => c.content)).toEqual([{ basic: { front: 'q', back: '...' } }])
  })

  it('a note with no cards rows contributes nothing and is counted (decision pending)', () => {
    const r = mapUnmatchedModel(
      model(PLAIN),
      'P',
      [{ id: 9, tags: [], flds: `a${US}b` }],
      new Map(),
    )
    expect(r).toEqual({ ok: true, cards: [], notesWithoutCards: 1 })
  })

  it('card order follows note order then ascending ord, with duplicate ord rows collapsed', () => {
    const m = model({
      id: 1,
      name: 'Two',
      flds: ['A', 'B'],
      tmpls: [
        { qfmt: '{{A}}', afmt: '{{B}}' },
        { qfmt: '{{B}}', afmt: '{{A}}' },
      ],
    })
    const r = mapUnmatchedModel(
      m,
      'Two',
      [{ id: 1, tags: [], flds: `a${US}b` }],
      new Map([[1, [1, 0, 1]]]),
    )
    if (!r.ok) throw new Error(r.detail)
    expect(r.cards.map((c) => c.content)).toEqual([
      { basic: { front: 'a', back: 'b' } },
      { basic: { front: 'b', back: 'a' } },
    ])
  })

  it('pages more than one page of cards rows without losing ordinals', async () => {
    const n = 2_300
    const notes = Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      mid: 100,
      flds: [`q${i}`, `a${i}`],
    }))
    const cards = notes.map((x) => ({ nid: x.id, ord: 0 }))
    const { deck } = await parse({ models: [PLAIN], notes, cards })
    expect(deck.cards).toHaveLength(n)
    expect((deck.cards[n - 1]!.content as { basic: { front: string } }).basic.front).toBe(
      `q${n - 1}`,
    )
  })
})
