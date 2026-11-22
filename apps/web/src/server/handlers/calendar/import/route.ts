import { z } from 'zod'
import { parseCalendarResponseBody } from '@learning-hub/core/ics'
import { ApiError, readJson, withRoute } from '@/lib/api'

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
 * never an error the client must survive. No SSRF hardening beyond https +
 * no redirect-crossing: this is a user-entered, user-visible subscription
 * (the planner shows the URL), same trust level as the reader's RSS paths.
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
    const res = await fetch(url, {
      headers: { accept: 'text/calendar, application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) text = await res.text()
  } catch {
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
