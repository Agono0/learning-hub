import { z } from 'zod'
import { parseCalendarResponseBody } from '@learning-hub/core/ics'
import { ApiError, readJson, withRoute } from '@/lib/api'
import { boundedFetchText, BoundedFetchError } from '@/server/bounded-fetch'

/** Feed size cap: iCal and CalDAV multistatus bodies are text; 10 MB is generous for a calendar. */
const MAX_FEED_BYTES = 10 * 1024 * 1024

/**
 * POST /api/calendar/import (S3-27).
 *
 * The one network hop for calendar subscriptions: the UI never fetches a
 * feed cross-origin itself (rule 1) — it sends an https feed URL here, this
 * handler fetches it and parses the RFC 5545 payload through the pure core
 * parser (`parseCalendarFeed`, including the CalDAV multistatus segment
 * extraction). The response carries normalized events + todos; persistence
 * of the SUBSCRIPTION LIST is device-local in the webview
 * (`@/lib/calendar-feeds`), so no schema/migration is involved.
 *
 * Untrusted input, twice over: the URL must be https (calendar feeds are
 * credentials-adjacent; plain http is refused like core's assertHttps) and
 * the body is parsed defensively — junk feeds resolve to empty collections,
 * never an error the client must survive. The fetch goes through
 * `boundedFetchText`: https only, literal private/loopback/link-local hosts
 * refused on every redirect hop, at most 3 manual redirects, a 10 MB byte cap
 * and a 15 s deadline. Residual: no DNS resolution, so a public name that
 * resolves to a private address is not caught (see bounded-fetch.ts).
 */
const bodySchema = z.object({
  /** https feed URL (an .ics download or a CalDAV calendar-data report). */
  url: z.string().trim().url().startsWith('https://').max(2048),
  /** `ical` = plain VCALENDAR document; `caldav` = multistatus XML wrapping one. */
  kind: z.enum(['ical', 'caldav']).default('ical'),
})

export const POST = withRoute(async (req: Request) => {
  const { url, kind } = await readJson(req, bodySchema)

  let text: string | null = null
  try {
    const res = await boundedFetchText(url, {
      maxBytes: MAX_FEED_BYTES,
      timeoutMs: 15_000,
      headers: { accept: 'text/calendar, application/xml, text/xml, */*' },
    })
    if (res.ok) text = res.text
  } catch (err) {
    if (err instanceof BoundedFetchError && err.code === 'blocked') {
      throw new ApiError(400, err.message)
    }
    if (err instanceof BoundedFetchError && err.code === 'too-large') {
      throw new ApiError(413, 'The calendar feed is too large to import')
    }
    // network error / timeout — falls through to the honest empty reply
  }

  if (text === null) {
    throw new ApiError(502, 'The calendar feed could not be reached')
  }

  // CalDAV bodies are WebDAV multistatus XML with embedded VCALENDAR text;
  // extractVCalendarSegments handles both shapes (plain ical = 1 segment).
  const parsed = parseCalendarResponseBody(text)
  return Response.json({
    kind,
    events: parsed.events,
    todos: parsed.todos,
    counts: { events: parsed.events.length, todos: parsed.todos.length },
    fetchedAt: new Date().toISOString(),
  })
})
