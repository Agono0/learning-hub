/**
 * Anki import/export tests (deck import/export feature):
 * - parseAnkiTxt: Anki plain-text export (headers, TSV rows, cloze syntax)
 * - formatAnkiTxt ↔ parseAnkiTxt lossless round-trip (basic + cloze)
 * - parseApkg against a SYNTHETIC .apkg built in-test (fflate zip + better-sqlite3
 *   legacy collection) — no fixture file needed. Tests use the Node DEFAULT
 *   opener (better-sqlite3 loads lazily at call time) plus a custom in-memory
 *   SqliteOpener covering the browser path — see also anki-portable.test.ts.
 */
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { zipSync, unzipSync, strFromU8 } from 'fflate'
import { parseAnkiTxt, parseApkg, type SqliteOpener } from '../src/anki'
import {
  formatAnkiTxt,
  exportDeckToJSON,
  parseHubDeckJson,
  type DeckExportCard,
  type DeckExportInput,
} from '../src/anki-export'
import { validateCardContent } from '../src/cards'
import type { CardContent } from '../src/types'

/** Re-parse an exported deck through the ParsedCard → export-card mapping the API route uses. */
function parsedToExport(deck: ReturnType<typeof parseAnkiTxt>): DeckExportInput {
  return {
    name: deck.name,
    cards: deck.cards.map((c) => ({ type: c.format, content: c.content, tags: c.tags })),
  }
}

describe('parseAnkiTxt', () => {
  it('parses simple front<TAB>back lines', () => {
    const deck = parseAnkiTxt('What is 2+2?\tFour\nCapital of France?\tParis')
    expect(deck.name).toBe('Default')
    expect(deck.cards).toHaveLength(2)
    expect(deck.cards[0]).toMatchObject({
      format: 'basic',
      content: { basic: { front: 'What is 2+2?', back: 'Four' } },
      tags: [],
    })
    expect(deck.skippedModels).toEqual([])
  })

  it('reads #separator/#html/#deck header lines', () => {
    const text = [
      '#separator:Comma',
      '#html:false',
      '#deck:Geography',
      'Capital of Italy,Rome',
    ].join('\n')
    const deck = parseAnkiTxt(text)
    expect(deck.name).toBe('Geography')
    expect(deck.cards[0]?.content).toEqual({ basic: { front: 'Capital of Italy', back: 'Rome' } })
  })

  it('converts Anki cloze syntax {{c1::answer}} (and ::hint) into our cloze content', () => {
    const text = 'The capital of {{c1::France}} is {{c2::Paris::city}}.'
    const deck = parseAnkiTxt(text)
    expect(deck.cards).toHaveLength(1)
    const card = deck.cards[0]!
    expect(card.format).toBe('cloze')
    const cloze = card.content.cloze!
    expect(cloze.text).toBe('The capital of {{c1::France}} is {{c2::Paris::city}}.')
    expect(cloze.answers).toEqual(['France', 'Paris'])
    expect(cloze.hint).toBe('city')
    expect(cloze.mode).toBe('enumeration') // ≥2 blanks per parseCloze
  })

  it('reads the tags column declared by #tags column and keeps it out of the fields', () => {
    const text = [
      '#separator:tab',
      '#html:true',
      '#deck:T',
      '#tags column:3',
      'Front A\tBack A\tgeo europe',
      'Front B\tBack B\t',
    ].join('\n')
    const deck = parseAnkiTxt(text)
    expect(deck.cards[0]?.tags).toEqual(['geo', 'europe'])
    expect(deck.cards[0]?.content).toEqual({ basic: { front: 'Front A', back: 'Back A' } })
    expect(deck.cards[1]?.tags).toEqual([])
    expect(deck.cards[1]?.content).toEqual({ basic: { front: 'Front B', back: 'Back B' } })
  })

  it('unquotes fields with embedded tabs, newlines and escaped quotes', () => {
    const deck = parseAnkiTxt('Front\t"line1\nline2"\nQ\t"Saying ""hi"""')
    expect(deck.cards[0]?.content).toEqual({ basic: { front: 'Front', back: 'line1\nline2' } })
    expect(deck.cards[1]?.content).toEqual({ basic: { front: 'Q', back: 'Saying "hi"' } })
  })

  it('produces content that passes validateCardContent for every parsed card', () => {
    const text = [
      '#separator:tab',
      '#deck:Mixed',
      'Plain front\tPlain back',
      'Memory {{c1::works}} by {{c2::retrieval}}',
    ].join('\n')
    for (const card of parseAnkiTxt(text).cards) {
      const validated = validateCardContent(card.format, card.content)
      expect(validated.ok).toBe(true)
    }
  })

  it('returns an empty deck for empty input', () => {
    expect(parseAnkiTxt('')).toEqual({ name: 'Default', cards: [], skippedModels: [] })
    expect(parseAnkiTxt('   \n')).toEqual({ name: 'Default', cards: [], skippedModels: [] })
  })
})

