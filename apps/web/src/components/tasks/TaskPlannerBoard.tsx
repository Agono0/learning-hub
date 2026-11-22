'use client'

/**
 * TaskPlannerBoard (S3-25) — the SP-parity task planner section.
 *
 * Day columns over the batch-D `/api/tasks-planner` read: each column shows
 * the tasks due that day, tracked vs estimated workload and a CAPACITY %
 * badge (device-local daily-capacity setting, `lh-planner-capacity-minutes`
 * in localStorage — no server setting column needed). Subscribed calendar
 * events (S3-27 feed cache, visible calendars only) render inside their
 * day column.
 *
 * Drag-to-schedule: unscheduled tasks (no due) sit in a TRAY above the
 * columns; dragging a chip onto a column PATCHes the task's `due` to that
 * day (re-scheduling between columns works the same way). S3-82 touch
 * fallback: chips are ALSO tap-to-arm / columns tap-to-place — the same
 * drop path, no HTML5 drag needed (touch has no draggable support). The
 * OVERDUE row sits above everything with a one-tap "→ today" reschedule.
 *
 * SSR-safe: queries stay pending at render (skeleton), the capacity and
 * feed caches are localStorage reads confined to effects.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarDays } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { loadFeedCache, loadSubscriptions, type CalendarFeedCache } from '@/lib/calendar-feeds'
import { Badge, Button, Skeleton } from '@/ui'
import { cx } from '@/ui/cx'
import { SectionHeader } from '@/components/ui/section-header'

interface PlannerColumnTask {
  id: number
  title: string
  estimateMs: number | null
  priority: string
  projectId: number | null
  due: string | null
}
interface PlannerResponse {
  start: string
  days: Array<{
    day: string
    estimatedMs: number
    trackedMs: number
    tasks: PlannerColumnTask[]
  }>
  overdue: Array<{ id: number; title: string; due: string | null; estimateMs: number | null }>
}
interface TasksResponse {
  tasks: Array<{ id: number; title: string; due: string | null; estimateMs: number | null }>
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const CAPACITY_KEY = 'lh-planner-capacity-minutes'
/** SP's calm default: 8 focused hours a day. */
const DEFAULT_CAPACITY_MINUTES = 480

/** `Wed 25/11`-style short label for a `YYYY-MM-DD` column. */
export function dayLabel(day: string): string {
  const date = new Date(`${day}T12:00:00.000Z`)
  const weekday = WEEKDAYS[date.getUTCDay()]
  return `${weekday} ${day.slice(8, 10)}/${day.slice(5, 7)}`
}

/** Workload share of the daily capacity, clamped for display (999%+ = 999). */
export function capacityPct(estimatedMs: number, capacityMinutes: number): number {
  if (capacityMinutes <= 0) return 0
  return Math.min(999, Math.round((estimatedMs / (capacityMinutes * 60_000)) * 100))
}

/** Calendar events (visible subscriptions) landing on `day`. */
export function eventsForDay(cache: CalendarFeedCache[], day: string, visible: Set<string>) {
  const out: Array<{ uid: string; title: string; time: string | null; color: string }> = []
  for (const feed of cache) {
    if (!visible.has(feed.subscriptionId)) continue
    for (const event of feed.events) {
      if (event.start.slice(0, 10) !== day) continue
      out.push({
        uid: event.uid,
        title: event.title,
        time: event.allDay ? null : event.start.slice(11, 16),
        color: 'accent',
      })
    }
  }
  return out
}

