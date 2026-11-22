'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { Badge, Callout, EmptyState, Skeleton } from '@/ui'
import { apiGet } from '@/lib/transport'

/**
 * Row shape of GET /api/focus/max/history (subset the UI renders).
 */
export interface MaxFocusHistorySession {
  id: number
  startedAt: string
  endedAt: string | null
  plannedMinutes: number
  actualMinutes: number | null
  task: string | null
  state: string | null
  exitReason: string | null
  tier: string | null
}

export interface MaxFocusHistoryExit {
  id: number
  sessionId: number | null
  reflection: string | null
  proceeded: boolean
  createdAt: string
}

/** Human copy per unlock reason (the session machine's union, M2-01). */
export const EXIT_REASON_LABELS: Record<string, string> = {
  timer: 'ran to completion',
  pin: 'exited with PIN + reason',
  battery: 'unlocked — battery low',
  failure: 'unlocked — watchdog failure',
  tamper: 'unlocked — tamper detected',
}

/** Tone per unlock reason — one hue per meaning (danger stays rose). */
export const EXIT_REASON_TONES: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  timer: 'success',
  pin: 'warning',
  battery: 'warning',
  failure: 'danger',
  tamper: 'danger',
}

/**
 * Max Focus session history (M2-25): recent locked sessions (with their
 * persisted lock state, exit reason and tier) plus the exit reflections from
 * the append-only friction log. Data comes from GET /api/focus/max/history
 * (M2-04); presentation only.
 */
export function MaxFocusSessionHistory() {
  const history = useQuery({
    queryKey: ['focus-max-history'],
    queryFn: () =>
      apiGet<{ ok: boolean; sessions: MaxFocusHistorySession[]; exits: MaxFocusHistoryExit[] }>(
        '/api/focus/max/history',
      ),
  })

  const sessions = history.data?.sessions ?? []
  const exits = history.data?.exits ?? []

  return (
    <div className="panel space-y-3">
      <p className="label flex items-center gap-2">
        <History className="h-4 w-4 text-indigo-400" /> Max Focus history
      </p>

      {history.isLoading ? (
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : history.isError ? (
        <Callout tone="danger" title="Couldn't load Max Focus history">
          {(history.error as Error | null)?.message ?? 'Please try again in a moment.'}
        </Callout>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<History className="h-6 w-6" aria-hidden />}
          title="No Max Focus sessions yet"
        >
          Locked blocks — and how they ended — will be listed here.
        </EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-neutral-200 text-sm dark:divide-(--hub-border)">
            {sessions.map((s) => {
              const running = s.endedAt === null
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-neutral-700 dark:text-neutral-200">
                      {s.task ?? 'Max Focus session'}
                    </p>
                    <p className="text-xs text-tertiary">
                      {new Date(s.startedAt).toLocaleString()} · planned {s.plannedMinutes}m
                      {s.actualMinutes != null ? ` · actual ${s.actualMinutes}m` : ''}
                      {s.tier ? ` · ${s.tier} tier` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {s.exitReason && (
                      <Badge tone={EXIT_REASON_TONES[s.exitReason] ?? 'neutral'}>
                        {EXIT_REASON_LABELS[s.exitReason] ?? s.exitReason}
                      </Badge>
                    )}
                    {running && (
                      <Badge tone="accent" pulse>
                        running
                      </Badge>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {exits.length > 0 && (
            <div className="space-y-1.5">
              <p className="label">Exit reflections (friction log)</p>
              <ul className="space-y-1">
                {exits.map((e) => (
                  <li key={e.id} className="text-xs text-tertiary">
                    <span className="text-secondary">
                      {new Date(e.createdAt).toLocaleDateString()}:
                    </span>{' '}
                    {e.reflection ?? '(no reflection recorded)'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default MaxFocusSessionHistory
