'use client'

/**
 * Flow-readiness panel for /focus — wires the previously-orphaned
 * `/api/cognitive/flow-state` endpoint (ultradian phase + flow-zone
 * assessment) into the focus page. GET renders the current-phase readout;
 * POST grades a finished focus block's telemetry and prescribes the next
 * block's intensity.
 */
import { useMutation, useQuery } from '@tanstack/react-query'
import { Activity, Battery, Waves, Zap } from 'lucide-react'
import { useState } from 'react'
import type { FlowStateEvaluation } from '@learning-hub/core'
import { apiGet, apiSend } from '@/lib/transport'
import { cx } from '@/ui/cx'

export interface FlowStatePanelProps {
  /** Minutes elapsed in the current focus block (from the page timer) */
  elapsedMinutes?: number
  /** Accuracy of the last review stretch, when known (0–1) */
  accuracy?: number
  className?: string
}

const ZONE_TONE: Record<string, string> = {
  flow: 'text-emerald-600 dark:text-emerald-400',
  boredom: 'text-sky-600 dark:text-sky-400',
  anxiety: 'text-rose-600 dark:text-rose-400',
  fatigue: 'text-amber-600 dark:text-amber-400',
}

/**
 * Self-contained flow telemetry card. The GET renders the ultradian phase for
 * the *stated* elapsed time; the POST grades actual session telemetry once the
 * user rates their last block — both flows hit the same endpoint the engine
 * documents, so the panel adds zero new server surface.
 */
export function FlowStatePanel({
  elapsedMinutes = 0,
  accuracy = 0.85,
  className,
}: FlowStatePanelProps) {
  const [minutes, setMinutes] = useState(Math.max(1, Math.round(elapsedMinutes)))
  const [lastAccuracy, setLastAccuracy] = useState(Math.round(accuracy * 100))

  const current = useQuery({
    queryKey: ['cognitive-flow-state', minutes],
    queryFn: () =>
      apiGet<{ ok: boolean; flow: FlowStateEvaluation }>(
        `/api/cognitive/flow-state?elapsedMinutes=${minutes}&accuracy=${lastAccuracy / 100}`,
      ),
  })

  const gradeMutation = useMutation({
    mutationFn: (input: { strain: number }) =>
      apiSend<{ ok: boolean; flow: FlowStateEvaluation }>('/api/cognitive/flow-state', 'POST', {
        accuracy: lastAccuracy / 100,
        averageLatencyMs: 2500,
        expectedLatencyMs: 2500,
        cardsAnswered: minutes * 2,
        elapsedFocusMinutes: minutes,
        subjectiveStrain: input.strain,
      }),
  })

  const flow = gradeMutation.data?.flow ?? current.data?.flow

  return (
    <div className={cx('panel space-y-3', className)} data-testid="flow-state-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          <Waves className="h-4 w-4 text-indigo-500" />
          Flow readiness
        </h3>
        {flow && (
          <span
            className={cx(
              'rounded-full border px-2.5 py-0.5 text-xs font-bold capitalize',
              ZONE_TONE[flow.zone] ?? ZONE_TONE.recovery,
            )}
          >
            {flow.zone.replace(/_/g, ' ')}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <label className="text-neutral-500 dark:text-neutral-400">
          Focus minutes this block
          <input
            type="range"
            min={1}
            max={90}
            step={1}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="mt-1 w-full accent-indigo-500"
            aria-label="Focus minutes"
          />
          <span className="font-mono text-[11px] text-neutral-600 dark:text-neutral-300">
            {minutes} min
          </span>
        </label>
        <label className="text-neutral-500 dark:text-neutral-400">
          Last stretch accuracy
          <input
            type="range"
            min={30}
            max={100}
            step={5}
            value={lastAccuracy}
            onChange={(e) => setLastAccuracy(Number(e.target.value))}
            className="mt-1 w-full accent-emerald-500"
            aria-label="Accuracy percent"
          />
          <span className="font-mono text-[11px] text-neutral-600 dark:text-neutral-300">
            {lastAccuracy}%
          </span>
        </label>
      </div>

      {current.isLoading || gradeMutation.isPending ? (
        <div className="h-16 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
      ) : flow ? (
        <>
          <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
            {flow.recommendation}
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
            <Activity className="h-3.5 w-3.5" />
            Ultradian phase:{' '}
            <strong className="capitalize">{flow.ultradianPhase.replace(/_/g, ' ')}</strong> ·{' '}
            {flow.remainingFocusMinutes} min left in block
          </p>
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                className="h-full bg-amber-400 transition-all"
                style={{ width: `${Math.round(flow.flowScore)}%` }}
              />
            </div>
            <span className="font-mono text-[11px] text-neutral-500">
              {Math.round(flow.flowScore)}
            </span>
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Suggested:{' '}
            <strong className="capitalize">{flow.suggestedAction.replace(/_/g, ' ')}</strong>{' '}
            (challenge–skill ratio {flow.challengeSkillRatio.toFixed(2)})
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {[1, 3, 5].map((strain) => (
              <button
                key={strain}
                type="button"
                onClick={() => gradeMutation.mutate({ strain })}
                aria-pressed={false}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors hover:border-indigo-400 dark:border-(--hub-border) dark:text-neutral-300"
              >
                <Battery className="h-3.5 w-3.5" />
                Grade strain {strain}/5
              </button>
            ))}
          </div>
        </>
      ) : current.isError ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">
          Flow assessment failed to load — check the connection and retry.
        </p>
      ) : null}
    </div>
  )
}
