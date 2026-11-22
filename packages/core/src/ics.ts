/**
 * Minimal iCalendar (RFC 5545) module — WRITE (all-day events from the study
 * plan, importable by Google Calendar / Outlook / Apple Calendar) and, since
 * S3-27, PARSE (iCal feed subscription + CalDAV VTODO read → planner events).
 * Pure module: no I/O — the fetch happens in the /api/calendar/import handler
 * (rule 1); this file only understands the RFC 5545 text.
 */
import { z } from 'zod'

/** One all-day event. `date` is a local calendar day (YYYY-MM-DD). */
export interface IcsEvent {
  date: string // YYYY-MM-DD
  title: string
  description?: string
}

/** Escape per RFC 5545 §3.3.11 (TEXT). */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/** Fold lines > 75 octets (RFC 5545 §3.1) on character boundaries. */
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = [line.slice(0, 75)]
  for (let i = 75; i < line.length; i += 74) {
    parts.push(' ' + line.slice(i, i + 74))
  }
  return parts.join('\r\n')
}

/**
 * Serialize events into a VCALENDAR. All-day (VALUE=DATE) events only — no
 * timezones, which keeps imports predictable everywhere.
 */
export function toICS(events: IcsEvent[], calendarName = 'Learning HUB'): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Learning HUB//Study Planner//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(calendarName)}`,
  ]
  for (const ev of events) {
    const date = ev.date.replaceAll('-', '')
    lines.push(
      'BEGIN:VEVENT',
      `UID:lh-${date}-${stamp}-${esc(ev.title).slice(0, 30)}@learning-hub`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${date}`,
      `DTEND;VALUE=DATE:${nextDay(date)}`,
      `SUMMARY:${esc(ev.title)}`,
      ...(ev.description ? [`DESCRIPTION:${esc(ev.description)}`] : []),
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Next calendar day of a compact (YYYYMMDD) date, month/year aware. */
export function nextDay(compact: string): string {
  const y = Number(compact.slice(0, 4))
  const m = Number(compact.slice(4, 6))
  const d = Number(compact.slice(6, 8))
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  return `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, '0')}${String(next.getUTCDate()).padStart(2, '0')}`
}

// ── Parsing (S3-27): iCal feed subscription + CalDAV VTODO read ─────────────

/**
 * One event/todo parsed out of a feed. Timestamps normalize to ISO 8601:
 * all-day events carry their local calendar day as `YYYY-MM-DD` in `start`
 * (with `allDay: true`), timed events carry a full ISO instant — UTC forms
 * end in `Z`, floating (no TZID) local forms are rendered as naive ISO.
 * Recurring rules (RRULE) are intentionally NOT expanded here: the feed's
 * master event is imported and the planner shows it once (expansion is a
 * planner concern with its own clock, not a text-parsing one).
 */
export const calendarFeedEventSchema = z.object({
  /** Feed-native UID (stable across refreshes — used as the dedupe key). */
  uid: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  /** `YYYY-MM-DD` (all-day) or ISO datetime (timed). */
  start: z.string().min(1),
  /** Same shape as `start`; exclusive for all-day spans (RFC 5545 DTEND). */
  end: z.string().nullable(),
  allDay: z.boolean(),
  /** VEVENT STATUS, lowercased (`confirmed` / `tentative` / `cancelled`). */
  status: z.string().nullable(),
})
export type CalendarFeedEvent = z.infer<typeof calendarFeedEventSchema>

/** A VTODO read out of a CalDAV calendar-data payload. */
export const calendarFeedTodoSchema = z.object({
  uid: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  /** RFC 5545 STATUS lowercased (`needs-action` / `completed` / …). */
  status: z.string().nullable(),
  /** Due instant/day in the same normalization as events. */
  due: z.string().nullable(),
  /** 0 = undefined, 1–9 = priority (1 highest) per RFC 5545 §3.8.1.9. */
  priority: z.number().int().min(0).max(9),
})
export type CalendarFeedTodo = z.infer<typeof calendarFeedTodoSchema>

/** What a full feed parse produced (both collections may be non-empty). */
export interface ParsedCalendarFeed {
  events: CalendarFeedEvent[]
  todos: CalendarFeedTodo[]
}

/** Unescape RFC 5545 §3.3.11 TEXT back into a plain string. */
function unesc(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

/**
 * Unfold content lines (RFC 5545 §3.1): a CRLF (or bare LF) followed by a
 * space or tab is a continuation of the previous line. Returns `['']`-safe
 * output for empty input.
 */
function unfoldLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const out: string[] = []
  for (const raw of normalized.split('\n')) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += raw.slice(1)
    } else if (raw.length > 0) {
      out.push(raw)
    }
  }
  return out
}

/**
 * Split `NAME;PARAM=V;PARAM=V:value` into name (uppercased), params and
 * value. Quoted parameter values may contain colons — the split uses the
 * LAST colon outside quotes (RFC 5545 §3.1 content-line grammar).
 */
function parseContentLine(line: string): { name: string; params: string; value: string } {
  let inQuotes = false
  let colonIdx = -1
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === ':' && !inQuotes) colonIdx = i
  }
  if (colonIdx < 0) return { name: '', params: '', value: '' }
  const head = line.slice(0, colonIdx)
  const value = line.slice(colonIdx + 1)
  const semi = head.indexOf(';')
  return semi < 0
    ? { name: head.toUpperCase(), params: '', value }
    : { name: head.slice(0, semi).toUpperCase(), params: head.slice(semi + 1), value }
}

/** True when the DTSTART/DTEND line declared `VALUE=DATE` (all-day). */
function isDateOnly(params: string): boolean {
  return /VALUE\s*=\s*DATE(?!\+|-|T)/i.test(params)
}

/**
 * Normalize one DTSTAMP value + params into the {@link CalendarFeedEvent}
 * timestamp convention. Unknown garbage → `null` (the property is dropped;
 * a malformed property never rejects the whole event).
 */
function normalizeStamp(value: string, params: string): { value: string; allDay: boolean } | null {
  const compact = value.trim()
  if (isDateOnly(params) || /^\d{8}$/.test(compact)) {
    if (!/^\d{8}$/.test(compact)) return null
    return {
      value: `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`,
      allDay: true,
    }
  }
  // Datetime: YYYYMMDDTHHMMSS(.mmm)?(Z)?
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.\d+)?(Z)?$/.exec(compact)
  if (!m) return null
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`
  return m[7] === 'Z' ? { value: `${iso}Z`, allDay: false } : { value: iso, allDay: false }
}

