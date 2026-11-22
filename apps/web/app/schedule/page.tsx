'use client'

/**
 * Schedule (S3-26) — the 30-day timeline view.
 *
 * One row per day (`GET /api/tasks-schedule?days=30`, batch D): each day's
 * tasks render as BLOCKS SIZED BY ESTIMATE — a block's width is its share
 * of the day's total estimated time (SP's proportional bars), floored so
 * estimate-less tasks stay visible. Deadline-only tasks surface on their
 * deadline day; `deadlinePassed` renders the hard-date flag (S3-63).
 *
 * Tray mode: unscheduled tasks collapse into a tray above the timeline —
 * drag a chip onto a day row to schedule it (PATCH due), drag between days
 * to re-schedule. Calendar events (S3-27 feed cache, visible calendars)
 * underline their day's blocks.
 *
 * SSR-safe: queries pending → skeleton; the clock and feed caches are
 * effect-only reads.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ChevronDown, ChevronRight, Clock } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { loadFeedCache, loadSubscriptions, type CalendarFeedCache } from '@/lib/calendar-feeds'
import { Badge, EmptyState, PageHeader, Skeleton } from '@/ui'
import { cx } from '@/ui/cx'

interface ScheduleBlock {
  id: number
  title: string
  estimateMs: number | null
  trackedMs: number
  priority: string
  deadline: string | null
  deadlinePassed: boolean
  due: string | null
}
interface ScheduleResponse {
  today: string
  days: Array<{ day: string; trackedMs: number; blocks: ScheduleBlock[] }>
  overdue: Array<{ id: number; title: string; due: string | null; estimateMs: number | null }>
}
interface TasksResponse {
  tasks: Array<{ id: number; title: string; due: string | null }>
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/**
 * A block's width share of its day row, in percent — its estimate over the
 * day's total (floored at 14% so estimate-less tasks stay grabbable),
 * clamped to 100.
 */
export function blockShare(estimateMs: number | null, dayTotalMs: number): number {
  if (dayTotalMs <= 0 || estimateMs === null || estimateMs <= 0) return 14
  return Math.max(14, Math.min(100, Math.round((estimateMs / dayTotalMs) * 100)))
}

/** `Mon 09/03` label for a day key. */
export function dayLabel(day: string): string {
  const date = new Date(`${day}T12:00:00.000Z`)
  return `${WEEKDAYS[date.getUTCDay()]} ${day.slice(8, 10)}/${day.slice(5, 7)}`
}

