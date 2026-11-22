'use client'

/**
 * Repeat-config dialog (S3-47) — create/edit a task repetition rule over
 * /api/tasks-repeat-cfgs: cycle (d/w/m/y), interval, start/end, skip dates,
 * re-anchor mode, and the user-facing title (migration 034 persists it).
 *
 * Validation mirrors the handler boundary (zod shapes from core
 * `repeatCfgSchema` semantics): interval ≥ 1, end ≥ start, skip dates are
 * day-keys. Pure helpers exported for tests.
 */
import React, { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiSend } from '@/lib/transport'
import { Button, SelectField, Sheet, TextField } from '@/ui'

/** One repeat-config row as the handlers return it. */
export interface RepeatCfgRow {
  id: number
  title: string | null
  cycle: 'd' | 'w' | 'm' | 'y'
  interval: number
  startDate: string
  endDate: string | null
  skipDates: string[]
  reAnchor: 'scheduled' | 'completion' | 'postponed'
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Draft state of the dialog (strings — inputs validate on save). */
export interface RepeatCfgDraft {
  title: string
  cycle: RepeatCfgRow['cycle']
  interval: string
  startDate: string
  endDate: string
  skipDates: string[]
  reAnchor: RepeatCfgRow['reAnchor']
}

export function draftFromCfg(cfg: RepeatCfgRow | null, today: string): RepeatCfgDraft {
  return {
    title: cfg?.title ?? '',
    cycle: cfg?.cycle ?? 'w',
    interval: String(cfg?.interval ?? 1),
    startDate: cfg?.startDate ?? today,
    endDate: cfg?.endDate ?? '',
    skipDates: cfg?.skipDates ?? [],
    reAnchor: cfg?.reAnchor ?? 'completion',
  }
}

/** Validate a draft → field errors (empty string = valid). Empty end = no end. */
export function validateRepeatDraft(draft: RepeatCfgDraft): {
  interval: string
  startDate: string
  endDate: string
} {
  const intervalNum = Number(draft.interval)
  const interval =
    Number.isInteger(intervalNum) && intervalNum >= 1 && intervalNum <= 999
      ? ''
      : 'Interval must be a whole number between 1 and 999.'
  const startDate = DAY_RE.test(draft.startDate) ? '' : 'Start date must be YYYY-MM-DD.'
  let endDate = ''
  if (draft.endDate !== '') {
    if (!DAY_RE.test(draft.endDate)) endDate = 'End date must be YYYY-MM-DD.'
    else if (draft.endDate < draft.startDate) endDate = 'End date must not be before the start.'
  }
  return { interval, startDate, endDate }
}

export interface RepeatConfigDialogProps {
  /** Existing config to edit, or null to create one. */
  cfg: RepeatCfgRow | null
  open: boolean
  onClose: () => void
  /** Called with the saved row (parent links the task's repeatCfgId). */
  onSaved: (cfg: RepeatCfgRow) => void
  /** Today's day-key (client clock — anchors new rules). */
  today: string
}

export function RepeatConfigDialog({
  cfg,
  open,
  onClose,
  onSaved,
  today,
}: RepeatConfigDialogProps) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<RepeatCfgDraft>(() => draftFromCfg(cfg, today))
  const [skipInput, setSkipInput] = useState('')

  // Re-seed the draft when a different cfg opens.
  useEffect(() => {
    if (open) setDraft(draftFromCfg(cfg, today))
  }, [cfg, open, today])

  const patch = (partial: Partial<RepeatCfgDraft>) => setDraft((d) => ({ ...d, ...partial }))
  const errors = validateRepeatDraft(draft)
  const valid = errors.interval === '' && errors.startDate === '' && errors.endDate === ''

