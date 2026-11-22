'use client'

/**
 * CalendarSubscriptions — planner section for subscribing to external
 * calendars (S3-27): an iCal feed URL (Google Calendar / Outlook / Fastmail
 * secret address) or a CalDAV calendar-data endpoint.
 *
 * Contract: the subscription LIST is device-local (`@/lib/calendar-feeds`,
 * zod-validated); fetching happens server-side through /api/calendar/import
 * (rule 1 — the handler is the one network hop), and the parsed snapshot is
 * cached device-local so the planner can render the overlay offline between
 * refreshes. Honest states: an unreachable feed names the reason, a junk
 * feed yields an empty preview — never a thrown error.
 *
 * SSR-safe: storage/platform reads happen after mount (device.ts pattern),
 * so the server markup matches the first client render exactly.
 */
import React, { useEffect, useState } from 'react'
import { CalendarClock, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Badge, Button, EmptyState, TextField, Toggle } from '@/ui'
import { SectionHeader } from '@/components/ui/section-header'
import { apiSend } from '@/lib/transport'
import {
  addSubscription,
  loadFeedCache,
  loadSubscriptions,
  putFeedCache,
  removeSubscription,
  updateSubscription,
  type CalendarFeedCache,
  type CalendarSubscription,
} from '@/lib/calendar-feeds'
import type { CalendarFeedEvent, CalendarFeedTodo } from '@learning-hub/core/ics'

/** One import result as /api/calendar/import replies. */
interface ImportResult {
  events: CalendarFeedEvent[]
  todos: CalendarFeedTodo[]
  counts: { events: number; todos: number }
}

/** Calm dot palette per subscription (color token → bg class). */
const DOT_CLASSES: Record<CalendarSubscription['color'], string> = {
  indigo: 'bg-indigo-500',
  teal: 'bg-teal-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  lime: 'bg-lime-500',
}

/** How many upcoming events the preview shows (calm, not a wall). */
const PREVIEW_LIMIT = 5

/**
 * The planner's calendar-import section. Self-contained: renders its own
 * `<section id="calendar-subscriptions">` so the planner page only mounts it.
 */
export function CalendarSubscriptions(): React.ReactElement {
  const [subs, setSubs] = useState<CalendarSubscription[]>([])
  const [cache, setCache] = useState<CalendarFeedCache[]>([])
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<'ical' | 'caldav'>('ical')
  const [importing, setImporting] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Hydration-safe loads (device.ts pattern): storage reads happen after
  // mount — subscriptions AND the feed cache — so server markup matches the
  // first client render exactly.
  useEffect(() => {
    setSubs(loadSubscriptions())
    setCache(loadFeedCache())
  }, [])

  const add = () => {
    setError(null)
    if (name.trim().length === 0 || url.trim().length === 0) {
      setError('Give the calendar a name and its https feed URL.')
      return
    }
    setSubs(addSubscription({ name, url, kind }))
    setName('')
    setUrl('')
    setKind('ical')
  }

  const refresh = async (sub: CalendarSubscription) => {
    setError(null)
    setImporting(sub.id)
    try {
      const result = await apiSend<ImportResult>('/api/calendar/import', 'POST', {
        url: sub.url,
        kind: sub.kind,
      })
      putFeedCache({
        subscriptionId: sub.id,
        events: result.events,
        todos: result.todos,
        fetchedAt: new Date().toISOString(),
      })
      setSubs(loadSubscriptions())
      setCache(loadFeedCache())
      setLastResult(result)
    } catch {
      setError(`Could not reach the feed for “${sub.name}”. Check the URL and try again.`)
    } finally {
      setImporting(null)
    }
  }

  // The preview prefers a just-fetched result so the user immediately sees
  // what arrived; otherwise it falls back to the cached snapshot (offline
  // render between refreshes).
  const preview = (
    lastResult
      ? lastResult.events
      : (cache.find((c) => subs.some((s) => s.id === c.subscriptionId))?.events ?? [])
  ).slice(0, PREVIEW_LIMIT)

  return (
    <section id="calendar-subscriptions" className="panel scroll-mt-32 space-y-4 md:scroll-mt-24">
      <SectionHeader icon={CalendarClock} title="Calendar subscriptions" />
      <p className="text-xs text-tertiary">
        Show events from an iCal feed (Google / Outlook secret address) in your planner. Stored on
        this device only.
      </p>

      {subs.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-8 w-8" aria-hidden />}
          title="No calendars yet"
        >
          Subscribe to your first feed below — its events appear here and in the planner.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {subs.map((sub) => {
            const snapshot = cache.find((c) => c.subscriptionId === sub.id)
            return (
              <div
                key={sub.id}
                className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-3 sm:flex-row sm:items-center dark:border-(--hub-border)"
              >
                <span
                  className={`h-3 w-3 shrink-0 rounded-full ${DOT_CLASSES[sub.color]}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-strong">{sub.name}</p>
                  <p className="truncate text-xs text-tertiary">
                    {sub.kind} ·{' '}
                    {snapshot
                      ? `${snapshot.events.length} events cached`
                      : 'not imported yet — refresh'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => void refresh(sub)}
                    loading={importing === sub.id}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setSubs(removeSubscription(sub.id))}
                    aria-label={`Remove ${sub.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                  <Toggle
                    checked={sub.visible}
                    onChange={(next) => setSubs(updateSubscription(sub.id, { visible: next }))}
                    label="Show"
                    className="shrink-0"
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
        <TextField
          label="Name"
          placeholder="Course schedule"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="Feed URL (https)"
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
        />
        <div className="flex items-center gap-2">
          <select
            aria-label="Feed type"
            value={kind}
            onChange={(e) => setKind(e.target.value as 'ical' | 'caldav')}
            className="h-11 rounded-lg border border-neutral-200 bg-white px-2 text-sm dark:border-(--hub-border) dark:bg-(--hub-panel)"
          >
            <option value="ical">iCal feed</option>
            <option value="caldav">CalDAV</option>
          </select>
          <Button onClick={add}>
            <Plus className="h-4 w-4" aria-hidden /> Subscribe
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-secondary">
          {error}
        </p>
      ) : null}

      {preview.length > 0 ? (
        <div className="space-y-1 rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border)">
          <p className="text-xs font-semibold text-secondary">Next events</p>
          {preview.map((ev) => (
            <p key={ev.uid} className="flex flex-wrap items-center gap-2 text-sm text-secondary">
              <Badge tone="neutral">{ev.allDay ? ev.start : ev.start.replace('T', ' ')}</Badge>
              <span className="truncate">{ev.title}</span>
            </p>
          ))}
          {lastResult && lastResult.counts.todos > 0 ? (
            <p className="pt-1 text-xs text-tertiary">
              {lastResult.counts.todos} tasks (VTODO) also imported.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
