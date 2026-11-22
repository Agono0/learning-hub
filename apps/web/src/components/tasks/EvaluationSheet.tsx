'use client'

/**
 * Evaluation sheet (S3-50) — the daily reflection: impact (1–4) and energy
 * (1–3) pickers plus a reflection note, persisted per day through
 * POST /api/tasks-metrics (the metricDays upsert — handler S3-19).
 *
 * Pure helpers exported for tests: the scale definitions and the tone map
 * (higher impact = stronger accent; low energy = warning, not danger —
 * tiredness is information, not failure).
 */
import React, { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Battery, Sparkles } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Button, TextArea } from '@/ui'

/** Impact scale (SP parity: 1 = drift, 4 = deep meaningful progress). */
export const IMPACT_SCALE: ReadonlyArray<{ value: 1 | 2 | 3 | 4; label: string }> = [
  { value: 1, label: 'Drifted' },
  { value: 2, label: 'Some progress' },
  { value: 3, label: 'Good progress' },
  { value: 4, label: 'Deep work landed' },
]

/** Energy scale (SP parity: 1–3). */
export const ENERGY_SCALE: ReadonlyArray<{ value: 1 | 2 | 3; label: string }> = [
  { value: 1, label: 'Running low' },
  { value: 2, label: 'Steady' },
  { value: 3, label: 'Charged' },
]

/** Row tone for the energy pick: low energy is information, never danger. */
export function energyTone(value: 1 | 2 | 3): 'warning' | 'accent' | 'neutral' {
  return value === 1 ? 'warning' : value === 3 ? 'accent' : 'neutral'
}

/** One metricDays row as the handler returns it. */
export interface MetricDayRow {
  day: string
  metrics: Record<string, number>
  impact: number | null
  energy: number | null
  reflection: string | null
}

export interface EvaluationSheetProps {
  /** The day being evaluated (`YYYY-MM-DD`). */
  day: string
  /** Called after a save (parent refetches charts). */
  onSaved?: () => void
}

export function EvaluationSheet({ day, onSaved }: EvaluationSheetProps) {
  const existing = useQuery({
    queryKey: ['tasks-metrics', day],
    queryFn: () => apiGet<{ days: MetricDayRow[] }>(`/api/tasks-metrics?from=${day}&to=${day}`),
  })

  const [impact, setImpact] = useState<number | null>(null)
  const [energy, setEnergy] = useState<number | null>(null)
  const [reflection, setReflection] = useState('')

  // Seed from the persisted row once it loads (only while untouched).
  useEffect(() => {
    const row = existing.data?.days.find((d) => d.day === day)
    if (row) {
      setImpact((prev) => prev ?? row.impact)
      setEnergy((prev) => prev ?? row.energy)
      setReflection((prev) => (prev === '' ? (row.reflection ?? '') : prev))
    }
  }, [existing.data, day])

  const save = useMutation({
    mutationFn: () =>
      apiSend<{ day: MetricDayRow }>('/api/tasks-metrics', 'POST', {
        day,
        impact,
        energy,
        reflection: reflection.trim() === '' ? null : reflection.trim(),
      }),
    onSuccess: () => onSaved?.(),
  })

  return (
    <div className="panel space-y-4">
      <p className="label flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-indigo-400" /> How did {day} land?
      </p>

      <fieldset className="space-y-1.5">
        <legend className="text-xs text-secondary">Impact</legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Impact today">
          {IMPACT_SCALE.map((s) => (
            <Button
              key={s.value}
              variant={impact === s.value ? 'primary' : 'ghost'}
              className="rounded-full px-3 py-1.5 text-xs"
              role="radio"
              aria-checked={impact === s.value}
              onClick={() => setImpact(s.value)}
            >
              {s.value} · {s.label}
            </Button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="flex items-center gap-1.5 text-xs text-secondary">
          <Battery className="h-3.5 w-3.5" aria-hidden /> Energy
        </legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Energy today">
          {ENERGY_SCALE.map((s) => (
            <Button
              key={s.value}
              variant={energy === s.value ? 'primary' : 'ghost'}
              className="rounded-full px-3 py-1.5 text-xs"
              role="radio"
              aria-checked={energy === s.value}
              onClick={() => setEnergy(s.value)}
            >
              {s.value} · {s.label}
            </Button>
          ))}
        </div>
      </fieldset>

      <TextArea
        label="Reflection (optional)"
        placeholder="What moved, what stalled, what you would repeat."
        value={reflection}
        onChange={(e) => setReflection(e.target.value)}
        maxLength={2000}
      />

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          className="text-xs"
          disabled={
            save.isPending || (impact === null && energy === null && reflection.trim() === '')
          }
          onClick={() => save.mutate()}
        >
          Save evaluation
        </Button>
        {save.isSuccess && (
          <span className="text-xs text-status-success-text" role="status">
            Logged for {day}
          </span>
        )}
        {save.isError && (
          <span className="text-xs text-danger-text" role="alert">
            {save.error instanceof Error ? save.error.message : 'Could not save — try again.'}
          </span>
        )}
      </div>
    </div>
  )
}

export default EvaluationSheet
