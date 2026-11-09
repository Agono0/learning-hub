/**
 * Import & Export API handler integration test (F-16)
 *
 * Verifies deck import (POST /api/import for txt and json formats) and export
 * (GET /api/export for txt and json attachments).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportDeckToJSON } from '@learning-hub/core'

const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-import-export-')), 'impexp.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = {
  importHandler: typeof import('../src/server/handlers/import/route')
  exportHandler: typeof import('../src/server/handlers/export/route')
  db: typeof import('@learning-hub/db')
}

let M: Modules

beforeAll(async () => {
  const dbMod = await import('@learning-hub/db')
  const importMod = await import('../src/server/handlers/import/route')
  const exportMod = await import('../src/server/handlers/export/route')
  M = { importHandler: importMod, exportHandler: exportMod, db: dbMod }
})

describe('Import & Export API Handlers (/api/import, /api/export)', () => {
  let createdDeckId: number

  it('POST /api/import creates a deck and cards from JSON payload', async () => {
    const payload = JSON.stringify(
      exportDeckToJSON({
        name: 'Imported Medical Deck',
        cards: [
          {
            type: 'basic',
            content: { basic: { front: 'Primary pacemaker of the heart?', back: 'SA node' } },
            tags: ['cardio', 'anatomy'],
          },
          {
            type: 'cloze',
            content: {
              cloze: {
                text: 'The {{c1::hippocampus}} is crucial for episodic memory.',
                answers: ['hippocampus'],
                mode: 'basic',
              },
            },
            tags: ['neuro'],
          },
        ],
      }),
    )

    const req = new Request('http://localhost/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'json',
        payload,
      }),
    })

    const res = await M.importHandler.POST(req)
    expect(res.status).toBe(201)

    const data = (await res.json()) as {
      ok: boolean
      deckId: number
      deckName: string
      imported: number
    }
    expect(data.ok).toBe(true)
    expect(data.deckId).toBeDefined()
    expect(data.imported).toBe(2)
    createdDeckId = data.deckId
  })

  it('POST /api/import parses Anki plain-text TSV format', async () => {
    const tsvText = `#separator:tab\n#html:true\nFront question\tBack answer\ttag1 tag2`
    const req = new Request('http://localhost/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'txt',
        payload: tsvText,
        deckName: 'TSV Imported Deck',
      }),
    })

    const res = await M.importHandler.POST(req)
    expect(res.status).toBe(201)
    const data = (await res.json()) as { ok: boolean; imported: number }
    expect(data.ok).toBe(true)
    expect(data.imported).toBe(1)
  })

  it('GET /api/export downloads deck in JSON format with attachment header', async () => {
    const req = new Request(`http://localhost/api/export?deckId=${createdDeckId}&format=json`)
    const res = await M.exportHandler.GET(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(res.headers.get('content-disposition')).toContain('attachment')

    const data = (await res.json()) as { name: string; cards: unknown[] }
    expect(data.name).toBe('Imported Medical Deck')
    expect(data.cards).toHaveLength(2)
  })

  it('GET /api/export downloads deck in Anki txt format', async () => {
    const req = new Request(`http://localhost/api/export?deckId=${createdDeckId}&format=txt`)
    const res = await M.exportHandler.GET(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    expect(res.headers.get('content-disposition')).toContain('.anki.txt')

    const text = await res.text()
    expect(text).toContain('#separator:tab')
    expect(text).toContain('Primary pacemaker')
  })

  it('rejects export for non-existent deck with 404', async () => {
    const req = new Request('http://localhost/api/export?deckId=999999&format=json')
    const res = await M.exportHandler.GET(req)
    expect(res.status).toBe(404)
  })
})
