/**
 * parseApkg and the package `meta` entry. Everything here is SYNTHETIC: tiny SQLite images and
 * ZIPs built in-test with neutral placeholder text. No Anki-authored file is committed; the
 * separately run real-export checks are described in fixtures/anki-meta/README.md.
 */
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { zipSync } from 'fflate'
import { parseApkg } from '../src/anki'

const DDL = `
CREATE TABLE col (id INTEGER PRIMARY KEY, crt INTEGER NOT NULL, mod INTEGER NOT NULL, scm INTEGER NOT NULL, ver INTEGER NOT NULL, dty INTEGER NOT NULL, usn INTEGER NOT NULL, ls INTEGER NOT NULL, conf TEXT NOT NULL, models TEXT NOT NULL, decks TEXT NOT NULL, dconf TEXT NOT NULL, tags TEXT NOT NULL);
CREATE TABLE notes (id INTEGER PRIMARY KEY, guid TEXT NOT NULL, mid INTEGER NOT NULL, mod INTEGER NOT NULL, usn INTEGER NOT NULL, tags TEXT NOT NULL, dgus TEXT NOT NULL, flds TEXT NOT NULL, sfld TEXT NOT NULL, csum INTEGER NOT NULL, flags INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER NOT NULL, did INTEGER NOT NULL, ord INTEGER NOT NULL, mod INTEGER NOT NULL, usn INTEGER NOT NULL, type INTEGER NOT NULL, queue INTEGER NOT NULL, due INTEGER NOT NULL, ivl INTEGER NOT NULL, factor INTEGER NOT NULL, reps INTEGER NOT NULL, lapses INTEGER NOT NULL, left INTEGER NOT NULL, odue INTEGER NOT NULL, odid INTEGER NOT NULL, flags INTEGER NOT NULL, data TEXT NOT NULL);
`
const MODELS = {
  1: {
    id: 1,
    name: 'Basic',
    type: 0,
    flds: [{ name: 'Front' }, { name: 'Back' }],
    tmpls: [{ name: 'Card 1' }],
  },
  2: {
    id: 2,
    name: 'Cloze',
    type: 1,
    flds: [{ name: 'Text' }, { name: 'Back Extra' }],
    tmpls: [{ name: 'Cloze' }],
  },
}

/** A legacy collection image holding the given [modelId, fields] notes, one card each. */
function collection(notes: [number, string][]): Uint8Array {
  const db = new Database(':memory:')
  db.exec(DDL)
  db.prepare(
    'INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags) VALUES (1, 0, 0, 0, 11, 0, 0, 0, ?, ?, ?, ?, ?)',
  ).run(
    '{}',
    JSON.stringify(MODELS),
    JSON.stringify({ 1: { id: 1, name: 'Synthetic deck' } }),
    '{}',
    '{}',
  )
  const n = db.prepare(
    "INSERT INTO notes (id, guid, mid, mod, usn, tags, dgus, flds, sfld, csum, flags, data) VALUES (?, ?, ?, 0, 0, '', '', ?, '', 0, 0, '')",
  )
  const c = db.prepare(
    "INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data) VALUES (?, ?, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '')",
  )
  notes.forEach(([mid, flds], k) => {
    n.run(k + 1, `g${k}`, mid, flds)
    c.run(k + 1, k + 1)
  })
  const out = Buffer.from(db.serialize())
  db.close()
  return out
}

const REAL = collection([
  [1, 'Real front A\x1fReal back A'],
  [1, 'Real front B\x1fReal back B'],
  [2, 'Real {{c1::cloze}} text\x1f'],
])
const STUB = collection([[1, 'Placeholder stub front\x1fPlaceholder stub back']])
const fronts = (d: Awaited<ReturnType<typeof parseApkg>>): (string | undefined)[] =>
  d.cards.map((x) => x.content.basic?.front ?? x.content.cloze?.text)

const pkg = (meta: Uint8Array | undefined, entries: Record<string, Uint8Array>): Uint8Array =>
  zipSync(meta ? { meta, ...entries, media: new Uint8Array([123, 125]) } : entries)
