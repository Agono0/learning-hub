import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  addPalaceLocus,
  createPalace,
  deleteMnemonicEntry,
  deletePalace,
  getMnemonicEntry,
  getPalaceWithItems,
  initDb,
  listMnemonicTables,
  listPalaces,
  mnemonicTables,
  palaceItems,
  palaces,
  setDb,
  updatePalace,
  upsertMnemonicEntry,
  type LearningHubDB,
} from '../src/index'

let testDb: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-mnemonic-'))
  testDb = await initDb({ path: join(tmp, 'mnemonic.db') })
  setDb(testDb)
})

beforeEach(() => {
  testDb.delete(palaceItems).run()
  testDb.delete(palaces).run()
  testDb.delete(mnemonicTables).run()
})

afterAll(() => {
  try {
    ;(testDb as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('memory repository — mnemonic tables', () => {
  it('upserts, queries, filters by kind, and deletes mnemonic entries', () => {
    upsertMnemonicEntry({
      kind: 'major',
      code: '42',
      word: 'rain',
      image: 'a rainy cloud',
    })

    upsertMnemonicEntry({
      kind: 'pao',
      code: '07',
      person: 'James Bond',
      action: 'shooting',
      object: 'walther ppk',
    })

    const major42 = getMnemonicEntry('major', '42')
    expect(major42).not.toBeNull()
    expect(major42?.word).toBe('rain')

    const pao07 = getMnemonicEntry('pao', '07')
    expect(pao07).not.toBeNull()
    expect(pao07?.person).toBe('James Bond')

    // Upsert updates existing entry idempotently
    upsertMnemonicEntry({
      kind: 'major',
      code: '42',
      word: 'rhino',
      image: 'a horned rhino',
    })
    const updated42 = getMnemonicEntry('major', '42')
    expect(updated42?.word).toBe('rhino')

    // Filter by kind
    const majorsOnly = listMnemonicTables({ kind: 'major' })
    expect(majorsOnly).toHaveLength(1)
    expect(majorsOnly[0].code).toBe('42')

    const paosOnly = listMnemonicTables({ kind: 'pao' })
    expect(paosOnly).toHaveLength(1)
    expect(paosOnly[0].code).toBe('07')

    // Delete entry
    const deleted = deleteMnemonicEntry('major', '42')
    expect(deleted).toBe(true)
    expect(getMnemonicEntry('major', '42')).toBeNull()
  })
})

describe('memory repository — palaces and loci', () => {
  it('manages palaces and loci walk ordering', () => {
    const created = createPalace({
      name: 'Roman Villa',
      description: 'Ancient atrium layout',
      rooms: [
        { name: 'Atrium', emoji: '🏛️' },
        { name: 'Peristyle', emoji: '🌿' },
      ],
    })

    expect(created.palace.id).toBeGreaterThan(0)
    expect(created.palace.name).toBe('Roman Villa')
    expect(created.items).toHaveLength(0)

    // Add loci
    const locus0 = addPalaceLocus({
      palaceId: created.palace.id,
      name: 'Front Door Column',
      vividImage: 'Golden lion statue',
      cardId: 101,
    })
    expect(locus0.lociIndex).toBe(0)

    const locus1 = addPalaceLocus({
      palaceId: created.palace.id,
      name: 'Impluvium Pool',
      vividImage: 'Crystal fountain',
    })
    expect(locus1.lociIndex).toBe(1)

    const fetched = getPalaceWithItems(created.palace.id)
    expect(fetched).not.toBeNull()
    expect(fetched?.items).toHaveLength(2)
    expect(fetched?.items[0].name).toBe('Front Door Column')
    expect(fetched?.items[1].name).toBe('Impluvium Pool')

    // Update palace and replace items
    const updated = updatePalace(created.palace.id, {
      name: 'Grand Roman Villa',
      items: [
        { lociIndex: 1, name: 'Rear Garden' },
        { lociIndex: 0, name: 'Front Gate' },
      ],
    })
    expect(updated?.palace.name).toBe('Grand Roman Villa')
    // Result should be sorted by lociIndex via palaceWalkOrder
    expect(updated?.items[0].name).toBe('Front Gate')
    expect(updated?.items[1].name).toBe('Rear Garden')

    // List palaces
    const all = listPalaces()
    expect(all).toHaveLength(1)

    // Delete palace cascades
    const deleted = deletePalace(created.palace.id)
    expect(deleted).toBe(true)
    expect(getPalaceWithItems(created.palace.id)).toBeNull()
    expect(listPalaces()).toHaveLength(0)
  })
})
