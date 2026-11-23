import { parseUpdatePointer, updateChannelSchema } from '@learning-hub/core/update'
import { z } from 'zod'
import { readQuery, withRoute } from '@/lib/api'
import { remoteFetch } from '@/server/net'

/**
 * GET /api/update/notes?channel=nightly|beta|stable (O1-26).
 *
 * Server-side proxy for the channel pointer (`nightly.json` etc. on the fixed
 * `channel-pointers` GitHub release, see docs/updates.md). The UI never fetches
 * cross-origin itself (rule 1: no raw fetch — this handler is the one network
 * hop, reachable through `apiGet` on every host including the native webview).
 *
 * The pointer is UNTRUSTED INPUT: it is validated through the core
 * `parseUpdatePointer` (O1-28) before anything is returned — unknown fields
 * are stripped, invalid documents yield `notes: null` rather than an error the
 * client must handle. Notes are CI-authored text but are still escaped by the
 * renderer (`<Markdown>`). The reply also forwards `manifestUrl` so the update
 * controller can fetch + signature-verify the manifest on the native layer.
 *
 * Outbound call rides the `remoteFetch` port (F-07): on the native webview it
 * goes through the Rust HTTP bridge, so the pointer read does not depend on
 * GitHub sending permissive CORS headers to the webview origin.
 */
const querySchema = z.object({ channel: updateChannelSchema.default('nightly') })

/** Default pointer host; overridable for self-hosted releases via env. */
const POINTER_BASE =
  (typeof process !== 'undefined' ? process.env?.LH_UPDATE_POINTER_BASE : undefined) ??
  'https://github.com/Agono0/learning-hub/releases/download/channel-pointers/'

export const GET = withRoute(async (req: Request) => {
  const { channel } = readQuery(req, querySchema)
  const url = `${POINTER_BASE}${channel}.json`

  let pointer: ReturnType<typeof parseUpdatePointer> = null
  let reason = 'pointer-unavailable'
  try {
    const res = await remoteFetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) {
      pointer = parseUpdatePointer(await res.json())
      reason = 'pointer-invalid'
    }
  } catch {
    // network error / timeout / non-JSON — fall through to the null-notes reply
  }

  if (!pointer) {
    return Response.json({ notes: null, reason, channel })
  }
  return Response.json({
    notes: pointer.notes ?? null,
    version: pointer.version,
    publishedAt: pointer.publishedAt,
    manifestUrl: pointer.manifestUrl,
    channel,
  })
})