const v = (n: number): Uint8Array => new Uint8Array([0x08, n])

/** Opener that records what it was asked to open and fails the test path if reached. */
const spy = (seen: Uint8Array[]) => ({
  openDatabase: ((b: Uint8Array) => {
    seen.push(b)
    throw new Error('opener reached')
  }) as never,
  trustCustomOpener: true,
})

describe('parseApkg meta selection (synthetic archives)', () => {
  it('meta 2: reads collection.anki21 and ignores the stub collection.anki2', async () => {
    const d = await parseApkg(pkg(v(2), { 'collection.anki21': REAL, 'collection.anki2': STUB }))
    expect(fronts(d)).toEqual(['Real front A', 'Real front B', 'Real {{c1::cloze}} text'])
    expect(d.cards.map((c) => c.format)).toEqual(['basic', 'basic', 'cloze'])
  })

  it('meta 1: reads collection.anki2 only, even when a collection.anki21 is present', async () => {
    const d = await parseApkg(pkg(v(1), { 'collection.anki2': REAL, 'collection.anki21': STUB }))
    expect(d.cards).toHaveLength(3)
  })

  it('meta 3: refuses with re-export advice before any collection is read, stub never imported', async () => {
    const seen: Uint8Array[] = []
    const z = pkg(v(3), {
      'collection.anki21b': new Uint8Array([1, 2, 3]),
      'collection.anki2': STUB,
    })
    await expect(parseApkg(z, spy(seen))).rejects.toThrow(/support older Anki versions/)
    await expect(parseApkg(z)).rejects.toThrow(/anki21b/)
    expect(seen).toHaveLength(0)
  })

  it('refuses when the declared collection is missing and never falls back to the other entry', async () => {
    const seen: Uint8Array[] = []
    await expect(parseApkg(pkg(v(2), { 'collection.anki2': STUB }), spy(seen))).rejects.toThrow(
      /version 2 but collection\.anki21 is missing/,
    )
    await expect(parseApkg(pkg(v(1), { 'collection.anki21': REAL }), spy(seen))).rejects.toThrow(
      /version 1 but collection\.anki2 is missing/,
    )
    expect(seen).toHaveLength(0)
  })

  it('without meta the previous behaviour is unchanged', async () => {
    const seen: Uint8Array[] = []
    await expect(
      parseApkg(pkg(undefined, { 'collection.anki2': STUB, 'collection.anki21': REAL }), spy(seen)),
    ).rejects.toThrow(/both collection\.anki2 and collection\.anki21 .* ambiguous/)
    expect(seen).toHaveLength(0)
    expect((await parseApkg(pkg(undefined, { 'collection.anki2': REAL }))).cards).toHaveLength(3)
    expect((await parseApkg(pkg(undefined, { 'collection.anki21': REAL }))).cards).toHaveLength(3)
    await expect(parseApkg(pkg(undefined, { 'collection.anki21b': STUB }))).rejects.toThrow(
      /no legacy collection/,
    )
  })
})

