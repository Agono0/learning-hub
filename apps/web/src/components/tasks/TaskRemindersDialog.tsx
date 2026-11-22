'use client'

/**
 * Per-task reminders dialog (S3-48) — list/add/remove reminders for one
 * task over /api/tasks-reminders (at_time = clock moment, relative =
 * offset from the due moment; `exactAlarm` flags the Android path), plus
 * the GLOBAL toggles (master switch + quiet hours) through the single
 * settings PUT — so the per-task surface and the policy live in one calm
 * place.
 *
 * Pure helpers exported for tests: relative-offset ↔ label math and the
 * add-form validation.
 */
import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Trash2 } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Button, IconButton, SelectField, Sheet, TextField, Toggle } from '@/ui'

/** One reminder row as the handlers return it (core TaskReminder over JSON). */
export interface TaskReminderRow {
  id: number
  taskId: number
  type: 'at_time' | 'relative'
  remindAt: string | null
  offsetMs: number | null
  exactAlarm: boolean
  createdAt: string
}

/** The settings fields the dialog's global section reads/writes. */
export interface ReminderGlobals {
  remindersEnabled: boolean
  remindersQuietStart: string
  remindersQuietEnd: string
}

const OFFSET_CHOICES: Array<{ label: string; ms: number }> = [
  { label: 'At due time', ms: 0 },
  { label: '15 min before', ms: -15 * 60_000 },
  { label: '1 hour before', ms: -60 * 60_000 },
  { label: '3 hours before', ms: -3 * 60 * 60_000 },
  { label: '1 day before', ms: -24 * 60 * 60_000 },
  { label: '10 min after', ms: 10 * 60_000 },
]

/** Human label for a stored relative offset (`15 min before`). */
export function offsetLabel(ms: number): string {
  const found = OFFSET_CHOICES.find((c) => c.ms === ms)
  if (found) return found.label
  const sign = ms < 0 ? 'before' : 'after'
  const abs = Math.abs(ms)
  const m = Math.round(abs / 60_000)
  if (m < 60) return `${m} min ${sign}`
  const h = Math.floor(m / 60)
  return m % 60 === 0 ? `${h}h ${sign}` : `${h}h ${m % 60}m ${sign}`
}

/** Validate the add form for the chosen type (empty string = valid). */
export function validateReminderForm(
  type: 'at_time' | 'relative',
  remindAt: string,
  offsetMs: number,
): string {
  if (type === 'at_time') {
    if (remindAt === '' || Number.isNaN(Date.parse(remindAt))) {
      return 'Pick a date and time for the reminder.'
    }
    return ''
  }
  if (!Number.isInteger(offsetMs)) return 'Pick an offset from the list.'
  return ''
}

export interface TaskRemindersDialogProps {
  taskId: number
  taskTitle: string
  open: boolean
  onClose: () => void
  /** Today for context copy (quiet-hours framing). */
  today?: string
}