/** Lowercased STATUS or null (absent/unknown both normalize to null). */
function normalizeStatus(value: string | undefined): string | null {
  if (!value) return null
  const lower = value.trim().toLowerCase()
  return lower.length > 0 ? lower : null
}

/**
 * Parse an RFC 5545 VCALENDAR document into feed events + todos (S3-27).
 *
 * Defensive by design (untrusted input — rule 5): folding, quoted params,
 * nested components (VALARM inside VEVENT/VTODO) and malformed properties
 * are all handled; the parser is TOTAL — it never throws. Junk input yields
 * an empty result, a valid document yields every well-formed VEVENT/VTODO.
 * A nested `BEGIN:` while a component is open increments a nesting counter;
 * only properties at nesting 0 are taken, so a VALARM's DESCRIPTION can
 * never masquerade as the event's.
 */
export function parseCalendarFeed(text: string): ParsedCalendarFeed {
  const events: CalendarFeedEvent[] = []
  const todos: CalendarFeedTodo[] = []

  let kind: 'event' | 'todo' | null = null
  let nested = 0
  let event: Partial<CalendarFeedEvent> | null = null
  let todo: Partial<CalendarFeedTodo> | null = null

  const flush = (): void => {
    if (kind === 'event' && event) {
      const parsed = calendarFeedEventSchema.safeParse({
        uid: event.uid ?? '',
        title: event.title ?? '',
        description: event.description ?? null,
        start: event.start ?? '',
        end: event.end ?? null,
        allDay: event.allDay ?? false,
        status: event.status ?? null,
      })
      if (parsed.success && parsed.data.uid !== '' && parsed.data.start !== '') {
        events.push(parsed.data)
      }
    } else if (kind === 'todo' && todo) {
      const parsed = calendarFeedTodoSchema.safeParse({
        uid: todo.uid ?? '',
        title: todo.title ?? '',
        description: todo.description ?? null,
        status: todo.status ?? null,
        due: todo.due ?? null,
        priority: todo.priority ?? 0,
      })
      if (parsed.success && parsed.data.uid !== '' && parsed.data.title !== '') {
        todos.push(parsed.data)
      }
    }
    kind = null
    event = null
    todo = null
  }

  for (const line of unfoldLines(text)) {
    const { name, params, value } = parseContentLine(line)
    if (name === 'BEGIN') {
      const component = value.trim().toUpperCase()
      if (kind === null) {
        // A bare component (no VCALENDAR wrapper) is accepted too — feeds
        // in the wild occasionally omit it.
        if (component === 'VEVENT') {
          kind = 'event'
          event = {}
        } else if (component === 'VTODO') {
          kind = 'todo'
          todo = {}
        }
      } else {
        nested += 1 // VALARM et al. — swallow its properties
      }
      continue
    }
    if (name === 'END') {
      if (nested > 0) {
        nested -= 1
      } else {
        flush()
      }
      continue
    }
    if (kind === null || nested > 0) continue
    if (kind === 'event' && event) {
      switch (name) {
        case 'UID':
          event.uid = value.trim()
          break
        case 'SUMMARY':
          event.title = unesc(value).trim()
          break
        case 'DESCRIPTION':
          event.description = unesc(value)
          break
        case 'DTSTART': {
          const norm = normalizeStamp(value, params)
          if (norm) {
            event.start = norm.value
            event.allDay = norm.allDay
          }
          break
        }
        case 'DTEND': {
          const norm = normalizeStamp(value, params)
          if (norm) event.end = norm.value
          break
        }
        case 'STATUS':
          event.status = normalizeStatus(value)
          break
        default:
          break
      }
    } else if (kind === 'todo' && todo) {
      switch (name) {
        case 'UID':
          todo.uid = value.trim()
          break
        case 'SUMMARY':
          todo.title = unesc(value).trim()
          break
        case 'DESCRIPTION':
          todo.description = unesc(value)
          break
        case 'STATUS':
          todo.status = normalizeStatus(value)
          break
        case 'DUE': {
          const norm = normalizeStamp(value, params)
          if (norm) todo.due = norm.value
          break
        }
        case 'PRIORITY': {
          const n = Number.parseInt(value.trim(), 10)
          if (Number.isInteger(n) && n >= 0 && n <= 9) todo.priority = n
          break
        }
        default:
          break
      }
    }
  }
  flush()
  return { events, todos }
}

