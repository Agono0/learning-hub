'use client'

/**
 * Worklog (S3-28) — tracked-time history: day/week rollups, per-task totals,
 * inline corrections, CSV export.
 *
 * Data lives in W1's S3-18 surface, read through the hub transport (rule 1):
 * `GET /api/tasks-worklog?from&to` for the rollups, `GET /api/tasks-time?
 * from&to` for the session rows (the correction targets), `DELETE
 * /api/tasks-time/[id]` for an inline correction (SP semantics: a wrong
 * session is deleted and the task's per-day map is re-derived server-side —
 * never hand-patched), and `GET /api/tasks-worklog/export` for the CSV
 * (through `apiDownload`, so native shells save with the dialog).
 *
 * Honest states: an empty range renders the empty state, not zeros dressed
 * up as activity. Corrections are two-tap (Delete → Confirm) — no modal
 * detour for a one-row undo-able-by-recreate action. SSR-safe: ranges are
 * client-only (effect-set), so server markup matches hydration.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Download, History, Trash2 } from 'lucide-react'
import { apiDownload, apiGet, apiSend } from '@/lib/transport'
import { Badge, Button, EmptyState, PageHeader, Tabs } from '@/ui'
import { ClayIn } from '@/lib/motion'

/** The `GET /api/tasks-worklog` rollup shape (S3-18). */
export interface WorklogRollup {
  from: string
  to: string
  totalMs: number
  perDay: Array<{ day: string; totalMs: number }>
  perTask: Array<{ taskId: number; title: string | null; totalMs: number }>
  logCount: number
}

/** One session row (`GET /api/tasks-time` → `logs`, mirrors core TimeLog). */
export interface SessionLog {
  id: number
  taskId: number
  day: string
  sessionMs: number
  startedAt: string | null
  source: 'manual' | 'focus' | 'idle'
}

/** Range keys the tabs switch between. */
type RangeKey = 'day' | 'week'