export default function SchedulePage() {
  const qc = useQueryClient()
  const [today, setToday] = useState('')
  const [trayOpen, setTrayOpen] = useState(true)
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null)
  const [feedCache, setFeedCache] = useState<CalendarFeedCache[]>([])
  const [visibleSubIds, setVisibleSubIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10))
    setFeedCache(loadFeedCache())
    setVisibleSubIds(
      new Set(
        loadSubscriptions()
          .filter((s) => s.visible)
          .map((s) => s.id),
      ),
    )
  }, [])

  const scheduleQ = useQuery({
    queryKey: ['tasks-schedule'],
    queryFn: () => apiGet<ScheduleResponse>('/api/tasks-schedule?days=30'),
  })
  const tasksQ = useQuery({
    queryKey: ['tasks', 'tray'],
    queryFn: () => apiGet<TasksResponse>('/api/tasks?parentId=top'),
  })

  function invalidate(): void {
    void qc.invalidateQueries({ queryKey: ['tasks-schedule'] })
    void qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  const scheduleM = useMutation({
    mutationFn: (args: { id: number; due: string }) =>
      apiSend(`/api/tasks/${args.id}`, 'PATCH', { due: args.due, dueWithTime: false }),
    onSuccess: invalidate,
  })

  const days = scheduleQ.data?.days ?? []
  const overdue = scheduleQ.data?.overdue ?? []
  const tray = useMemo(
    () => (tasksQ.data?.tasks ?? []).filter((t) => t.due === null),
    [tasksQ.data],
  )
  const loading = scheduleQ.isLoading || tasksQ.isLoading

  function dropOn(day: string): void {
    if (draggingTaskId === null) return
    scheduleM.mutate({ id: draggingTaskId, due: day })
    setDraggingTaskId(null)
  }

  const visibleEvents = useMemo(() => {
    const out: Array<{ uid: string; title: string; day: string; time: string | null }> = []
    for (const feed of feedCache) {
      if (!visibleSubIds.has(feed.subscriptionId)) continue
      for (const event of feed.events) {
        const day = event.start.slice(0, 10)
        if (!days.some((d) => d.day === day)) continue
        out.push({
          uid: event.uid,
          title: event.title,
          day,
          time: event.allDay ? null : event.start.slice(11, 16),
        })
      }
    }
    return out
  }, [feedCache, visibleSubIds, days])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-4">
      <PageHeader title="Schedule" subtitle="The next 30 days, sized by estimate" />

      {/* Tray mode — unscheduled tasks collapse into a drag source. */}
      <div className="panel mb-4 rounded-xl">
        <button
          type="button"
          onClick={() => setTrayOpen((v) => !v)}
          aria-expanded={trayOpen}
          className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-strong"
        >
          {trayOpen ? (
            <ChevronDown className="size-4" aria-hidden />
          ) : (
            <ChevronRight className="size-4" aria-hidden />
          )}
          Unscheduled ({tray.length}) — drag onto a day to schedule
        </button>
        {trayOpen && (
          <ul className="flex flex-wrap gap-1.5 border-t border-neutral-200 px-3 py-2 dark:border-(--hub-border)">
            {tray.map((t) => (
              <li
                key={t.id}
                draggable
                onDragStart={() => setDraggingTaskId(t.id)}
                className={cx(
                  'cursor-grab rounded-full bg-neutral-100 px-3 py-1.5 text-sm text-body dark:bg-(--hub-panel-2)',
                  draggingTaskId === t.id && 'opacity-50',
                )}
              >
                {t.title}
              </li>
            ))}
            {tray.length === 0 && (
              <li className="text-sm text-tertiary">Every open task has a day.</li>
            )}
          </ul>
        )}
      </div>

      {overdue.length > 0 && (
        <div className="mb-4 rounded-xl border border-danger-text/40 bg-rose-600/10 px-3 py-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-danger-text">
            <Clock className="size-4" aria-hidden />
            From previous days ({overdue.length})
          </p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {overdue.map((t) => (
              <li
                key={t.id}
                draggable
                onDragStart={() => setDraggingTaskId(t.id)}
                className="cursor-grab rounded-full bg-white px-3 py-1.5 text-sm text-danger-text dark:bg-(--hub-panel-2)"
              >
                {t.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <ul className="flex flex-col gap-2" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-20 w-full rounded-xl" />
            </li>
          ))}
        </ul>
      ) : days.every((d) => d.blocks.length === 0) && tray.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-8" aria-hidden />}
          title="Nothing scheduled yet"
        >
          Schedule a task from the tray above, or give one a due date from the Tasks page — it lands
          here as a block sized by its estimate.
        </EmptyState>
      ) : (
        <ol className="flex flex-col gap-2">
          {days.map((d) => {
            const totalEstimate = d.blocks.reduce((sum, b) => sum + (b.estimateMs ?? 0), 0)
            const dayEvents = visibleEvents.filter((e) => e.day === d.day)
            return (
              <li key={d.day}>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropOn(d.day)}
                  aria-label={`Day ${d.day} — drop tasks here to schedule`}
                  className={cx(
                    'panel rounded-xl px-3 py-2',
                    draggingTaskId !== null && 'ring-1 ring-(--ac-strong)',
                    d.day === today && 'border-2 border-(--ac-strong)',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-strong">
                      {dayLabel(d.day)}
                      {d.day === today && <span className="text-tertiary"> · today</span>}
                    </p>
                    {d.trackedMs > 0 && (
                      <Badge tone="neutral">{Math.round(d.trackedMs / 60_000)}m tracked</Badge>
                    )}
                  </div>
                  {d.blocks.length > 0 ? (
                    <div className="mt-1.5 flex h-11 gap-1">
                      {d.blocks.map((b) => (
                        <div
                          key={b.id}
                          draggable
                          onDragStart={() => setDraggingTaskId(b.id)}
                          style={{ flexBasis: `${blockShare(b.estimateMs, totalEstimate)}%` }}
                          className={cx(
                            'flex min-w-0 cursor-grab flex-col justify-center overflow-hidden rounded-lg px-2 text-xs',
                            b.deadlinePassed
                              ? 'bg-rose-600/15 text-danger-text'
                              : 'bg-neutral-100 text-body dark:bg-(--hub-panel-2)',
                            draggingTaskId === b.id && 'opacity-50',
                          )}
                          title={`${b.title}${b.estimateMs !== null ? ` — ${Math.round(b.estimateMs / 60_000)}m estimate` : ''}`}
                        >
                          <span className="truncate font-medium">{b.title}</span>
                          {b.estimateMs !== null && (
                            <span className="truncate text-tertiary">
                              {Math.round(b.estimateMs / 60_000)}m
                              {b.deadline !== null && b.deadlinePassed ? ' · deadline passed' : ''}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-tertiary">Open day</p>
                  )}
                  {dayEvents.length > 0 && (
                    <ul className="mt-1.5 flex flex-col gap-0.5 border-t border-neutral-200 pt-1.5 dark:border-(--hub-border)">
                      {dayEvents.map((ev) => (
                        <li key={ev.uid} className="flex items-center gap-1 text-xs text-tertiary">
                          <CalendarDays className="size-3 shrink-0" aria-hidden />
                          {ev.time !== null && <span className="font-medium">{ev.time}</span>}
                          <span className="min-w-0 flex-1 truncate">{ev.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
