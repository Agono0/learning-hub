'use client'

/**
 * Tonight's Consolidation Plan panel for /sleep-tmr.
 *
 * Renders the sleep-architecture model (packages/core/src/tmr/sleep-architecture.ts)
 * against the learner's REAL FSRS card state via POST /api/cognitive/tmr:
 * a cycle-accurate hypnogram, delta-weighted SWS blocks, a fragility-ranked
 * cue playlist, per-card consolidation audits, an acoustic-safety audit, and
 * the modelling assumptions — all honest, all labelled as advisory.
 */
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import {
  AlertTriangle,
  BedDouble,
  Brain,
  Clock,
  Info,
  Moon,
  ShieldCheck,
  Waves,
} from 'lucide-react'
import { Button, Callout, EmptyState, Panel, Skeleton } from '@/ui'
import { apiSend } from '@/lib/transport'

interface HypnogramSegment {
  stage: 'n1' | 'n2' | 'n3' | 'rem'
  startMinute: number
  endMinute: number
  cycleIndex: number
}

interface TonightPlanPayload {
  ok: boolean
  plan: {
    profile: { bedtime: string; wakeTime: string; chronotype: number; sleepDebtHours: number }
    hypnogram: {
      totalOpportunityMinutes: number
      onsetLatencyMinutes: number
      cycleCount: number
      segments: HypnogramSegment[]
      swsShare: number
      remShare: number
      bedtimeIso: string
      wakeIso: string
    }
    swsBlocks: { cycleIndex: number; startMinute: number; endMinute: number; deltaWeight: number }[]
    cues: {
      cardId: number
      offsetMinutes: number
      cycleIndex: number
      blockDeltaWeight: number
      baseFrequency: number
      harmonicType: string
      predictedBoostPct: number
      stabilizationTier: 'optimal' | 'moderate' | 'marginal'
    }[]
    meanPredictedBoostPct: number
    unscheduledCardIds: number[]
    safety: {
      maxAcousticDba: number
      withinArousalCeiling: boolean
      ceilingDba: number
      note: string
    }
    advisory: string
    assumptions: string[]
  }
  candidateCount: number
}

const STAGE_COLORS: Record<HypnogramSegment['stage'], string> = {
  n1: '#64748b',
  n2: '#6366f1',
  n3: '#4f46e5',
  rem: '#10b981',
}

const STAGE_LABELS: Record<HypnogramSegment['stage'], string> = {
  n1: 'N1',
  n2: 'N2',
  n3: 'N3 · SWS',
  rem: 'REM',
}

const TIER_TONE: Record<'optimal' | 'moderate' | 'marginal', string> = {
  optimal: 'text-status-success-text dark:text-status-success-text',
  moderate: 'text-indigo-600 dark:text-indigo-400',
  marginal: 'text-tertiary',
}

export interface TonightConsolidationPanelProps {
  className?: string
}

/**
 * Interactive "tonight" planner. Time inputs feed a debounced plan mutation;
 * the hypnogram is drawn from the model segments (never invented client-side).
 */
