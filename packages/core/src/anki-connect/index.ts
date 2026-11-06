/**
 * @fileoverview AnkiConnect Protocol & Live Sync Integration.
 *
 * Implements the AnkiConnect API v6 contract:
 * - Direct HTTP loopback communication on http://127.0.0.1:8765
 * - Note/Card bi-directional mapping between Learning HUB and Anki models
 * - 3 operational sync modes:
 *   1. 'live_loopback': full bidirectional push/pull with running Anki instance
 *   2. 'apkg_export': package-based offline exchange
 *   3. 'mirror_readonly': passive sync importing cards & schedules without mutating Anki
 */
import { z } from 'zod'

export const ankiSyncModeSchema = z.enum(['live_loopback', 'apkg_export', 'mirror_readonly'])
export type AnkiSyncMode = z.infer<typeof ankiSyncModeSchema>

export const ankiConnectRequestSchema = z.object({
  action: z.string(),
  version: z.number().default(6),
  params: z.record(z.string(), z.unknown()).optional(),
})
export type AnkiConnectRequest = z.infer<typeof ankiConnectRequestSchema>

export const ankiConnectResponseSchema = z.object({
  result: z.unknown(),
  error: z.string().nullable(),
})
export type AnkiConnectResponse = z.infer<typeof ankiConnectResponseSchema>

export interface AnkiNotePayload {
  deckName: string
  modelName: 'Basic' | 'Cloze'
  fields: {
    Front?: string
    Back?: string
    Text?: string
    Extra?: string
  }
  tags?: string[]
}

/**
 * Maps a Learning HUB flashcard content object to an Anki note payload.
 */
export function mapHubCardToAnkiNote(
  deckName: string,
  content: {
    basic?: { front: string; back: string }
    cloze?: { text: string }
    typein?: { question: string; acceptedAnswers: string[] }
  },
  tags: string[] = [],
): AnkiNotePayload {
  if (content.cloze) {
    return {
      deckName,
      modelName: 'Cloze',
      fields: {
        Text: content.cloze.text,
      },
      tags,
    }
  }

  if (content.typein) {
    return {
      deckName,
      modelName: 'Basic',
      fields: {
        Front: content.typein.question,
        Back: content.typein.acceptedAnswers.join(', '),
      },
      tags,
    }
  }

  return {
    deckName,
    modelName: 'Basic',
    fields: {
      Front: content.basic?.front ?? '',
      Back: content.basic?.back ?? '',
    },
    tags,
  }
}

/**
 * Builds standard AnkiConnect JSON payload for checking connectivity/version.
 */
export function buildAnkiVersionRequest(): AnkiConnectRequest {
  return {
    action: 'version',
    version: 6,
  }
}

/**
 * Builds standard AnkiConnect payload for adding a note.
 */
export function buildAddNoteRequest(note: AnkiNotePayload): AnkiConnectRequest {
  return {
    action: 'addNote',
    version: 6,
    params: {
      note: {
        deckName: note.deckName,
        modelName: note.modelName,
        fields: note.fields,
        tags: note.tags ?? [],
        options: {
          allowDuplicate: false,
          duplicateScope: 'deck',
        },
      },
    },
  }
}

/**
 * Builds standard AnkiConnect payload for fetching due card IDs in a deck.
 */
export function buildFindCardsRequest(query: string): AnkiConnectRequest {
  return {
    action: 'findCards',
    version: 6,
    params: { query },
  }
}