export function TaskRemindersDialog({
  taskId,
  taskTitle,
  open,
  onClose,
}: TaskRemindersDialogProps) {
  const qc = useQueryClient()
  const [type, setType] = useState<'at_time' | 'relative'>('at_time')
  const [remindAt, setRemindAt] = useState('')
  const [offsetMs, setOffsetMs] = useState(0)
  const [exactAlarm, setExactAlarm] = useState(false)

  const reminders = useQuery({
    queryKey: ['tasks-reminders', taskId],
    queryFn: () =>
      apiGet<{ reminders: TaskReminderRow[] }>(`/api/tasks-reminders?taskId=${taskId}`),
    enabled: open,
  })

  const globals = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiGet<{ settings: ReminderGlobals }>('/api/settings'),
    enabled: open,
  })

  // Reset the add-form whenever the dialog opens for a task.
  useEffect(() => {
    if (open) {
      setType('at_time')
      setRemindAt('')
      setOffsetMs(0)
      setExactAlarm(false)
    }
  }, [open, taskId])

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['tasks-reminders', taskId] })
    void qc.invalidateQueries({ queryKey: ['settings'] })
  }

  const add = useMutation({
    mutationFn: () => {
      const error = validateReminderForm(type, remindAt, offsetMs)
      if (error !== '') throw new Error(error)
      return apiSend<{ reminder: TaskReminderRow }>('/api/tasks-reminders', 'POST', {
        taskId,
        type,
        remindAt: type === 'at_time' ? new Date(remindAt).toISOString() : null,
        offsetMs: type === 'relative' ? offsetMs : null,
        exactAlarm,
      })
    },
    onSuccess: () => {
      invalidate()
      setRemindAt('')
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => apiSend(`/api/tasks-reminders/${id}`, 'DELETE'),
    onSuccess: invalidate,
  })

  const setGlobal = useMutation({
    mutationFn: (patch: Partial<ReminderGlobals>) => apiSend('/api/settings', 'PUT', patch),
    onSuccess: invalidate,
  })

  const rows = reminders.data?.reminders ?? []
  const s = globals.data?.settings

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Reminders — ${taskTitle}`}
      footer={
        <Button variant="secondary" className="w-full text-xs" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Existing reminders */}
        {rows.length === 0 ? (
          <p className="text-xs text-tertiary">No reminders on this task yet.</p>
        ) : (
          <ul className="space-y-1">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-neutral-700 dark:text-neutral-200">
                  <Bell className="mr-1 inline size-3.5 text-indigo-400" aria-hidden />
                  {r.type === 'at_time'
                    ? (r.remindAt ?? '').replace('T', ' ').slice(0, 16)
                    : offsetLabel(r.offsetMs ?? 0)}
                  {r.exactAlarm && (
                    <span className="ml-2 text-xs uppercase tracking-wide text-tertiary">
                      exact
                    </span>
                  )}
                </span>
                <IconButton
                  label="Remove reminder"
                  size="sm"
                  className="text-tertiary hover:text-danger-text"
                  onClick={() => remove.mutate(r.id)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
        )}

        {/* Add form */}
        <div className="space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-(--hub-border)">
          <p className="label">Add reminder</p>
          <SelectField
            label="Kind"
            value={type}
            onChange={(e) => setType(e.target.value as 'at_time' | 'relative')}
          >
            <option value="at_time">At a specific time</option>
            <option value="relative">Relative to the due moment</option>
          </SelectField>
          {type === 'at_time' ? (
            <TextField
              label="Date and time"
              type="datetime-local"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
            />
          ) : (
            <SelectField
              label="Offset from due"
              value={String(offsetMs)}
              onChange={(e) => setOffsetMs(Number(e.target.value))}
            >
              {OFFSET_CHOICES.map((c) => (
                <option key={c.ms} value={String(c.ms)}>
                  {c.label}
                </option>
              ))}
            </SelectField>
          )}
          <Toggle
            label="Use Android exact alarm (fires within the minute)"
            checked={exactAlarm}
            onChange={setExactAlarm}
          />
          {add.isError && (
            <p className="text-xs text-danger-text" role="alert">
              {add.error instanceof Error ? add.error.message : 'Could not add the reminder.'}
            </p>
          )}
          <Button
            variant="primary"
            className="w-full text-xs"
            disabled={add.isPending}
            onClick={() => add.mutate()}
          >
            Add reminder
          </Button>
        </div>

        {/* Global policy (single settings PUT, M2-21 guard applies upstream) */}
        <div className="space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-(--hub-border)">
          <p className="label">Global reminder policy</p>
          {s === undefined ? (
            <p className="text-xs text-tertiary">Loading policy…</p>
          ) : (
            <>
              <Toggle
                label="Reminders enabled"
                checked={s.remindersEnabled === true}
                onChange={(next) => setGlobal.mutate({ remindersEnabled: next })}
              />
              <p className="text-xs text-tertiary">
                Quiet hours {s.remindersQuietStart}–{s.remindersQuietEnd} (change in Settings).
              </p>
            </>
          )}
        </div>
      </div>
    </Sheet>
  )
}

export default TaskRemindersDialog