export function TonightConsolidationPanel({ className }: TonightConsolidationPanelProps) {
  const [bedtime, setBedtime] = useState('23:00')
  const [wakeTime, setWakeTime] = useState('07:00')
  const [chronotype, setChronotype] = useState(0)
  const [sleepDebtHours, setSleepDebtHours] = useState(0)
  const [maxAcousticDba, setMaxAcousticDba] = useState(35)

  const planMutation = useMutation({
    mutationFn: () =>
      apiSend<TonightPlanPayload>('/api/cognitive/tmr', 'POST', {
        bedtime,
        wakeTime,
        chronotype,
        sleepDebtHours,
        maxAcousticDba,
      }),
  })

  const plan = planMutation.data?.plan

  return (
    <Panel
      title="Tonight's consolidation plan"
      className={className}
      actions={
        <Button
          variant="ghost"
          icon={<Waves className="h-4 w-4" />}
          loading={planMutation.isPending}
          onClick={() => planMutation.mutate()}
        >
          Build plan
        </Button>
      }
    >
      <div className="space-y-4">
        {/* ── Sleep profile inputs ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-xs text-tertiary dark:text-faint">
            <span className="mb-1 flex items-center gap-1">
              <BedDouble className="h-3.5 w-3.5" /> Bedtime
            </span>
            <input
              type="time"
              value={bedtime}
              onChange={(e) => setBedtime(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-transparent px-2 py-2 text-sm font-mono dark:border-(--hub-border)"
            />
          </label>
          <label className="text-xs text-tertiary dark:text-faint">
            <span className="mb-1 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> Wake
            </span>
            <input
              type="time"
              value={wakeTime}
              onChange={(e) => setWakeTime(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-transparent px-2 py-2 text-sm font-mono dark:border-(--hub-border)"
            />
          </label>
          <label className="text-xs text-tertiary dark:text-faint">
            <span className="mb-1">Chronotype (owl −1 … lark +1)</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.1}
              value={chronotype}
              onChange={(e) => setChronotype(Number(e.target.value))}
              className="mt-2 w-full accent-indigo-500"
              aria-label="Chronotype"
            />
            <span className="font-mono text-[11px] text-tertiary">{chronotype.toFixed(1)}</span>
          </label>
          <label className="text-xs text-tertiary dark:text-faint">
            <span className="mb-1">Sleep debt (hours, 0–12)</span>
            <input
              type="range"
              min={0}
              max={12}
              step={0.5}
              value={sleepDebtHours}
              onChange={(e) => setSleepDebtHours(Number(e.target.value))}
              className="mt-2 w-full accent-amber-500"
              aria-label="Sleep debt hours"
            />
            <span className="font-mono text-[11px] text-tertiary">{sleepDebtHours}h</span>
          </label>
          <label className="col-span-2 text-xs text-tertiary dark:text-faint sm:col-span-4">
            <span className="mb-1 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> Acoustic ceiling ({maxAcousticDba} dBA ·
              arousal limit 42)
            </span>
            <input
              type="range"
              min={25}
              max={42}
              step={1}
              value={maxAcousticDba}
              onChange={(e) => setMaxAcousticDba(Number(e.target.value))}
              className="w-full accent-emerald-500"
              aria-label="Maximum acoustic dBa"
            />
          </label>
        </div>

        {planMutation.isError ? (
          <Callout tone="danger" title="Could not build the plan">
            <Button variant="ghost" onClick={() => planMutation.mutate()}>
              Try again
            </Button>
          </Callout>
        ) : null}

        {planMutation.isPending ? (
          <Skeleton className="h-40" />
        ) : !plan ? (
          <EmptyState icon={<Moon className="h-6 w-6" />} title="No plan built yet">
            Set your sleep window above and press “Build plan” — the model fits a hypnogram, finds
            your slow-wave blocks, and schedules your most fragile cards into them.
          </EmptyState>
        ) : (
          <>
            {/* ── Hypnogram ── */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-tertiary dark:text-faint">
                <span>
                  {plan.hypnogram.cycleCount} cycles ·{' '}
                  {Math.floor(plan.hypnogram.totalOpportunityMinutes / 60)}h{' '}
                  {plan.hypnogram.totalOpportunityMinutes % 60}m window · SWS{' '}
                  {Math.round(plan.hypnogram.swsShare * 100)}% · REM{' '}
                  {Math.round(plan.hypnogram.remShare * 100)}%
                </span>
                <span className="flex flex-wrap gap-2">
                  {(Object.keys(STAGE_COLORS) as HypnogramSegment['stage'][]).map((s) => (
                    <span key={s} className="inline-flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: STAGE_COLORS[s] }}
                      />
                      {STAGE_LABELS[s]}
                    </span>
                  ))}
                </span>
              </div>
              <div
                className="flex h-12 w-full overflow-hidden rounded-lg border border-neutral-200 dark:border-(--hub-border)"
                role="img"
                aria-label={`Model hypnogram: ${plan.hypnogram.segments.length} stage segments`}
              >
                {plan.hypnogram.segments.map((seg, i) => {
                  const width =
                    ((seg.endMinute - seg.startMinute) /
                      Math.max(1, plan.hypnogram.totalOpportunityMinutes)) *
                    100
                  return (
                    <div
                      key={i}
                      title={`Cycle ${seg.cycleIndex}: ${STAGE_LABELS[seg.stage]} ${seg.startMinute}–${seg.endMinute} min`}
                      style={{
                        width: `${width}%`,
                        background: STAGE_COLORS[seg.stage],
                        opacity: seg.stage === 'n3' ? 0.95 : 0.55,
                      }}
                      className="h-full min-w-px"
                    />
                  )
                })}
              </div>
            </div>

            {/* ── Safety audit ── */}
            {!plan.safety.withinArousalCeiling ? (
              <Callout tone="danger" title="Acoustic ceiling exceeded">
                <span className="inline-flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {plan.safety.note}
                </span>
              </Callout>
            ) : (
              <p className="flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-2.5 text-xs text-neutral-600 dark:text-secondary">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-status-success-text" />
                {plan.safety.note}
              </p>
            )}

            {/* ── Cue playlist ── */}
            {plan.cues.length === 0 ? (
              <EmptyState icon={<Brain className="h-6 w-6" />} title="Nothing to schedule">
                No review-state cards available yet — review cards today and they will be ranked
                into tonight's plan by fragility.
              </EmptyState>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-tertiary dark:text-faint">
                  <span>
                    {plan.cues.length} cues · mean predicted boost ≈{' '}
                    <strong className="text-neutral-800 dark:text-neutral-100">
                      {plan.meanPredictedBoostPct}%
                    </strong>
                  </span>
                  {plan.unscheduledCardIds.length > 0 && (
                    <span className="text-status-warning-text dark:text-status-warning-text">
                      {plan.unscheduledCardIds.length} cards didn't fit the slow-wave windows
                    </span>
                  )}
                </div>
                <ul className="scroll-x max-h-72 space-y-1.5 overflow-y-auto">
                  {plan.cues.map((cue, i) => (
                    <li
                      key={`${cue.cardId}-${i}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 p-2.5 text-xs dark:border-(--hub-border)"
                    >
                      <div className="min-w-0">
                        <span className="font-mono font-semibold text-neutral-800 dark:text-neutral-100">
                          {String(Math.floor(cue.offsetMinutes / 60)).padStart(2, '0')}:
                          {String(Math.round(cue.offsetMinutes % 60)).padStart(2, '0')} · card #
                          {cue.cardId}
                        </span>
                        <span className="block text-tertiary dark:text-faint">
                          cycle {cue.cycleIndex} · Δ weight {cue.blockDeltaWeight} ·{' '}
                          {cue.baseFrequency} Hz {cue.harmonicType.replace('_', ' ')}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 font-mono font-bold ${TIER_TONE[cue.stabilizationTier]}`}
                      >
                        +{cue.predictedBoostPct}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ── Assumptions ── */}
            <details className="rounded-lg border border-neutral-200 p-3 text-xs dark:border-(--hub-border)">
              <summary className="cursor-pointer font-semibold text-neutral-600 dark:text-secondary">
                <Info className="mr-1 inline h-3.5 w-3.5" /> Model assumptions (
                {plan.assumptions.length})
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-tertiary dark:text-faint">
                {plan.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
                <li>{plan.advisory}</li>
              </ul>
            </details>
          </>
        )}
      </div>
    </Panel>
  )
}
