'use client'

/**
 * Dopamine-detox onboarding wizard for /settings — wires the previously-
 * orphaned `/api/onboarding/detox` endpoint: the 10 one-time steps persisted
 * in `user_settings.detoxWizard`. Collapsed by default so the settings page
 * stays calm; the wizard only earns space once the user opens it.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, ChevronRight, Circle } from 'lucide-react'
import { useState } from 'react'
import { apiGet, apiSend } from '@/lib/transport'
import { cx } from '@/ui/cx'

export interface DetoxWizardProps {
  className?: string
}

interface DetoxStep {
  id: string
  label: string
  detail: string
}

interface DetoxResponse {
  steps: DetoxStep[]
  state: Record<string, boolean>
  done: boolean
}

/**
 * Renders the 10 detox steps with per-step completion toggles. Each toggle is
 * one POST (merge into the JSON state); progress = completed/total.
 */
export function DetoxWizard({ className }: DetoxWizardProps) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ['onboarding-detox'],
    queryFn: () => apiGet<DetoxResponse>('/api/onboarding/detox'),
  })

  const toggle = useMutation({
    mutationFn: (step: string) =>
      apiSend<{ ok: boolean; state: Record<string, boolean>; done: boolean }>(
        '/api/onboarding/detox',
        'POST',
        { step, done: !(q.data?.state[step] === true) },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['onboarding-detox'] })
    },
  })

  const steps = q.data?.steps ?? []
  const state = q.data?.state ?? {}
  const completed = steps.filter((s) => state[s.id] === true).length

  return (
    <div className={cx('panel', className)} data-testid="detox-wizard">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Focus onboarding — dopamine detox
        </span>
        <span
          className={cx(
            'rounded-full border px-2.5 py-0.5 text-xs font-bold',
            q.data?.done
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-neutral-300 text-neutral-500 dark:border-(--hub-border) dark:text-neutral-400',
          )}
        >
          {completed}/{steps.length || 10}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {q.isLoading ? (
            <div className="h-24 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
          ) : q.isError ? (
            <p className="text-xs text-rose-600 dark:text-rose-400">Could not load the wizard.</p>
          ) : (
            <>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                One-time setup that makes every later focus session easier. Steps persist here —
                no streaks, no shame if a step waits a day.
              </p>
              <ol className="space-y-1.5">
                {steps.map((s, i) => {
                  const isDone = state[s.id] === true
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => toggle.mutate(s.id)}
                        disabled={toggle.isPending}
                        className={cx(
                          'flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition-colors',
                          isDone
                            ? 'border-emerald-500/30 bg-emerald-500/5'
                            : 'border-neutral-200 hover:border-indigo-300 dark:border-(--hub-border)',
                        )}
                        aria-pressed={isDone}
                      >
                        {isDone ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        ) : (
                          <Circle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                        )}
                        <span className="min-w-0">
                          <span
                            className={cx(
                              'block text-xs font-semibold',
                              isDone
                                ? 'text-neutral-400 line-through dark:text-neutral-500'
                                : 'text-neutral-800 dark:text-neutral-100',
                            )}
                          >
                            {i + 1}. {s.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                            {s.detail}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  )
}