describe('formatAnkiTxt', () => {
  it('emits Anki header lines and tab-separated basic rows', () => {
    const txt = formatAnkiTxt({
      name: 'My Deck',
      cards: [{ type: 'basic', content: { basic: { front: 'Q', back: 'A' } } }],
    })
    expect(txt.split('\n')).toEqual(['#separator:tab', '#html:true', '#deck:My Deck', 'Q\tA'])
  })

  it('emits cloze cards as single-column lines with the {{cN::…}} markers intact', () => {
    const txt = formatAnkiTxt({
      name: 'D',
      cards: [
        {
          type: 'cloze',
          content: { cloze: { text: 'The {{c1::sun}} is hot.', answers: ['sun'], mode: 'basic' } },
        },
      ],
    })
    expect(txt.split('\n')).toEqual([
      '#separator:tab',
      '#html:true',
      '#deck:D',
      'The {{c1::sun}} is hot.',
    ])
  })

  it('quotes fields containing separators, quotes or newlines', () => {
    const txt = formatAnkiTxt({
      name: 'D',
      cards: [{ type: 'basic', content: { basic: { front: 'Q', back: 'a\tb "c" d\ne' } } }],
    })
    // the embedded newline means the ROW spans two output lines — rejoin before comparing
    expect(txt.split('\n').slice(3).join('\n')).toBe('Q\t"a\tb ""c"" d\ne"')
  })
})

describe('formatAnkiTxt ↔ parseAnkiTxt round-trip (lossless for basic + cloze)', () => {
  const deck: DeckExportInput = {
    name: 'Round Trip Deck',
    cards: [
      {
        type: 'basic',
        content: { basic: { front: 'What is FSRS?', back: 'A spaced-repetition scheduler' } },
      },
      {
        type: 'basic',
        content: { basic: { front: 'Quotes test', back: 'He said "hi"\tthere\nfriend' } },
        tags: ['hard', 'review'],
      },
      {
        type: 'cloze',
        content: {
          cloze: {
            text: 'The capital of {{c1::France}} is {{c2::Paris}}.',
            answers: ['France', 'Paris'],
            mode: 'enumeration',
          },
        },
      },
      {
        type: 'cloze',
        content: {
          cloze: {
            text: 'FSRS stands for {{c1::Free Spaced Repetition Scheduler::expansion}}.',
            answers: ['Free Spaced Repetition Scheduler'],
            mode: 'basic',
            hint: 'expansion',
          },
        },
        tags: ['meta'],
      },
    ],
  }

  it('preserves all cards and their content through parse → format → parse', () => {
    const txt = formatAnkiTxt(deck)
    const first = parseAnkiTxt(txt)
    expect(first.name).toBe(deck.name)
    expect(first.skippedModels).toEqual([])

    const second = parseAnkiTxt(formatAnkiTxt(parsedToExport(first)))
    // second parse of re-formatted output must equal the first parse
    expect(second).toEqual(first)
  })

  it('is byte-exact: formatAnkiTxt(parseAnkiTxt(formatAnkiTxt(deck))) === formatAnkiTxt(deck)', () => {
    const txt = formatAnkiTxt(deck)
    expect(formatAnkiTxt(parsedToExport(parseAnkiTxt(txt)))).toBe(txt)
  })

  it('preserves tags, answers, hints and text fields exactly', () => {
    const parsed = parseAnkiTxt(formatAnkiTxt(deck))
    expect(parsed.cards.map((c) => c.tags)).toEqual([[], ['hard', 'review'], [], ['meta']])
    const multiBlank = parsed.cards[2]!.content.cloze!
    expect(multiBlank.text).toBe(deck.cards[2]!.content.cloze!.text)
    expect(multiBlank.answers).toEqual(['France', 'Paris'])
    const hinted = parsed.cards[3]!.content.cloze!
    expect(hinted.answers).toEqual(['Free Spaced Repetition Scheduler'])
    expect(hinted.hint).toBe('expansion')
  })

  it('keeps every round-tripped card valid per validateCardContent', () => {
    const parsed = parseAnkiTxt(formatAnkiTxt(parsedToExport(parseAnkiTxt(formatAnkiTxt(deck)))))
    for (const card of parsed.cards) {
      expect(validateCardContent(card.format, card.content).ok).toBe(true)
    }
  })
})

