import Database from 'better-sqlite3'
import { zipSync } from 'fflate'
import { parseApkg, type ApkgModelDiagnostic, type ParsedDeck } from '../../src/anki'

// Synthetic collections. Table layout follows ankitects/anki tag 25.09.2
// rslib/src/storage/schema11.sql (col, notes, cards); values are invented, no real export.
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
  odid integer not null, flags integer not null, data text not null);`

export interface FxModel {
  id: number
  name: string
  type?: number
  flds: string[]
  tmpls: { qfmt: string; afmt: string; ord?: number }[]
}
export interface FxNote {
  id: number
  mid: number
  flds: string[]
  tags?: string
}
export interface FxCard {
  nid: number
  ord: number
}

export const US = '\x1f'

export function model(m: FxModel): Record<string, unknown> {
  return {
    id: m.id,
    name: m.name,
    type: m.type ?? 0,
    flds: m.flds.map((name, ord) => ({ name, ord })),
    tmpls: m.tmpls.map((t, i) => ({
      name: `Card ${i + 1}`,
      ord: t.ord ?? i,
      qfmt: t.qfmt,
      afmt: t.afmt,
    })),
  }
}

export function buildCollection(opts: {
  models: FxModel[]
  notes: FxNote[]
  cards: FxCard[]
}): Uint8Array {
  const db = new Database(':memory:')
  db.exec(SCHEMA)
  const models: Record<string, unknown> = {}
  for (const m of opts.models) models[m.id] = model(m)
  db.prepare(`INSERT INTO col VALUES (1,0,0,0,11,0,0,0,'{}',?,?,'{}','{}')`).run(
    JSON.stringify(models),
    JSON.stringify({ 3: { id: 3, name: 'Fixture Deck' } }),
  )
  const n = db.prepare(`INSERT INTO notes VALUES (?,?,?,0,0,?,?,0,0,0,'')`)
  const c = db.prepare(`INSERT INTO cards VALUES (?,?,3,?,0,0,0,0,0,0,0,0,0,0,0,0,0,'')`)
  db.transaction(() => {
    for (const x of opts.notes) n.run(x.id, `g${x.id}`, x.mid, x.tags ?? '', x.flds.join(US))
    opts.cards.forEach((x, i) => c.run(i + 1, x.nid, x.ord))
  })()
  const bytes = new Uint8Array(db.serialize())
  db.close()
  return bytes
}

export async function parse(
  opts: Parameters<typeof buildCollection>[0],
): Promise<{ deck: ParsedDeck; diagnostics: ApkgModelDiagnostic[] }> {
  const zip = zipSync({ 'collection.anki2': buildCollection(opts) })
  const diagnostics: ApkgModelDiagnostic[] = []
  const deck = await parseApkg(zip, { onDiagnostic: (d) => diagnostics.push(d) })
  return { deck, diagnostics }
}

/** Plain-text two-field notetype under a name the legacy importer does not match. */
export const PLAIN: FxModel = {
  id: 100,
  name: 'Renamed Plain',
  flds: ['Front', 'Back'],
  tmpls: [{ qfmt: '{{Front}}', afmt: '{{FrontSide}} - {{Back}}' }],
}