describe('parseApkg meta protobuf decoding (byte-level)', () => {
  const run = (meta: Uint8Array) =>
    parseApkg(pkg(meta, { 'collection.anki21': REAL, 'collection.anki2': STUB }))
  const ok = async (meta: number[]) =>
    expect((await run(new Uint8Array(meta))).cards).toHaveLength(3)
  const bad = (meta: number[], re: RegExp) => expect(run(new Uint8Array(meta))).rejects.toThrow(re)

  it('skips unknown fields of every legal wire type, before and after the version', async () => {
    await ok([0x10, 0x96, 0x01, 0x08, 0x02]) // field 2 varint (multi-byte), then version
    await ok([0x08, 0x02, 0x1a, 0x03, 0x61, 0x62, 0x63]) // field 3 length-delimited
    await ok([0x08, 0x02, 0x21, 1, 2, 3, 4, 5, 6, 7, 8]) // field 4 fixed64
    await ok([0x2d, 1, 2, 3, 4, 0x08, 0x02]) // field 5 fixed32
    await ok([0xf8, 0x07, 0x00, 0x08, 0x02]) // field 127 varint
  })

  it('accepts a version encoded as a padded multi-byte varint', async () => {
    await ok([0x08, 0x82, 0x00])
  })

  it('repeated version: the last value wins', async () => {
    await ok([0x08, 0x03, 0x08, 0x02])
    await bad([0x08, 0x02, 0x08, 0x03], /support older Anki versions/)
  })

  it('refuses a missing, zero or out-of-range version', async () => {
    await bad([], /no package version/)
    await bad([0x10, 0x05], /no package version/)
    await bad([0x08, 0x00], /unknown package version 0/)
    await bad([0x08, 0x04], /unknown package version 4/)
    await bad(
      [0x08, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01],
      /unknown package version/,
    )
  })

  it('refuses truncated and overrunning fields as malformed', async () => {
    await bad([0x08], /malformed meta/) // tag without value
    await bad([0x08, 0x80], /malformed meta/) // varint cut off
    await bad([0x08, 0x02, 0x1a, 0x05, 0x61], /malformed meta/) // length 5, 1 byte left
    await bad([0x08, 0x02, 0x1a], /malformed meta/) // length missing
    await bad([0x08, 0x02, 0x21, 1, 2, 3], /malformed meta/) // fixed64 cut
    await bad([0x08, 0x02, 0x2d, 1], /malformed meta/) // fixed32 cut
    await bad([0x08, 0x02, 0x1a, 0xff, 0xff, 0xff, 0xff, 0x0f], /malformed meta/) // huge length
    await bad([0x08, ...new Array(10).fill(0x80), 0x01], /malformed meta/) // varint over 10 bytes
  })

  it('refuses groups, reserved wire types, field 0 and a mistyped version', async () => {
    await bad([0x08, 0x02, 0x13, 0x14], /malformed meta/) // start/end group
    await bad([0x08, 0x02, 0x16], /malformed meta/) // wire type 6
    await bad([0x08, 0x02, 0x17], /malformed meta/) // wire type 7
    await bad([0x00, 0x01, 0x08, 0x02], /malformed meta/) // field number 0
    await bad([0x0a, 0x01, 0x02], /malformed meta/) // version sent length-delimited
  })

  it('reads meta through a 4 KiB cap enforced before inflating', async () => {
    const padded = new Uint8Array(4096) // a field-2 length-delimited blob filling the cap exactly
    padded.set([0x08, 0x02, 0x1a, 0xfb, 0x1f])
    await ok([...padded])
    const big = new Uint8Array(4097)
    big.set([0x08, 0x02, 0x1a, 0xfc, 0x1f])
    await expect(run(big)).rejects.toThrow(/meta is larger than 4096 bytes/)
  })

  it('refuses an oversize meta from its header, never inflating a corrupt body', async () => {
    const z = pkg(new Uint8Array(5000).fill(0x2a), { 'collection.anki21': REAL })
    // the first central-directory entry is meta: corrupt its CRC; reaching the inflater would
    // report a CRC failure instead of the size refusal
    const dv = new DataView(z.buffer, z.byteOffset, z.byteLength)
    let cen = -1
    for (let i = 0; i < z.length - 4; i++)
      if (dv.getUint32(i, true) === 0x02014b50) {
        cen = i
        break
      }
    dv.setUint32(cen + 16, 0xdeadbeef, true)
    await expect(parseApkg(z)).rejects.toThrow(/meta is larger than 4096 bytes/)
  })

  it('refuses a corrupt meta entry as an invalid package', async () => {
    const z = pkg(v(2), { 'collection.anki21': REAL })
    const dv = new DataView(z.buffer, z.byteOffset, z.byteLength)
    let cen = -1
    for (let i = 0; i < z.length - 4; i++)
      if (dv.getUint32(i, true) === 0x02014b50) {
        cen = i
        break
      }
    dv.setUint32(cen + 16, 0xdeadbeef, true)
    await expect(parseApkg(z)).rejects.toThrow(/invalid \.apkg: .*meta.*CRC/)
  })
})
