'use client'

/**
 * Recently-deleted trash view (S3-76) — the 30-day safety net UI over the
 * device-local store (`@/lib/task-trash`) and the core TTL math (S3-12).
 * Restore re-POSTs the snapshot via /api/tasks/[id]/restore and drops the
 * entry; the purge clears expired rows now (the read path also purges
 * lazily). Honest states: empty trash, days-left per row, danger when the
 * entry is about to expire.
 */
import React, { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { RotateCcw, Trash2 } from 'lucide-react'
import type { TrashEntry } from '@learning-hub/core'
import {
  expiredTrashIds,
  listTrashEntries,
  purgeExpiredEntries,
  restoreFromTrash,
} from '@/lib/task-trash'
import { Badge, Button, EmptyState, IconButton } from '@/ui'

/** Days-left badge tone: ≤3 days warns, 0 days is the purge edge. */
export function expiryTone(daysLeft: number): 'warning' | 'danger' | 'neutral' {
  if (daysLeft <= 0) return 'danger'
  if (daysLeft <= 3) return 'warning'
  return 'neutral'
}

export interface TrashViewProps {
  /** Client `today` day-key (drives TTL math; null until mounted — SSR-safe). */
  today: string | null
  /** Called after a restore (the parent refetches the task list). */
  onRestored?: (taskId: number) => void
}

export function TrashView({ today, onRestored }: TrashViewProps) {
  const [entries, setEntries] = useState<TrashEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Read + lazy-purge on mount (the store's read path is pure per `now`).
  useEffect(() => {
    if (today === null) return
    setEntries(listTrashEntries(today))
    setLoaded(true)
  }, [today])

  const restore = useMutation({
    mutationFn: (taskId: number) => {
      if (today === null) throw new Error('Clock not ready — try again.')
      return restoreFromTrash(taskId)
    },
    onSuccess: (next, taskId) => {
      setEntries(next)
      setError(null)
      onRestored?.(taskId)
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not restore — try again.'),
  })

  const purge = useMutation({
    mutationFn: async () => {
      if (today === null) throw new Error('Clock not ready — try again.')
      return purgeExpiredEntries(today)
    },
    onSuccess: () => {
      if (today !== null) setEntries(listTrashEntries(today))
      setError(null)
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not purge — try again.'),
  })

  if (today === null) return null // hydration-safe: clock not mounted yet

  const expired = expiredTrashIds(today)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="label">Recently deleted (30 days)</p>
        {expired.length > 0 && (
          <Button
            variant="ghost"
            className="px-2 py-1 text-xs"
            disabled={purge.isPending}
            onClick={() => purge.mutate()}
          >
            <Trash2 className="size-3.5" aria-hidden /> Purge {expired.length} expired
          </Button>
        )}
      </div>

      {error !== null && (
        <p className="text-xs text-danger-text" role="alert">
          {error}
        </p>
      )}

      {!loaded ? (
        <p className="text-xs text-tertiary">Loading trash…</p>
      ) : entries.length === 0 ? (
        <EmptyState icon={<Trash2 className="h-6 w-6" aria-hidden />} title="Trash is empty">
          Deleted tasks rest here for 30 days — restore them any time before that.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-neutral-200 text-sm dark:divide-(--hub-border)">
          {entries.map((e) => {
            const daysLeft = Math.ceil(
              (Date.parse(e.deletedAt) + 30 * 86_400_000 - Date.parse(`${today}T00:00:00.000Z`)) /
                86_400_000,
            )
            return (
              <li key={e.taskId} className="flex items-center justify-between gap-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-neutral-700 dark:text-neutral-200">{e.title}</p>
                  <p className="text-xs text-tertiary">
                    deleted {e.deletedAt.slice(0, 10)} · via {e.deletedVia.replace('-', ' ')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={expiryTone(daysLeft)}>{daysLeft}d left</Badge>
                  <IconButton
                    label={`Restore ${e.title}`}
                    size="sm"
                    className="text-status-success-text"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(e.taskId)}
                  >
                    <RotateCcw className="size-4" aria-hidden />
                  </IconButton>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default TrashView
