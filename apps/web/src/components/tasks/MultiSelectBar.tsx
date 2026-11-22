'use client'

/**
 * MultiSelectBar (S3-20) — the bulk-action bar for selected tasks.
 *
 * Appears (fixed above the tab bar) only when a selection exists: count,
 * the two calm primaries (complete, won't-do), and clear. Everything else
 * (project/tag moves) stays in the detail panel — one primary action per
 * state, per the design law. Bulk ops go through `/api/tasks/bulk`, the
 * single batch path.
 */
import React from 'react'
import { Ban, CheckCheck, X } from 'lucide-react'
import { Button } from '@/ui'

export interface MultiSelectBarProps {
  count: number
  busy: boolean
  onComplete: () => void
  onWontdo: () => void
  onClear: () => void
}

export function MultiSelectBar({
  count,
  busy,
  onComplete,
  onWontdo,
  onClear,
}: MultiSelectBarProps) {
  if (count === 0) return null
  return (
    <div
      role="toolbar"
      aria-label={`${count} tasks selected`}
      className="panel fixed inset-x-3 bottom-20 z-30 flex items-center gap-2 rounded-2xl px-3 py-2 shadow-lg md:bottom-4"
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-strong">
        {count} selected
      </span>
      <Button variant="secondary" onClick={onWontdo} disabled={busy} className="min-h-[44px]">
        <Ban className="size-4" aria-hidden />
        Won&rsquo;t do
      </Button>
      <Button onClick={onComplete} loading={busy} className="min-h-[44px]">
        <CheckCheck className="size-4" aria-hidden />
        Complete
      </Button>
      <Button variant="ghost" onClick={onClear} disabled={busy} aria-label="Clear selection">
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  )
}