describe('JSON deck export', () => {
  it('round-trips all card formats through exportDeckToJSON / parseHubDeckJson', () => {
    const deck: DeckExportInput = {
      name: 'JSON Deck',
      cards: [
        { type: 'basic', content: { basic: { front: 'Q', back: 'A' } }, tags: ['t1'] },
        { type: 'cloze', content: { cloze: { text: '{{c1::X}}', answers: ['X'], mode: 'basic' } } },
        { type: 'mcq', content: { mcq: { question: 'Q?', options: ['a', 'b'], correctIndex: 1 } } },
      ],
    }
    const json = JSON.stringify(exportDeckToJSON(deck))
    const parsed = parseHubDeckJson(json)
    expect(parsed.name).toBe('JSON Deck')
    expect(parsed.cards).toEqual(deck.cards.map((c) => ({ ...c, tags: c.tags ?? [] })))
    expect(parsed.invalidCardIndices).toEqual([])
  })

  it('rejects envelopes that are not a hub deck and reports invalid card contents', () => {
    expect(() => parseHubDeckJson('{"kind":"other"}')).toThrow(/schema mismatch/)
    expect(() => parseHubDeckJson('not json')).toThrow(/not valid JSON/)
    const parsed = parseHubDeckJson(
      JSON.stringify({
        kind: 'learning-hub-deck',
        version: 1,
        name: 'D',
        cards: [{ type: 'basic', content: { basic: { front: 'only front' } } }],
      }),
    )
    expect(parsed.invalidCardIndices).toEqual([1])
    expect(parsed.cards).toHaveLength(0)
  })
})

// ─── parseApkg (synthetic .apkg fixture, built in-test) ─────────────────────

const LEGACY_DDL = `
CREATE TABLE col (id INTEGER PRIMARY KEY, crt INTEGER NOT NULL, mod INTEGER NOT NULL, scm INTEGER NOT NULL, ver INTEGER NOT NULL, dty INTEGER NOT NULL, usn INTEGER NOT NULL, ls INTEGER NOT NULL, conf TEXT NOT NULL, models TEXT NOT NULL, decks TEXT NOT NULL, dconf TEXT NOT NULL, tags TEXT NOT NULL);
CREATE TABLE notes (id INTEGER PRIMARY KEY, guid TEXT NOT NULL, mid INTEGER NOT NULL, mod INTEGER NOT NULL, usn INTEGER NOT NULL, tags TEXT NOT NULL, dgus TEXT NOT NULL, flds TEXT NOT NULL, sfld TEXT NOT NULL, csum INTEGER NOT NULL, flags INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER NOT NULL, did INTEGER NOT NULL, ord INTEGER NOT NULL, mod INTEGER NOT NULL, usn INTEGER NOT NULL, type INTEGER NOT NULL, queue INTEGER NOT NULL, due INTEGER NOT NULL, ivl INTEGER NOT NULL, factor INTEGER NOT NULL, reps INTEGER NOT NULL, lapses INTEGER NOT NULL, left INTEGER NOT NULL, odue INTEGER NOT NULL, odid INTEGER NOT NULL, flags INTEGER NOT NULL, data TEXT NOT NULL);
`

