'use client'

/**
 * SimpleCounters (S3-31) — the SP-parity simple-counter section.
 *
 * Free-floating counters with per-day taps, rendered UNDER the habits loop
 * on /habits (SP keeps both; habits stay untouched). Each card shows the
 * tap total, the current streak and best streak (core `counterStreak`,
 * S3-90's SP rule: an untapped today does not break the streak — the day
 * is still open), and the one primary action: the +1 tap (POST increment,
 * which upsert-accumulates the (counter, day) row server-side).
 *
 * Creation (label + color) and archive/delete are the secondary actions.
 * All reads/writes go through the batch-D counters routes; SSR renders the
 * skeleton (clock is an effect read).
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { counterStreak } from '@learning-hub/core'
import { apiGet, apiSend } from '@/lib/transport'
import { Badge, Button, EmptyState, Skeleton, TextField } from '@/ui'
import { cx } from '@/ui/cx'
import { SectionHeader } from '@/components/ui/section-header'

interface CounterRow {
  id: number
  label: string
  color: string | null
  archived: boolean
}
interface CountersResponse {
  counters: CounterRow[]
}
interface CounterDetailResponse {
  counter: CounterRow
  logs: Array<{ day: string; count: number }>
}

const PALETTE = ['indigo', 'teal', 'amber', 'rose', 'lime', 'neutral'] as const
type PaletteKey = (typeof PALETTE)[number]

function colorDot(color: string | null): string {
  const map: Record<string, string> = {
    neutral: 'bg-neutral-400',
    indigo: 'bg-indigo-500',
    teal: 'bg-teal-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    lime: 'bg-lime-500',
  }
  return map[color ?? 'neutral'] ?? 'bg-neutral-400'
}

function CounterCard({
  counter,
  today,
  onChanged,
}: {
  counter: CounterRow
  today: string
  onChanged: () => void
}) {
  const detail = useQuery({
    queryKey: ['tasks-counters', counter.id, 'logs'],
    queryFn: () => apiGet<CounterDetailResponse>(`/api/tasks-counters/${counter.id}`),
  })
  const tapM = useMutation({
    mutationFn: () =>
      apiSend(`/api/tasks-counters/${counter.id}/increment`, 'POST', { day: today }),
    onSuccess: onChanged,
  })
  const archiveM = useMutation({
    mutationFn: () => apiSend(`/api/tasks-counters/${counter.id}`, 'PATCH', { archived: true }),
    onSuccess: onChanged,
  })
  const deleteM = useMutation({
    mutationFn: () => apiSend(`/api/tasks-counters/${counter.id}`, 'DELETE'),
    onSuccess: onChanged,
  })

  const logs = detail.data?.logs ?? []
  const streak = counterStreak(logs, today)
  const total = logs.reduce((sum, l) => sum + l.count, 0)

  return (
    <li className="panel flex flex-col gap-2 rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span aria-hidden className={cx('size-3 shrink-0 rounded-full', colorDot(counter.color))} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-strong">
          {counter.label}
        </span>
        <Button
          className="min-h-[44px] px-3"
          onClick={() => tapM.mutate()}
          loading={tapM.isPending}
          aria-label={`Tap ${counter.label}`}
        >
          <Plus className="size-4" aria-hidden />1
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {streak.current > 0 && <Badge tone="success">{streak.current}-day streak</Badge>}
        {streak.best > streak.current && <Badge tone="neutral">best {streak.best}</Badge>}
        {total > 0 && <Badge tone="neutral">{total} total</Badge>}
        {logs.some((l) => l.day === today) && <Badge tone="accent">tapped today</Badge>}
      </div>
      <div className="flex gap-1.5">
        {counter.archived && (
          <Button
            variant="ghost"
            className="min-h-[44px] px-2 py-1 text-xs"
            onClick={() => archiveM.mutate()}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Restore
          </Button>
        )}
        {!counter.archived && (
          <Button
            variant="ghost"
            className="min-h-[44px] px-2 py-1 text-xs text-tertiary"
            onClick={() => archiveM.mutate()}
          >
            <Archive className="size-3.5" aria-hidden />
            Archive
          </Button>
        )}
        <Button
          variant="ghost"
          className="min-h-[44px] px-2 py-1 text-xs text-danger-text"
          onClick={() => deleteM.mutate()}
          aria-label={`Delete ${counter.label}`}
        >
          <Trash2 className="size-3.5" aria-hidden />
          Delete
        </Button>
      </div>
    </li>
  )
}

export interface SimpleCountersProps {
  /** Client day-key (null until mounted — SSR-safe). */
  today: string | null
}

export function SimpleCounters({ today }: SimpleCountersProps) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [color, setColor] = useState<PaletteKey>('indigo')
  const [showArchived, setShowArchived] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  const countersQ = useQuery({
    queryKey: ['tasks-counters', 'all'],
    queryFn: () => apiGet<CountersResponse>('/api/tasks-counters?all=1'),
  })

  function invalidate(): void {
    void qc.invalidateQueries({ queryKey: ['tasks-counters'] })
  }

  const createM = useMutation({
    mutationFn: () => apiSend('/api/tasks-counters', 'POST', { label: name.trim(), color }),
    onSuccess: () => {
      setName('')
      invalidate()
    },
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not create the counter'),
  })

  const counters = countersQ.data?.counters ?? []
  const visible = useMemo(
    () => (showArchived ? counters : counters.filter((c) => !c.archived)),
    [counters, showArchived],
  )
  const archivedCount = counters.filter((c) => c.archived).length
  const loading = countersQ.isLoading

  return (
    <div>
      <SectionHeader
        title="Simple counters"
        count={counters.filter((c) => !c.archived).length}
        action={
          archivedCount > 0 ? (
            <Button
              variant="ghost"
              className="min-h-[44px] px-2 py-1 text-xs"
              onClick={() => setShowArchived((v) => !v)}
              aria-pressed={showArchived}
            >
              {showArchived ? 'Hide archived' : `Archived (${archivedCount})`}
            </Button>
          ) : undefined
        }
      />
      <form
        className="mb-3 mt-2 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim().length > 0) createM.mutate()
        }}
      >
        <TextField
          label="New counter"
          className="min-w-48 flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Water"
        />
        <div className="flex gap-1.5">
          {PALETTE.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={color === key}
              aria-label={`Color ${key}`}
              onClick={() => setColor(key)}
              className={cx(
                'size-11 rounded-lg border-2 p-2.5 transition-colors',
                color === key ? 'border-(--ac-strong)' : 'border-transparent',
              )}
            >
              <span className={cx('block size-5 rounded-full', colorDot(key))} />
            </button>
          ))}
        </div>
        <Button
          type="submit"
          className="min-h-[44px]"
          disabled={name.trim().length === 0 || createM.isPending}
          loading={createM.isPending}
        >
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </form>

      {countersQ.error !== null && (
        <p role="alert" className="mb-2 text-sm text-danger-text">
          Counters could not be loaded — try again.
        </p>
      )}

      {loading ? (
        <ul className="flex flex-col gap-2" aria-hidden>
          {Array.from({ length: 2 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-24 w-full rounded-xl" />
            </li>
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <EmptyState title="No counters yet">
          A counter is a free-floating tap counter (water, page count, reps) with streak math —
          create one above; habits live in the loop above this panel.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((c) => (
            <CounterCard key={c.id} counter={c} today={today ?? ''} onChanged={invalidate} />
          ))}
        </ul>
      )}

      {pageError !== null && (
        <p role="alert" className="mt-3 text-sm text-danger-text">
          {pageError}
        </p>
      )}
    </div>
  )
}
