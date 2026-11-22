/**
 * Core tests for the RFC 5545 parser (S3-27 — calendar import: iCal feed
 * subscription + CalDAV VTODO read).
 *
 * Contract under test (`packages/core/src/ics.ts`):
 * - `parseCalendarFeed` — unfold (§3.1), quoted params, VALARM skipping,
 *   all-day (`VALUE=DATE` / compact) vs timed (UTC `Z` / floating) stamps,
 *   TEXT unescaping, and TOTALITY: junk never throws, malformed properties
 *   are dropped, only well-formed VEVENT/VTODO survive (zod at the boundary).
 * - `extractVCalendarSegments` — pulls VCALENDAR spans out of WebDAV
 *   multistatus XML (and XML-escaped bodies) for the CalDAV path.
 * - `parseCalendarResponseBody` — both feed shapes through one entry point.
 *
 * The existing writer half (`toICS`) is covered by planner tests; these are
 * the reader-side guarantees the /api/calendar/import handler relies on.
 */
import { describe, expect, it } from 'vitest'
import {
  extractVCalendarSegments,
  nextDay,
  parseCalendarFeed,
  parseCalendarResponseBody,
  toICS,
} from '../src/ics'

describe('parseCalendarFeed — VEVENT', () => {
  it('parses a minimal all-day event (VALUE=DATE)', () => {
    const feed = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:evt-1@example',
      'DTSTAMP:20261122T000000Z',
      'DTSTART;VALUE=DATE:20261201',
      'DTEND;VALUE=DATE:20261202',
      'SUMMARY:Linear algebra exam',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n')
    const { events } = parseCalendarFeed(feed)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      uid: 'evt-1@example',
      title: 'Linear algebra exam',
      description: null,
      start: '2026-12-01',
      end: '2026-12-02',
      allDay: true,
      status: null,
    })
  })

  it('parses timed UTC events (Z) and floating local times', () => {
    const feed = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:utc-1',
      'DTSTART:20261201T090000Z',
      'SUMMARY:Lecture',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:float-1',
      'DTSTART:20261202T101500',
      'DTEND:20261202T111500',
      'SUMMARY:Study block',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n')
    const { events } = parseCalendarFeed(feed)
    expect(events).toHaveLength(2)
    expect(events[0].start).toBe('2026-12-01T09:00:00Z')
    expect(events[0].allDay).toBe(false)
    expect(events[1].start).toBe('2026-12-02T10:15:00')
    expect(events[1].end).toBe('2026-12-02T11:15:00')
  })

  it('unfolds folded lines (RFC 5545 §3.1) on CRLF and LF', () => {
    // The fold point sits AFTER the original space (RFC lossless form: the
    // fold whitespace is additive, so "was " + " folded" unfolds to
    // "was folded" — a break directly before the space would consume it).
    const crlf =
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:fold-1\r\nDTSTART:20260101T090000Z\r\nDTEND:20260101T100000Z\r\nSUMMARY:A very long title that was \r\n folded across two lines\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
    expect(parseCalendarFeed(crlf).events[0].title).toBe(
      'A very long title that was folded across two lines',
    )
    const lf = crlf.replace(/\r\n/g, '\n')
    expect(parseCalendarFeed(lf).events[0].title).toBe(
      'A very long title that was folded across two lines',
    )
  })

  it('the writer’s folds round-trip losslessly through the parser', () => {
    // A >75-octet title with spaces at fold boundaries — the regression the
    // space-aware fold() exists for.
    const title =
      'A very long study block title that definitely exceeds the seventy five octet folding limit and keeps going past it'
    const parsed = parseCalendarFeed(toICS([{ date: '2026-12-01', title }]))
    expect(parsed.events[0].title).toBe(title)
  })

  it('skips VALARM sub-components (nested BEGIN/END does not leak properties)', () => {
    const feed = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:alarm-1',
      'DTSTART;VALUE=DATE:20261203',
      'SUMMARY:Quiz',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Alarm that must NOT become the event description',
      'TRIGGER:-PT15M',
      'END:VALARM',
      'DESCRIPTION:Event description wins',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n')
    const { events } = parseCalendarFeed(feed)
    expect(events).toHaveLength(1)
    expect(events[0].description).toBe('Event description wins')
    expect(events[0].title).toBe('Quiz')
  })

  it('unescapes TEXT (\\n, \\,, \\;) and lowercases STATUS', () => {
    const feed = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:esc-1',
      'DTSTART;VALUE=DATE:20261204',
      'SUMMARY:Topic A\\, Topic B\\; review\\npart two',
      'DESCRIPTION:line one\\nline two',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n')
    const { events } = parseCalendarFeed(feed)
    expect(events[0].title).toBe('Topic A, Topic B; review\npart two')
    expect(events[0].description).toBe('line one\nline two')
    expect(events[0].status).toBe('confirmed')
  })

  it('handles quoted parameter values containing colons', () => {
    const feed = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:q-1',
      'DTSTART;TZID="Europe/Berlin:custom":20261201T090000',
      'SUMMARY:Quoted param',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n')
    const { events } = parseCalendarFeed(feed)
    expect(events).toHaveLength(1)
    expect(events[0].start).toBe('2026-12-01T09:00:00')
  })
})

