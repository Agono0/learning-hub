'use client'

/**
 * Remedial-pause panel for /curriculum — wires the previously-orphaned
 * `/api/curriculum/graph/remedial` endpoint: checks a concept's prerequisite
 * chain against REAL skill mastery and returns the honest verdict (blocked
 * with the blocking concept, or clear to proceed).
 */
import { useQuery } from '@tanstack/react-query'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import type { RemedialCheckResult } from '@learning-hub/core/knowledge-graph'
import { apiGet } from '@/lib/transport'
import { cx } from '@/ui/cx'

export interface RemedialPanelProps {
  /** Skill/concept titles offered as quick checks (from the curriculum list) */
  concepts?: { id: number; title: string }[]
  className?: string
}

interface RemedialResponse {
  ok: boolean
  result: RemedialCheckResult
}

/**
 * Pick a concept, get the verdict. The server resolves mastery from real
 * skill rows matched by name — this panel adds no fabricated mastery data.
 */
export function RemedialPanel({ concepts = [], className }: RemedialPanelProps) {
  const [conceptId, setConceptId] = useState('')

  const q = useQuery({
    queryKey: ['curriculum-remedial', conceptId],
    enabled: conceptId.length > 0,
    queryFn: () =>
      apiGet<RemedialResponse>(
        `/api/curriculum/graph/remedial?conceptId=${encodeURIComponent(conceptId)}`,
      ),
  })

  return (
    <div className={cx('panel space-y-3', className)} data-testid="remedial-panel">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
        <ShieldCheck className="h-4 w-4 text-ac-text" />
        Prerequisite check
      </h3>
      <p className="text-xs text-tertiary dark:text-faint">
        The knowledge graph can pause a concept whose prerequisites are still weak — better 3 days
        on a foundation than 3 weeks re-learning a collapsed floor.
      </p>
      {concepts.length > 0 ? (
        <select
          value={conceptId}
          onChange={(e) => setConceptId(e.target.value)}
          aria-label="Concept to check"
          className="w-full rounded-lg border border-neutral-300 bg-transparent px-2 py-2 text-sm dark:border-(--hub-border)"
        >
          <option value="">Choose a concept…</option>
          {concepts.map((c) => (
            <option key={c.id} value={c.title}>
              {c.title}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-xs text-tertiary dark:text-faint">
          Import a curriculum to enable prerequisite checks — the graph builds from course units.
        </p>
      )}

      {q.isLoading && conceptId && (
        <div className="h-12 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
      )}
      {q.isError && (
        <p className="text-xs text-danger-text dark:text-danger-text">Check failed — retry.</p>
      )}
      {q.data?.result && (
        <div
          className={cx(
            'flex items-start gap-2.5 rounded-xl border p-3 text-xs',
            q.data.result.blocked
              ? 'border-amber-500/30 bg-amber-500/5 text-status-warning-text dark:text-status-warning-text'
              : 'border-emerald-500/30 bg-emerald-500/5 text-status-success-text dark:text-status-success-text',
          )}
        >
          {q.data.result.blocked ? (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div>
            <strong>{q.data.result.blocked ? 'Pause recommended' : 'Clear to proceed'}</strong>
            {q.data.result.reason && <p className="mt-1 leading-relaxed">{q.data.result.reason}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