export function TaskPlannerBoard() {
  const qc = useQueryClient()
  const [capacityMinutes, setCapacityMinutes] = useState<number | null>(null)
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null)
  const [feedCache, setFeedCache] = useState<CalendarFeedCache[]>([])
  const [visibleSubIds, setVisibleSubIds] = useState<Set<string>>(new Set())

  // Device-local capacity + feed caches are browser-only reads (SSR-safe).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CAPACITY_KEY)
      setCapacityMinutes(
        raw === null ? DEFAULT_CAPACITY_MINUTES : Number(raw) || DEFAULT_CAPACITY_MINUTES,
      )
    } catch {
      setCapacityMinutes(DEFAULT_CAPACITY_MINUTES)
    }
    setFeedCache(loadFeedCache())
    setVisibleSubIds(
      new Set(
        loadSubscriptions()
          .filter((s) => s.visible)
          .map((s) => s.id),
      ),
    )
  }, [])

  function setCapacity(next: number): void {
    const clamped = Math.max(0, Math.min(24 * 60, Math.round(next)))
    setCapacityMinutes(clamped)
    try {
      window.localStorage.setItem(CAPACITY_KEY, String(clamped))
    } catch {
      /* private mode — session-only capacity */
    }
  }

  const plannerQ = useQuery({
    queryKey: ['tasks-planner'],
    queryFn: () => apiGet<PlannerResponse>('/api/tasks-planner?days=7'),
  })
  const tasksQ = useQuery({
    queryKey: ['tasks', 'tray'],
    queryFn: () => apiGet<TasksResponse>('/api/tasks?parentId=top'),
  })

  function invalidate(): void {
    void qc.invalidateQueries({ queryKey: ['tasks-planner'] })
    void qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  const scheduleM = useMutation({
    mutationFn: (args: { id: number; due: string }) =>
      apiSend(`/api/tasks/${args.id}`, 'PATCH', { due: args.due, dueWithTime: false }),
    onSuccess: invalidate,
  })

  const columns = plannerQ.data?.days ?? []
  const overdue = plannerQ.data?.overdue ?? []
  const tray = useMemo(
    () => (tasksQ.data?.tasks ?? []).filter((t) => t.due === null),
    [tasksQ.data],
  )
  const loading = plannerQ.isLoading || tasksQ.isLoading
  const today = plannerQ.data?.start ?? ''

  function dropOn(day: string): void {
    if (draggingTaskId === null) return
    scheduleM.mutate({ id: draggingTaskId, due: day })
    setDraggingTaskId(null)
  }

  return (
    <div className="mt-8">
      <SectionHeader
        icon={CalendarDays}
        title="Task planner — next 7 days"
        action={
          capacityMinutes !== null ? (
            <label className="flex items-center gap-1.5 text-xs text-tertiary">
              Capacity
              <input
                type="number"
                min={0}
                max={1440}
                step={30}
                value={capacityMinutes}
                onChange={(e) => setCapacity(Number(e.target.value))}
                aria-label="Daily capacity in minutes"
                className="input w-20 px-2 py-1"
              />
              min
            </label>
          ) : undefined
        }
      />

      {plannerQ.error !== null && (
        <p role="alert" className="mt-2 text-sm text-danger-text">
          The planner could not be loaded — try again.
        </p>
      )}

      {/* Overdue row — SP's red "from previous days". */}
      {!plannerQ.isLoading && overdue.length > 0 && (
        <div className="mt-3 rounded-xl border border-danger-text/40 bg-rose-600/10 px-3 py-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-danger-text">
            <AlertTriangle className="size-4" aria-hidden />
            Overdue — from previous days ({overdue.length})
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {overdue.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-body">{t.title}</span>
                {today !== '' && (
                  <Button
                    variant="ghost"
                    className="min-h-[44px] px-2 py-1 text-xs"
                    onClick={() => scheduleM.mutate({ id: t.id, due: today })}
                  >
                    → today
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Unscheduled tray — drag a chip onto a day column. */}
      <div
        className="mt-3 rounded-xl border border-dashed border-neutral-300 px-3 py-2 dark:border-(--hub-border)"
        aria-label="Unscheduled tasks — drag onto a day"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">
          Unscheduled ({tray.length}) — drag onto a day
        </p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {tray.map((t) => (
            <li
              key={t.id}
              draggable
              onDragStart={() => setDraggingTaskId(t.id)}
              onClick={() => setDraggingTaskId((prev) => (prev === t.id ? null : t.id))}
              aria-pressed={draggingTaskId === t.id}
              className={cx(
                'cursor-grab rounded-full bg-neutral-100 px-3 py-1.5 text-sm text-body dark:bg-(--hub-panel-2)',
                draggingTaskId === t.id && 'opacity-50 ring-2 ring-(--ac-strong)',
              )}
            >
              {t.title}
            </li>
          ))}
          {tray.length === 0 && (
            <li className="text-sm text-tertiary">Nothing waiting — every open task has a day.</li>
          )}
        </ul>
      </div>

      {loading ? (
        <div className="scroll-x mt-3 flex gap-2 pb-2" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-56 w-44 shrink-0 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="scroll-x mt-3 flex gap-2 pb-2">
          {columns.map((col) => {
            const pct = capacityPct(col.estimatedMs, capacityMinutes ?? DEFAULT_CAPACITY_MINUTES)
            const events = eventsForDay(feedCache, col.day, visibleSubIds)
            return (
              <div
                key={col.day}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropOn(col.day)}
                onClick={() => dropOn(col.day)}
                aria-label={`Day ${col.day} — drop or tap a selected task here to schedule`}
                className={cx(
                  'panel flex w-44 shrink-0 flex-col gap-1.5 rounded-xl px-2.5 py-2',
                  draggingTaskId !== null && 'ring-1 ring-(--ac-strong)',
                  col.day === today && 'border-2 border-(--ac-strong)',
                )}
              >
                <p className="text-sm font-semibold text-strong">{dayLabel(col.day)}</p>
                <div className="flex flex-wrap items-center gap-1">
                  <Badge tone={pct > 100 ? 'danger' : pct > 80 ? 'warning' : 'neutral'}>
                    {pct}% capacity
                  </Badge>
                  {col.trackedMs > 0 && (
                    <Badge tone="neutral">{Math.round(col.trackedMs / 60_000)}m done</Badge>
                  )}
                </div>
                <ul className="flex flex-col gap-1">
                  {col.tasks.map((t) => (
                    <li
                      key={t.id}
                      draggable
                      onDragStart={() => setDraggingTaskId(t.id)}
                      className={cx(
                        'cursor-grab rounded-lg bg-neutral-100 px-2 py-1.5 text-xs text-body dark:bg-(--hub-panel-2)',
                        draggingTaskId === t.id && 'opacity-50',
                      )}
                    >
                      {t.title}
                      {t.estimateMs !== null && (
                        <span className="text-tertiary">
                          {' '}
                          · {Math.round(t.estimateMs / 60_000)}m
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {events.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-1 border-t border-neutral-200 pt-1.5 dark:border-(--hub-border)">
                    {events.map((ev) => (
                      <li key={ev.uid} className="flex items-center gap-1 text-xs text-tertiary">
                        <CalendarDays className="size-3 shrink-0" aria-hidden />
                        {ev.time !== null && <span className="font-medium">{ev.time}</span>}
                        <span className="min-w-0 flex-1 truncate">{ev.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