const MODELS = {
  basic: {
    id: 1,
    name: 'Basic',
    type: 0,
    flds: [{ name: 'Front' }, { name: 'Back' }],
    tmpls: [{ name: 'Card 1' }],
  },
  reversed: {
    id: 2,
    name: 'Basic (and reversed card)',
    type: 0,
    flds: [{ name: 'Front' }, { name: 'Back' }],
    tmpls: [{ name: 'Card 1' }, { name: 'Card 2' }],
  },
  cloze: {
    id: 3,
    name: 'Cloze',
    type: 1,
    flds: [{ name: 'Text' }, { name: 'Back Extra' }],
    tmpls: [{ name: 'Cloze' }],
  },
  unknown: {
    id: 4,
    name: 'IQ Test',
    type: 0,
    flds: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    tmpls: [{ name: 'Card 1' }],
  },
}

const DECKS = {
  1: { id: 1, name: 'Imported::Sub Deck' },
  2: { id: 2, name: 'Other' },
}

/** Build a legacy Anki collection SQLite image and wrap it in a .apkg ZIP. */
function buildApkg(
  options: {
    decks?: typeof DECKS
    collectionName?: string
    /** put note 4's card into deck 2, making the collection span two decks */
    spreadDecks?: boolean
  } = {},
): Uint8Array {
  const db = new Database(':memory:')
  db.exec(LEGACY_DDL)
  db.prepare(
    'INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags) VALUES (1, 0, 0, 0, 11, 0, 0, 0, ?, ?, ?, ?, ?)',
  ).run(
    '{}', // conf
    JSON.stringify({
      [MODELS.basic.id]: MODELS.basic, // col.models maps model id → notetype JSON
      [MODELS.reversed.id]: MODELS.reversed,
      [MODELS.cloze.id]: MODELS.cloze,
      [MODELS.unknown.id]: MODELS.unknown,
    }),
    JSON.stringify(options.decks ?? DECKS), // col.decks
    JSON.stringify({}), // dconf
    JSON.stringify({}), // tags
  )

  const insertNote = db.prepare(
    // usn/dgus/csum/flags/data are literals — bind id, guid, mid, mod, tags, flds, sfld
    "INSERT INTO notes (id, guid, mid, mod, usn, tags, dgus, flds, sfld, csum, flags, data) VALUES (?, ?, ?, ?, 0, ?, '', ?, ?, 0, 0, '')",
  )
  insertNote.run(1, 'g1', MODELS.basic.id, 0, ' geo ', 'Front 1\x1fBack 1', 'Front 1')
  insertNote.run(2, 'g2', MODELS.reversed.id, 0, '', 'Front 2\x1fBack 2', 'Front 2')
  insertNote.run(
    3,
    'g3',
    MODELS.cloze.id,
    0,
    '',
    'The capital of {{c1::France}} is {{c2::Paris}}.\x1fextra',
    'The capital…',
  )
  insertNote.run(4, 'g4', MODELS.unknown.id, 0, '', 'A\x1fB\x1fC', 'A')

  const insertCard = db.prepare(
    "INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data) VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '')",
  )
  const lastDid = options.spreadDecks ? 2 : 1
  for (const [id, nid, did] of [
    [1, 1, 1],
    [2, 2, 1],
    [3, 3, 1],
    [4, 4, lastDid],
  ] as const) {
    insertCard.run(id, nid, did)
  }

  const serialized = Buffer.from(db.serialize())
  db.close()
  const name = options.collectionName ?? 'collection.anki2'
  return zipSync({ [name]: serialized, media: Buffer.from('{}') })
}

