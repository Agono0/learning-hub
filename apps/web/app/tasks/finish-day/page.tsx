'use client'

/**
 * Finish-day flow (S3-29) — the evening close-out at /tasks/finish-day.
 *
 * One calm pass, driven by `POST /api/tasks-finish-day` (batch D):
 * - **Summary**: tasks completed that day + tracked time (SP's day close);
 * - **Auto-archive**: the S3-11 pass result (young/old tiers) as a quiet
 *   line — the numbers, no drama;
 * - **Plan tomorrow**: still-open tasks due today each get a "→ tomorrow"
 *   reschedule, and W2's `PlanTomorrow` panel (S3-49) captures NEW tasks
 *   due tomorrow via the short syntax;
 * - **Celebration**: one felt line when the day closes — the sanctioned
 *   session-complete energy, at day scale.
 *
 * SSR-safe: the clock is an effect read; queries pending → skeleton.
 */
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CalendarCheck, PartyPopper } from 'lucide-react'
import { formatTracked } from '@learning-hub/core'
import { apiGet, apiSend } from '@/lib/transport'
import { Button, EmptyState, PageHeader, Skeleton } from '@/ui'
import { PlanTomorrow } from '@/components/tasks/PlanTomorrow'

export interface FinishDayResponse {
  day: string
  completedThatDay: Array<{ id: number; title: string }>
  trackedMs: number
  stillOpenForDay: Array<{ id: number; title: string; due: string | null }>
  archive: { archived: number[]; promoted: number[]; restored: number[] }
}
interface TasksResponse {
  tasks: import('@learning-hub/core').TaskItem[]
}
interface TagsResponse {
  tags: Array<{ id: number; name: string }>
}

/** The next calendar day for a `YYYY-MM-DD` key. */
export function tomorrowOf(day: string): string {
  return new Date(Date.parse(day) + 86_400_000).toISOString().slice(0, 10)
}

export default function FinishDayPage() {
  const qc = useQueryClient()
  const [today, setToday] = useState('')
  const [result, setResult] = useState<FinishDayResponse | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10))
  }, [])

  const tasksQ = useQuery({
    queryKey: ['tasks', 'finish-day'],
    queryFn: () => apiGet<TasksResponse>('/api/tasks?parentId=any&includeDone=1'),
  })
  const tagsQ = useQuery({
    queryKey: ['tasks-tags'],
    queryFn: () => apiGet<TagsResponse>('/api/tasks-tags'),
  })

  function invalidate(): void {
    void qc.invalidateQueries({ queryKey: ['tasks'] })
    void qc.invalidateQueries({ queryKey: ['tasks-planner'] })
    void qc.invalidateQueries({ queryKey: ['tasks-schedule'] })
  }

  const finishM = useMutation({
    mutationFn: (day: string) =>
      apiSend<FinishDayResponse>('/api/tasks-finish-day', 'POST', { day }),
    onSuccess: (res) => {
      setResult(res)
      invalidate()
    },
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not close the day'),
  })

  const rescheduleM = useMutation({
    mutationFn: (args: { id: number; due: string }) =>
      apiSend(`/api/tasks/${args.id}`, 'PATCH', { due: args.due, dueWithTime: false }),
    onSuccess: invalidate,
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not move the task'),
  })

  const tomorrow = useMemo(() => (today === '' ? '' : tomorrowOf(today)), [today])
  const tagNames = useMemo(() => {
    const map = new Map<number, string>()
    for (const t of tagsQ.data?.tags ?? []) map.set(t.id, t.name)
    return map
  }, [tagsQ.data])
  const loading = tasksQ.isLoading

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
      <PageHeader
        title="Finish the day"
        subtitle="Close out today, archive what is done, and set up tomorrow"
      />

      {pageError !== null && (
        <p role="alert" className="mb-4 text-sm text-danger-text">
          {pageError}
        </p>
      )}

      {result !== null && (
        <div className="panel mb-4 rounded-xl px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-strong">
            <PartyPopper className="size-5 text-status-success-text" aria-hidden />
            Day closed — {result.completedThatDay.length} task
            {result.completedThatDay.length === 1 ? '' : 's'} done,{' '}
            {formatTracked(result.trackedMs)} tracked.
          </p>
          <p className="mt-1 text-xs text-tertiary">
            Auto-archive moved {result.archive.archived.length} task
            {result.archive.archived.length === 1 ? '' : 's'} into the archive and promoted{' '}
            {result.archive.promoted.length} — the lists stay honest without you lifting a finger.
          </p>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          className="min-h-[44px]"
          onClick={() => today !== '' && finishM.mutate(today)}
          loading={finishM.isPending}
          disabled={today === ''}
        >
          <CalendarCheck className="size-4" aria-hidden />
          Close {today === '' ? 'the day' : today}
        </Button>
        <Link href="/tasks" className="btn-ghost min-h-[44px] px-3 leading-[44px]">
          Back to tasks
        </Link>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3" aria-hidden>
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : result === null ? (
        <EmptyState
          icon={<CalendarCheck className="size-8" aria-hidden />}
          title="The day is still open"
        >
          Press “Close” above when you are done working: the summary counts what you completed and
          tracked, the auto-archive pass files finished tasks away, and tomorrow gets planned below.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-tertiary">
              Completed today ({result.completedThatDay.length})
            </h2>
            {result.completedThatDay.length === 0 ? (
              <p className="text-sm text-tertiary">
                Nothing completed today — that is honest information too, not a failure.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {result.completedThatDay.map((t) => (
                  <li key={t.id} className="text-sm text-body">
                    ✓ {t.title}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-tertiary">
              Still open for today ({result.stillOpenForDay.length})
            </h2>
            {result.stillOpenForDay.length === 0 ? (
              <p className="text-sm text-tertiary">Today is fully clear.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {result.stillOpenForDay.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-body">{t.title}</span>
                    {tomorrow !== '' && (
                      <Button
                        variant="ghost"
                        className="min-h-[44px] px-2 py-1 text-xs"
                        onClick={() => rescheduleM.mutate({ id: t.id, due: tomorrow })}
                      >
                        → tomorrow
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {tomorrow !== '' && (
            <div>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-tertiary">
                Plan tomorrow
                <ArrowRight className="size-3.5" aria-hidden />
              </h2>
              <PlanTomorrow
                today={today}
                tasks={tasksQ.data?.tasks ?? []}
                tagNames={tagNames}
                onAdded={invalidate}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
