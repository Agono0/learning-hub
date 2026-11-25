import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { zipSync } from 'fflate'
import { APKG_SQLITE_BUDGETS, ApkgBudgetError, parseApkg, type SqliteOpener } from '../src/anki'

// Fixtures are small SQLite images built in-test with better-sqlite3. The legacy Anki schema
// below is written from recollection of the Anki 2.1 collection layout (col/notes/cards plus
// two indexes), NOT copied from a real export; no genuine .apkg exists in this repo.
const SCHEMA = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null,
  scm integer not null, ver integer not null, dty integer not null, usn integer not null,
  ls integer not null, conf text not null, models text not null, decks text not null,
  dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null,
  mod integer not null, usn integer not null, tags text not null, flds text not null,
  sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null,
  ord integer not null, mod integer not null, usn integer not null, type integer not null,
  queue integer not null, due integer not null, ivl integer not null, factor integer not null,
  reps integer not null, lapses integer not null, left integer not null, odue integer not null,
  odid integer not null, flags integer not null, data text not null);
CREATE INDEX ix_notes_usn ON notes (usn);
CREATE INDEX ix_cards_nid ON cards (nid);`

const MODELS = JSON.stringify({ 7: { id: 7, name: 'Basic', type: 0 } })
const DECKS = JSON.stringify({ 3: { id: 3, name: 'Budget Deck' } })

function image(opts: {
  models?: string
  decks?: string
  notes?: { flds: string; tags?: string }[]
  extra?: string
  schema?: string
}): Uint8Array {
  const db = new Database(':memory:')
  db.exec(opts.schema ?? SCHEMA)
  db.prepare(`INSERT INTO col VALUES (1,0,0,0,11,0,0,0,'{}',?,?,'{}','{}')`).run(
    opts.models ?? MODELS,
    opts.decks ?? DECKS,
  )
  const ins = db.prepare(`INSERT INTO notes VALUES (?,?,7,0,0,?,?,0,0,0,'')`)
  const tx = db.transaction(() => {
    ;(opts.notes ?? []).forEach((n, i) => ins.run(i + 1, `g${i}`, n.tags ?? '', n.flds))
  })
  tx()
  db.exec(`INSERT INTO cards VALUES (1,1,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'')`)
  if (opts.extra) db.exec(opts.extra)
  const out = new Uint8Array(db.serialize())
  db.close()
  return out
}

const apkg = (collection: Uint8Array): Uint8Array => zipSync({ 'collection.anki2': collection })

describe('parseApkg over real SQLite images', () => {
  it('parses a small ordinary collection with its indexes', async () => {
    const r = await parseApkg(apkg(image({ notes: [{ flds: 'Q\x1fA', tags: ' a b ' }] })))
    expect(r.name).toBe('Budget Deck')
    expect(r.cards).toHaveLength(1)
  })

  it('pages notes by rowid across several pages without dropping or repeating rows', async () => {
    const n = APKG_SQLITE_BUDGETS.pageSize * 2 + 37
    const notes = Array.from({ length: n }, (_, i) => ({ flds: `q${i}\x1fa${i}` }))
    const r = await parseApkg(apkg(image({ notes })))
    expect(r.cards).toHaveLength(n)
    const fronts = r.cards.map((c) => (c.content as { basic: { front: string } }).basic.front)
    expect(new Set(fronts).size).toBe(n)
    expect(fronts[0]).toBe('q0')
    expect(fronts[n - 1]).toBe(`q${n - 1}`)
  })

  it('refuses a note whose fields exceed the per-note budget (named error, no truncation)', async () => {
    const big = 'x'.repeat(APKG_SQLITE_BUDGETS.maxFieldsChars + 1)
    const p = parseApkg(apkg(image({ notes: [{ flds: big }] })))
    await expect(p).rejects.toThrow(ApkgBudgetError)
    await expect(p).rejects.toThrow(/fields exceed/)
  })

  it('accepts a note exactly at the per-note budget', async () => {
    const edge = 'y'.repeat(APKG_SQLITE_BUDGETS.maxFieldsChars)
    const r = await parseApkg(apkg(image({ notes: [{ flds: edge }] })))
    expect(r.cards).toHaveLength(1)
  })

  it('refuses oversized tags', async () => {
    const tags = 't'.repeat(APKG_SQLITE_BUDGETS.maxTagsChars + 1)
    await expect(parseApkg(apkg(image({ notes: [{ flds: 'a\x1fb', tags }] })))).rejects.toThrow(
      /tags exceed/,
    )
  })

  it('refuses oversized models JSON', async () => {
    const models = JSON.stringify({ pad: 'z'.repeat(APKG_SQLITE_BUDGETS.maxJsonChars) })
    await expect(parseApkg(apkg(image({ models })))).rejects.toThrow(/col\.models is larger/)
  })

  it('turns deeply nested JSON into a named error, not a stack overflow', async () => {
    const models = '['.repeat(200_000) + ']'.repeat(200_000)
    await expect(parseApkg(apkg(image({ models })))).rejects.toThrow(ApkgBudgetError)
  })

  it('refuses non-object JSON for models and decks', async () => {
    await expect(parseApkg(apkg(image({ models: '[1,2]' })))).rejects.toThrow(/not a JSON object/)
    await expect(parseApkg(apkg(image({ decks: 'null' })))).rejects.toThrow(/not a JSON object/)
  })

  it('refuses a model-count explosion', async () => {
    const m: Record<string, unknown> = {}
    for (let i = 0; i <= APKG_SQLITE_BUDGETS.maxModels; i++) m[i] = { id: i, name: 'n', type: 0 }
    await expect(parseApkg(apkg(image({ models: JSON.stringify(m) })))).rejects.toThrow(
      /col\.models has more than/,
    )
  })

  it('refuses bytes that are not a SQLite image before opening them', async () => {
    const bad = apkg(new TextEncoder().encode('this is not sqlite, only text bytes.'))
    await expect(parseApkg(bad)).rejects.toThrow(/not a SQLite database image/)
  })

  it('documents the driver assumption: better-sqlite3 honors PRAGMA query_only', () => {
    // The default opener sets this pragma; this test only pins that the driver enforces it.
    const probe = new Database(Buffer.from(image({})))
    probe.pragma('query_only = ON')
    expect(() => probe.exec('DELETE FROM col')).toThrow(/readonly/)
    probe.close()
  })
})

describe('structural checks on the tables actually read (no name guessing)', () => {
  const stripNotes = (x: string) =>
    x.replace(/CREATE TABLE notes \([^;]*;/s, '').replace(/CREATE INDEX ix_notes_usn[^;]*;/, '')
  const stripCards = (x: string) =>
    x.replace(/CREATE TABLE cards \([^;]*;/s, '').replace(/CREATE INDEX ix_cards_nid[^;]*;/, '')

  it('refuses `notes` defined as a view', async () => {
    const schema =
      stripNotes(SCHEMA) + `CREATE VIEW notes AS SELECT 1 AS id, 7 AS mid, '' AS tags, 'q' AS flds;`
    const col = new Database(':memory:')
    col.exec(schema)
    col.exec(`INSERT INTO col VALUES (1,0,0,0,11,0,0,0,'{}','${MODELS}','${DECKS}','{}','{}')`)
    const bytes = new Uint8Array(col.serialize())
    await expect(parseApkg(apkg(bytes))).rejects.toThrow(/notes is not an ordinary table/)
  })

  it('refuses `cards` defined as a virtual table (fts5)', async () => {
    const schema = stripCards(SCHEMA) + `CREATE VIRTUAL TABLE cards USING fts5(did);`
    const col = new Database(':memory:')
    col.exec(schema)
    col.exec(`INSERT INTO col VALUES (1,0,0,0,11,0,0,0,'{}','${MODELS}','${DECKS}','{}','{}')`)
    const bytes = new Uint8Array(col.serialize())
    await expect(parseApkg(apkg(bytes))).rejects.toThrow(/cards is not an ordinary table/)
  })

  it('does NOT refuse unrelated views, triggers or indexes by their presence', async () => {
    const extra = `
      CREATE VIEW harmless AS SELECT 1 AS x;
      CREATE TABLE audit (n integer);
      CREATE TRIGGER t_audit AFTER INSERT ON notes BEGIN INSERT INTO audit VALUES (1); END;
      CREATE INDEX ix_extra ON notes (mid);`
    const r = await parseApkg(apkg(image({ notes: [{ flds: 'Q\x1fA' }], extra })))
    expect(r.cards).toHaveLength(1)
  })
})

describe('custom openers keep working (no sqlite_master or pragma needed)', () => {
  it('stops paging on a short page even when rows carry no id', async () => {
    const seen: string[] = []
    const opener: SqliteOpener = () => ({
      prepare(sql: string) {
        seen.push(sql)
        if (sql.includes('FROM col')) {
          return { get: () => ({ models: MODELS, decks: DECKS }), all: () => [] }
        }
        if (sql.includes('FROM notes')) {
          return { get: () => undefined, all: () => [{ mid: 7, tags: '', flds: 'a\x1fb' }] }
        }
        return { get: () => undefined, all: () => [{ did: 3 }] }
      },
      close() {},
    })
    const r = await parseApkg(apkg(new Uint8Array([1, 2, 3])), { openDatabase: opener })
    expect(r.cards).toHaveLength(1)
    expect(seen.filter((s) => s.includes('FROM notes'))).toHaveLength(1)
  })

  it('refuses a full page whose rows have no advancing numeric id (no infinite loop)', async () => {
    const page = Array.from({ length: APKG_SQLITE_BUDGETS.pageSize }, () => ({
      mid: 7,
      tags: '',
      flds: 'a\x1fb',
    }))
    const opener: SqliteOpener = () => ({
      prepare(sql: string) {
        if (sql.includes('FROM col')) {
          return { get: () => ({ models: MODELS, decks: DECKS }), all: () => [] }
        }
        if (sql.includes('FROM notes')) return { get: () => undefined, all: () => page }
        return { get: () => undefined, all: () => [{ did: 3 }] }
      },
      close() {},
    })
    await expect(
      parseApkg(apkg(new Uint8Array([1, 2, 3])), { openDatabase: opener }),
    ).rejects.toThrow(/cursor did not advance/)
  })

  it('closes the database when a budget refuses', async () => {
    let closed = 0
    const opener: SqliteOpener = () => ({
      prepare: () => ({ get: () => ({ models: '[]', decks: '{}' }), all: () => [] }),
      close() {
        closed++
      },
    })
    await expect(
      parseApkg(apkg(new Uint8Array([1, 2, 3])), { openDatabase: opener }),
    ).rejects.toThrow(ApkgBudgetError)
    expect(closed).toBe(1)
  })
})