  const save = useMutation({
    mutationFn: (d: RepeatCfgDraft) => {
      const body = {
        title: d.title.trim() === '' ? null : d.title.trim(),
        cycle: d.cycle,
        interval: Number(d.interval),
        startDate: d.startDate,
        endDate: d.endDate === '' ? null : d.endDate,
        skipDates: d.skipDates,
        reAnchor: d.reAnchor,
      }
      return cfg !== null
        ? apiSend<{ repeatCfg: RepeatCfgRow }>(`/api/tasks-repeat-cfgs/${cfg.id}`, 'PATCH', body)
        : apiSend<{ repeatCfg: RepeatCfgRow }>('/api/tasks-repeat-cfgs', 'POST', body)
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['tasks-repeat-cfgs'] })
      onSaved(res.repeatCfg)
      onClose()
    },
  })

  const addSkipDate = () => {
    const v = skipInput.trim()
    if (v === '' || !DAY_RE.test(v) || draft.skipDates.includes(v)) return
    patch({ skipDates: [...draft.skipDates, v].sort() })
    setSkipInput('')
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={cfg === null ? 'New repeat rule' : 'Edit repeat rule'}
      footer={
        <div className="flex gap-2">
          <Button
            variant="primary"
            className="flex-1 text-xs"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate(draft)}
          >
            {cfg === null ? 'Create rule' : 'Save rule'}
          </Button>
          <Button variant="ghost" className="text-xs" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <TextField
          label="Rule name (optional)"
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="e.g. Weekly review"
        />
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Cycle"
            value={draft.cycle}
            onChange={(e) => patch({ cycle: e.target.value as RepeatCfgRow['cycle'] })}
          >
            <option value="d">Day(s)</option>
            <option value="w">Week(s)</option>
            <option value="m">Month(s)</option>
            <option value="y">Year(s)</option>
          </SelectField>
          <TextField
            label="Every N"
            type="number"
            min={1}
            max={999}
            value={draft.interval}
            onChange={(e) => patch({ interval: e.target.value })}
            error={errors.interval === '' ? undefined : errors.interval}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Start date"
            type="date"
            value={draft.startDate}
            onChange={(e) => patch({ startDate: e.target.value })}
            error={errors.startDate === '' ? undefined : errors.startDate}
          />
          <TextField
            label="End date (optional)"
            type="date"
            value={draft.endDate}
            onChange={(e) => patch({ endDate: e.target.value })}
            error={errors.endDate === '' ? undefined : errors.endDate}
          />
        </div>
        <SelectField
          label="When a date is missed, re-anchor on"
          value={draft.reAnchor}
          onChange={(e) => patch({ reAnchor: e.target.value as RepeatCfgRow['reAnchor'] })}
        >
          <option value="completion">
            Completion (next occurrence counts from when you finish)
          </option>
          <option value="scheduled">Schedule (keep the planned calendar dates)</option>
          <option value="postponed">Postpone (shift the whole series forward)</option>
        </SelectField>
        <div className="space-y-1.5">
          <p className="label">Skip dates</p>
          <div className="flex gap-2">
            <input
              type="date"
              className="input h-9 flex-1"
              value={skipInput}
              onChange={(e) => setSkipInput(e.target.value)}
              aria-label="Add a skip date"
            />
            <Button variant="ghost" className="text-xs" onClick={addSkipDate}>
              Add
            </Button>
          </div>
          {draft.skipDates.length === 0 ? (
            <p className="text-xs text-tertiary">No skipped dates.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {draft.skipDates.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 rounded border border-(--hub-border) bg-(--hub-panel-2) px-2 py-0.5 text-xs text-secondary"
                >
                  {d}
                  <button
                    type="button"
                    aria-label={`Remove skip date ${d}`}
                    className="text-tertiary hover:text-danger-text"
                    onClick={() => patch({ skipDates: draft.skipDates.filter((x) => x !== d) })}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        {save.isError && (
          <p className="text-xs text-danger-text" role="alert">
            {save.error instanceof Error ? save.error.message : 'Could not save the rule.'}
          </p>
        )}
      </div>
    </Sheet>
  )
}

export default RepeatConfigDialog