/** Local `YYYY-MM-DD` (client-only; SSR renders the pending shell). */
function localDayKey(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Calm duration text: minutes under an hour, otherwise `1h 24m` style. */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0m'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export default function WorklogPage() {
  const qc = useQueryClient()
  const [range, setRange] = useState<RangeKey>('day')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)

  // Hydration-safe: ranges are computed after mount so server markup (the
  // pending shell) matches the first client render.
  useEffect(() => {
    setTo(localDayKey(0))
    setFrom(localDayKey(range === 'day' ? 0 : -6))
  }, [range])

  const rollup = useQuery<WorklogRollup>({
    queryKey: ['tasks-worklog', from, to],
    queryFn: () => apiGet<WorklogRollup>('/api/tasks-worklog', { from, to }),
    enabled: from !== '' && to !== '',
  })

  const sessions = useQuery<{ logs: SessionLog[]; totalMs: number }>({
    queryKey: ['tasks-time', from, to],
    queryFn: () => apiGet<{ logs: SessionLog[]; totalMs: number }>('/api/tasks-time', { from, to }),
    enabled: from !== '' && to !== '',
  })

  /** Task titles for the session rows (the /api/tasks-time rows carry ids). */
  const titleByTask = useMemo(() => {
    const map = new Map<number, string>()
    for (const t of rollup.data?.perTask ?? []) {
      if (t.title) map.set(t.taskId, t.title)
    }
    return map
  }, [rollup.data])

  const deleteSession = useMutation({
    mutationFn: async (id: number) => {
      await apiSend(`/api/tasks-time/${id}`, 'DELETE')
    },
    onSuccess: () => {
      setConfirmingId(null)
      void qc.invalidateQueries({ queryKey: ['tasks-worklog'] })
      void qc.invalidateQueries({ queryKey: ['tasks-time'] })
    },
  })

  const exportCsv = async () => {
    setExporting(true)
    try {
      await apiDownload(
        `/api/tasks-worklog/export?from=${from}&to=${to}`,
        `worklog-${from}-to-${to}.csv`,
      )
    } finally {
      setExporting(false)
    }
  }

  const data = rollup.data
  const maxDayMs = Math.max(1, ...(data?.perDay.map((d) => d.totalMs) ?? [1]))
  const hasActivity = (data?.totalMs ?? 0) > 0 || (sessions.data?.logs.length ?? 0) > 0

  return (
    <div className="space-y-6">
      <ClayIn>
        <PageHeader
          icon={<History className="h-6 w-6 text-indigo-400" />}
          title="Worklog"
          subtitle="Where your tracked time actually went — day by day, task by task"
        />
      </ClayIn>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<RangeKey>
          label="Worklog range"
          value={range}
          onChange={setRange}
          items={[
            { key: 'day', label: 'Today' },
            { key: 'week', label: 'This week' },
          ]}
        />
        <Button variant="secondary" onClick={() => void exportCsv()} loading={exporting}>
          <Download className="h-4 w-4" aria-hidden /> Export CSV
        </Button>
      </div>

      {rollup.isLoading || sessions.isLoading ? (
        <p className="text-sm text-tertiary">Loading your tracked time…</p>
      ) : !hasActivity ? (
        <EmptyState
          icon={<CalendarDays className="h-8 w-8" aria-hidden />}
          title="No tracked time yet"
        >
          Start tracking from a task (Today) or a focus session — the sessions land here.
        </EmptyState>
      ) : (
        <>
          <ClayIn>
            <section className="panel space-y-4" aria-label="Time rollups">
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="text-2xl font-semibold text-strong">{formatMs(data?.totalMs ?? 0)}</p>
                <Badge tone="neutral">
                  {range === 'day' ? 'today' : `${data?.from ?? from} → ${data?.to ?? to}`}
                </Badge>
                <span className="text-xs text-tertiary">
                  {data?.logCount ?? 0} session{(data?.logCount ?? 0) === 1 ? '' : 's'}
                </span>
              </div>

              {(data?.perDay.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-secondary">Per day</h3>
                  {data?.perDay.map((d) => (
                    <div key={d.day} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-xs text-tertiary">{d.day}</span>
                      <div
                        className="h-2 rounded-full bg-indigo-500/70"
                        style={{ width: `${Math.max(4, (d.totalMs / maxDayMs) * 100)}%` }}
                        role="img"
                        aria-label={`${d.day}: ${formatMs(d.totalMs)}`}
                      />
                      <span className="text-xs text-secondary">{formatMs(d.totalMs)}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {(data?.perTask.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-secondary">Per task</h3>
                  <ul className="space-y-1">
                    {data?.perTask.map((t) => (
                      <li
                        key={t.taskId}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="min-w-0 truncate text-secondary">
                          {t.title ?? `Task #${t.taskId}`}
                        </span>
                        <span className="shrink-0 text-xs text-tertiary">
                          {formatMs(t.totalMs)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          </ClayIn>

          <ClayIn>
            <section className="panel space-y-3" aria-label="Tracked sessions">
              <h2 className="text-sm font-semibold text-strong">
                Sessions ({sessions.data?.logs.length ?? 0})
              </h2>
              <p className="text-xs text-tertiary">
                Logged something twice? Delete the wrong session — the task&apos;s per-day map is
                re-derived automatically.
              </p>
              <ul className="space-y-2">
                {sessions.data?.logs.map((log) => (
                  <li
                    key={log.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border)"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-strong">
                        {titleByTask.get(log.taskId) ?? `Task #${log.taskId}`}
                      </p>
                      <p className="text-xs text-tertiary">
                        {log.day} · {formatMs(log.sessionMs)} · {log.source}
                        {log.startedAt ? ` · started ${log.startedAt.slice(11, 16)}` : ''}
                      </p>
                    </div>
                    {confirmingId === log.id ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => deleteSession.mutate(log.id)}
                          loading={deleteSession.isPending}
                        >
                          Confirm delete
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirmingId(null)}>
                          Keep
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={() => setConfirmingId(log.id)}
                        aria-label={`Delete the ${formatMs(log.sessionMs)} session on ${log.day}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {deleteSession.isError ? (
                <p role="alert" className="text-sm text-secondary">
                  That correction didn&apos;t stick — try again.
                </p>
              ) : null}
            </section>
          </ClayIn>
        </>
      )}
    </div>
  )
}