describe('parseCalendarFeed — VTODO (CalDAV)', () => {
  it('parses summary, status, due, priority, description', () => {
    const feed = [
      'BEGIN:VCALENDAR',
      'BEGIN:VTODO',
      'UID:todo-1',
      'SUMMARY:Problem set 3',
      'STATUS:NEEDS-ACTION',
      'DUE:20261205T235900Z',
      'PRIORITY:1',
      'DESCRIPTION:Chapter 4 exercises',
      'END:VTODO',
      'END:VCALENDAR',
      '',
    ].join('\r\n')
    const { todos } = parseCalendarFeed(feed)
    expect(todos).toHaveLength(1)
    expect(todos[0]).toEqual({
      uid: 'todo-1',
      title: 'Problem set 3',
      description: 'Chapter 4 exercises',
      status: 'needs-action',
      due: '2026-12-05T23:59:00Z',
      priority: 1,
    })
  })

  it('defaults priority to 0 (undefined) and accepts all-day dues', () => {
    const feed = [
      'BEGIN:VCALENDAR',
      'BEGIN:VTODO',
      'UID:todo-2',
      'SUMMARY:Read chapter 5',
      'DUE;VALUE=DATE:20261206',
      'END:VTODO',
      'END:VCALENDAR',
      '',
    ].join('\r\n')
    const { todos } = parseCalendarFeed(feed)
    expect(todos[0].priority).toBe(0)
    expect(todos[0].due).toBe('2026-12-06')
  })

  it('mixes events and todos in one calendar', () => {
    const feed = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:m-1',
      'DTSTART;VALUE=DATE:20261207',
      'SUMMARY:Class',
      'END:VEVENT',
      'BEGIN:VTODO',
      'UID:m-2',
      'SUMMARY:Homework',
      'END:VTODO',
      'END:VCALENDAR',
      '',
    ].join('\r\n')
    const parsed = parseCalendarFeed(feed)
    expect(parsed.events).toHaveLength(1)
    expect(parsed.todos).toHaveLength(1)
  })
})

describe('parseCalendarFeed — totality (rule 5: untrusted input)', () => {
  it('never throws on junk and yields empty collections', () => {
    for (const junk of [
      '',
      'not a calendar',
      'BEGIN:VEVENT\nSUMMARY:orphan\nEND:VEVENT',
      '::::',
      'BEGIN:VCALENDAR\nEND:VCALENDAR',
    ]) {
      expect(parseCalendarFeed(junk)).toEqual({ events: [], todos: [] })
    }
  })

  it('drops malformed events (missing UID or DTSTART) but keeps valid siblings', () => {
    const feed = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:bad-1',
      'SUMMARY:no start',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261208',
      'SUMMARY:no uid',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:good-1',
      'DTSTART;VALUE=DATE:20261209',
      'SUMMARY:Valid',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n')
    const { events } = parseCalendarFeed(feed)
    expect(events).toHaveLength(1)
    expect(events[0].uid).toBe('good-1')
  })

  it('ignores malformed timestamps instead of rejecting the event', () => {
    const feed = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:ts-1',
      'DTSTART:not-a-date',
      'DTSTART;VALUE=DATE:20261210',
      'SUMMARY:Second DTSTART wins the start',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n')
    const { events } = parseCalendarFeed(feed)
    expect(events[0].start).toBe('2026-12-10')
    expect(events[0].allDay).toBe(true)
  })
})

describe('extractVCalendarSegments + parseCalendarResponseBody (CalDAV multistatus)', () => {
  const CAL =
    'BEGIN:VCALENDAR\r\nBEGIN:VTODO\r\nUID:dav-1\r\nSUMMARY:DAV task\r\nEND:VTODO\r\nEND:VCALENDAR\r\n'

  it('extracts the embedded VCALENDAR from a multistatus body', () => {
    const body = [
      '<?xml version="1.0"?>',
      '<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">',
      '<d:response>',
      '<d:propstat><d:prop>',
      '<cal:calendar-data><![CDATA[',
      CAL,
      ']]></cal:calendar-data>',
      '</d:prop></d:propstat>',
      '</d:response>',
      '</d:multistatus>',
    ].join('\n')
    expect(extractVCalendarSegments(body)).toHaveLength(1)
    const parsed = parseCalendarResponseBody(body)
    expect(parsed.todos).toHaveLength(1)
    expect(parsed.todos[0].title).toBe('DAV task')
  })

  it('handles XML-escaped calendar-data bodies', () => {
    const body = [
      '<cal:calendar-data>BEGIN:VCALENDAR',
      'BEGIN:VTODO',
      'UID:esc',
      'SUMMARY:Tea &amp; Toast',
      'END:VTODO',
      'END:VCALENDAR</cal:calendar-data>',
    ].join('\n')
    const segments = extractVCalendarSegments(body)
    expect(segments.length).toBe(1)
    const parsed = parseCalendarResponseBody(body)
    expect(parsed.todos[0].uid).toBe('esc')
    expect(parsed.todos[0].title).toBe('Tea & Toast')
  })

  it('a plain iCal document parses through the same entry point', () => {
    const parsed = parseCalendarResponseBody(toICS([{ date: '2026-12-11', title: 'Own feed' }]))
    expect(parsed.events).toHaveLength(1)
    expect(parsed.events[0].title).toBe('Own feed')
    expect(parsed.events[0].allDay).toBe(true)
    // Round-trip sanity: the writer's DTEND is the day after DTSTART.
    expect(parsed.events[0].end).toBe('2026-12-12')
    expect(nextDay('20261211')).toBe('20261212')
  })

  it('junk bodies yield empty collections, never throws', () => {
    expect(parseCalendarResponseBody('<html>not a calendar</html>')).toEqual({
      events: [],
      todos: [],
    })
  })
})
