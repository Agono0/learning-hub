import { describe, expect, it } from 'vitest'
import {
  buildAddNoteRequest,
  buildFindCardsRequest,
  buildAnkiVersionRequest,
  mapHubCardToAnkiNote,
} from '../src/anki-connect'

describe('anki-connect protocol & mapping', () => {
  it('builds version request', () => {
    const req = buildAnkiVersionRequest()
    expect(req.action).toBe('version')
    expect(req.version).toBe(6)
  })

  it('maps basic card to Anki note', () => {
    const note = mapHubCardToAnkiNote(
      'Default',
      {
        basic: { front: 'What is mitochondria?', back: 'Powerhouse of cell' },
      },
      ['biology'],
    )

    expect(note.deckName).toBe('Default')
    expect(note.modelName).toBe('Basic')
    expect(note.fields.Front).toBe('What is mitochondria?')
    expect(note.fields.Back).toBe('Powerhouse of cell')
    expect(note.tags).toContain('biology')

    const addReq = buildAddNoteRequest(note)
    expect(addReq.action).toBe('addNote')
    expect(addReq.params?.note).toBeDefined()
  })

  it('maps cloze card to Anki note', () => {
    const note = mapHubCardToAnkiNote('Medicine', {
      cloze: { text: 'The heart has {{c1::four}} chambers.' },
    })

    expect(note.modelName).toBe('Cloze')
    expect(note.fields.Text).toBe('The heart has {{c1::four}} chambers.')
  })

  it('builds findCards request', () => {
    const req = buildFindCardsRequest('deck:Default is:due')
    expect(req.action).toBe('findCards')
    expect(req.params?.query).toBe('deck:Default is:due')
  })
})