describe('parseApkg', () => {
  it('maps Basic / Basic (and reversed card) / Cloze models and reports skipped ones', async () => {
    const deck = await parseApkg(buildApkg())
    expect(deck.name).toBe('Imported::Sub Deck')
    expect(deck.skippedModels).toEqual(['IQ Test'])

    const formats = deck.cards.map((c) => c.format)
    expect(formats).toEqual(['basic', 'basic', 'basic', 'cloze']) // reversed → fwd + rev, unknown note skipped
    expect(deck.cards[0]).toMatchObject({
      format: 'basic',
      content: { basic: { front: 'Front 1', back: 'Back 1' } },
      tags: ['geo'],
    })
    expect(deck.cards[1]?.content).toEqual({ basic: { front: 'Front 2', back: 'Back 2' } })
    expect(deck.cards[2]?.content).toEqual({ basic: { front: 'Back 2', back: 'Front 2' } })
    const cloze = deck.cards[3]!.content.cloze!
    expect(cloze.text).toBe('The capital of {{c1::France}} is {{c2::Paris}}.')
    expect(cloze.answers).toEqual(['France', 'Paris'])
  })

  it('falls back to the common :: parent when a collection spans several subdecks', async () => {
    const deck2 = await parseApkg(
      buildApkg({
        spreadDecks: true,
        decks: { 1: { id: 1, name: 'Parent::A' }, 2: { id: 2, name: 'Parent::B' } },
      }),
    )
    expect(deck2.name).toBe('Parent')
  })

  it('validates every mapped card and round-trips through formatAnkiTxt', async () => {
    const deck = await parseApkg(buildApkg())
    for (const card of deck.cards) {
      expect(validateCardContent(card.format, card.content).ok).toBe(true)
    }
    const txt = formatAnkiTxt({
      name: deck.name,
      cards: deck.cards.map((c) => ({ type: c.format, content: c.content, tags: c.tags })),
    })
    expect(parseAnkiTxt(txt).cards).toHaveLength(deck.cards.length)
  })

  it('reads collection.anki21 when the legacy anki2 entry is absent', async () => {
    const bytes = buildApkg({ collectionName: 'collection.anki21' })
    expect((await parseApkg(bytes)).cards).toHaveLength(4)
  })

  it('throws a helpful error for a ZIP without a legacy collection', async () => {
    const bytes = zipSync({ 'collection.anki21b': Buffer.from('zstd-bytes') })
    await expect(parseApkg(bytes)).rejects.toThrow(/collection\.anki21b|no legacy collection/)
  })

  it('throws on input that is not a ZIP at all', async () => {
    await expect(parseApkg(Buffer.from('definitely not a zip'))).rejects.toThrow()
  })

  it('the synthetic fixture really is a zip containing a SQLite collection', () => {
    const files = unzipSync(buildApkg())
    expect(Object.keys(files)).toContain('collection.anki2')
    expect(strFromU8(files['collection.anki2']!.slice(0, 15))).toContain('SQLite format 3')
  })

  it('accepts a custom in-memory SqliteOpener — no better-sqlite3 involved (browser path)', async () => {
    let closed = 0
    const opener: SqliteOpener = () => ({
      prepare(sql: string) {
        if (sql.includes('FROM col')) {
          return {
            get: () => ({
              models: JSON.stringify({ 7: { id: 7, name: 'Basic', type: 0 } }),
              decks: JSON.stringify({ 3: { id: 3, name: 'In-Memory Deck' } }),
            }),
            all: () => [],
          }
        }
        if (sql.includes('FROM notes')) {
          return {
            get: () => undefined,
            all: () => [{ mid: 7, tags: 'a b', flds: 'Hello\x1fWorld' }],
          }
        }
        if (sql.includes('FROM cards')) {
          return { get: () => undefined, all: () => [{ did: 3 }] }
        }
        throw new Error(`unexpected statement: ${sql}`)
      },
      close() {
        closed++
      },
    })

    // the entry bytes are never decoded — the fake opener is the database
    const zip = zipSync({ 'collection.anki2': new Uint8Array([1, 2, 3]) })
    const deck = await parseApkg(zip, { openDatabase: opener })

    expect(closed).toBe(1) // handle is closed exactly once
    expect(deck.name).toBe('In-Memory Deck')
    expect(deck.skippedModels).toEqual([])
    expect(deck.cards).toEqual([
      { format: 'basic', content: { basic: { front: 'Hello', back: 'World' } }, tags: ['a', 'b'] },
    ])
  })
})
