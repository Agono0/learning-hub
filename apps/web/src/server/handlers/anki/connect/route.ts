/**
 * /api/anki/connect — AnkiConnect loopback sync & card mapping endpoint.
 */
import { z } from 'zod'
import { buildAnkiVersionRequest, type AnkiSyncMode } from '@learning-hub/core/anki-connect'
import { listAnkiMappings, upsertAnkiMapping } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const ankiActionSchema = z.object({
  action: z.enum(['test_connection', 'sync_card', 'list_mappings']),
  cardId: z.number().int().positive().optional(),
  ankiNoteId: z.number().int().positive().optional(),
  ankiCardId: z.number().int().positive().optional(),
  syncMode: z.enum(['live_loopback', 'apkg_export', 'mirror_readonly']).default('live_loopback'),
})

export const GET = withRoute(async () => {
  const mappings = listAnkiMappings(50)
  return Response.json({
    ok: true,
    mappings,
    count: mappings.length,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, ankiActionSchema)

  if (body.action === 'test_connection') {
    // Generate version payload for loopback testing
    const payload = buildAnkiVersionRequest()
    return Response.json({
      ok: true,
      loopbackUrl: 'http://127.0.0.1:8765',
      requestPayload: payload,
      status: 'ready',
    })
  }

  if (body.action === 'sync_card') {
    if (!body.cardId || !body.ankiNoteId) {
      return Response.json({ ok: false, error: 'cardId and ankiNoteId required' }, { status: 400 })
    }

    upsertAnkiMapping({
      cardId: body.cardId,
      ankiNoteId: body.ankiNoteId,
      ankiCardId: body.ankiCardId,
      syncMode: body.syncMode as AnkiSyncMode,
    })

    return Response.json({ ok: true, cardId: body.cardId, ankiNoteId: body.ankiNoteId })
  }

  const mappings = listAnkiMappings(50)
  return Response.json({ ok: true, mappings })
})