/**
 * Extract VCALENDAR segments from a CalDAV response body (S3-27).
 *
 * CalDAV servers answer PROPFIND/REPORT with WebDAV multistatus XML whose
 * `<cal:calendar-data>` payload embeds the RFC 5545 text. Rather than a full
 * XML parser, this pulls every `BEGIN:VCALENDAR … END:VCALENDAR` span (case-
 * insensitive, XML-escaped variants included) so {@link parseCalendarFeed}
 * can consume them. Total: junk in → `[]` out.
 */
export function extractVCalendarSegments(text: string): string[] {
  if (!text) return []
  const unxml = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  const segments: string[] = []
  const re = /BEGIN:VCALENDAR[\s\S]*?END:VCALENDAR/gi
  for (const match of unxml.matchAll(re)) segments.push(match[0])
  return segments
}

/**
 * Parse every VCALENDAR segment of a (possibly multistatus) response body.
 * Convenience over {@link extractVCalendarSegments} + {@link parseCalendarFeed}
 * — the handler's one-liner.
 */
export function parseCalendarResponseBody(text: string): ParsedCalendarFeed {
  const merged: ParsedCalendarFeed = { events: [], todos: [] }
  for (const segment of extractVCalendarSegments(text)) {
    const parsed = parseCalendarFeed(segment)
    merged.events.push(...parsed.events)
    merged.todos.push(...parsed.todos)
  }
  return merged
}
