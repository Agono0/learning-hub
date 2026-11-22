'use client'

/**
 * Save-as-view bar (S3-85) — capture ANY filtered list's state (filter +
 * sort + group) as a named view row via POST /api/tasks-views (S3-17's
 * persisted `task_views`). List-agnostic by design: the boards page and the
 * Today/Inbox list both hand in whatever they currently filtered by.
 *
 * Confirm in place (the bar becomes the receipt) — no toast round-trip.
 */
import React, { useState } from 'react'
import { BookmarkPlus } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { apiSend } from '@/lib/transport'
import { Button, TextField } from '@/ui'

export interface SaveViewBarProps {
  /** The captured rule-chip filter (rule chips per core/boards.ts). */
  filter: Record<string, unknown>
  /** Current sort key (`null` = the view keeps manual order). */
  sortBy?: string | null
  /** Current grouping key. */
  groupBy?: string | null
  /** Called after a successful save (parent may refresh its view list). */
  onSaved?: (view: { id: number; name: string }) => void
}

export function SaveViewBar({ filter, sortBy, groupBy, onSaved }: SaveViewBarProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [savedName, setSavedName] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: (viewName: string) =>
      apiSend<{ view: { id: number; name: string } }>('/api/tasks-views', 'POST', {
        name: viewName,
        kind: 'custom',
        filter,
        sortBy: sortBy ?? null,
        groupBy: groupBy ?? null,
      }),
    onSuccess: (res) => {
      setSavedName(res.view.name)
      setOpen(false)
      setName('')
      onSaved?.(res.view)
    },
  })

  if (savedName !== null) {
    return (
      <div className="flex items-center gap-2" role="status">
        <BookmarkPlus className="size-4 text-status-success-text" aria-hidden />
        <span className="text-xs text-status-success-text">Saved “{savedName}”</span>
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setSavedName(null)}>
          Save another
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      {open ? (
        <>
          <div className="min-w-[200px] flex-1">
            <TextField
              label="View name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="View name for the current filters"
            />
          </div>
          <Button
            variant="primary"
            className="text-xs"
            disabled={name.trim().length === 0 || save.isPending}
            onClick={() => save.mutate(name.trim())}
          >
            Save view
          </Button>
          <Button
            variant="ghost"
            className="text-xs"
            onClick={() => {
              setOpen(false)
              setName('')
            }}
          >
            Cancel
          </Button>
          {save.isError && (
            <p className="w-full text-xs text-danger-text" role="alert">
              {save.error instanceof Error ? save.error.message : 'Could not save the view.'}
            </p>
          )}
        </>
      ) : (
        <Button variant="secondary" className="text-xs" onClick={() => setOpen(true)}>
          <BookmarkPlus className="size-3.5" aria-hidden /> Save as view
        </Button>
      )}
    </div>
  )
}

export default SaveViewBar
