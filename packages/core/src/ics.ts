/**
 * Minimal iCalendar (RFC 5545) writer — all-day events from the study plan,
 * importable by Google Calendar / Outlook / Apple Calendar. Pure module.
 */

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
