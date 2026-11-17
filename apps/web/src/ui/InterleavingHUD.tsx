'use client'

/**
 * @file InterleavingHUD.tsx
 * @description Real-time Rohrer-Taylor interleaving & structural discrimination HUD.
 *
 * Visualizes:
 * - Category confusion matrix with surface-lure highlighting (Gick & Holyoak 1983)
 * - Discrimination accuracy telemetry and per-category recall
 * - Interleaving ratio analyzer: entropy, blocking factor, spacing lag, contrast exposure
 * - Kornell-Bjork metacognitive illusion indicator (practice vs predicted accuracy)
 */

import React from 'react'
import {
  CategoryContrastCell,
  DiscriminationTelemetry,
  ProblemCategory,
  SequenceMetrics,
} from '@learning-hub/core/interleaving/structural-invariance-engine'
import { Badge } from './Feedback'
import { ProgressBar } from './Progress'
import { AlertTriangle, CheckCircle2, Grid3X3, Shuffle, Target, TrendingUp } from 'lucide-react'

export interface InterleavingHUDProps {
  telemetry: DiscriminationTelemetry
  sequenceMetrics: SequenceMetrics
  categories: ProblemCategory[]
  contrastMatrix: CategoryContrastCell[]
  /** Practice-phase accuracy of the current session (the "worse is better" signal). */
  practiceAccuracy: number
  className?: string
}

export function InterleavingHUD({
  telemetry,
  sequenceMetrics,
  categories,
  contrastMatrix,
  practiceAccuracy,
  className = '',
}: InterleavingHUDProps) {
  const accuracyPct = Math.round(telemetry.accuracy * 100)
  const biasPct = Math.round(telemetry.surfaceBiasScore * 100)
  const isInterleaved = sequenceMetrics.blockingFactor <= 0.25

  const labelFor = (id: string): string =>
    categories.find((c) => c.id === id)?.label.split(' ')[0] ?? id

  const maxCellCount = Math.max(1, ...telemetry.matrix.map((c) => c.count))

  const topContrast = [...contrastMatrix].sort((a, b) => b.contrastUtility - a.contrastUtility)[0]

  return (
    <div
      className={`rounded-xl border border-neutral-200/80 dark:border-(--hub-border)/80 bg-white/70 dark:bg-(--hub-panel)/70 p-4 shadow-sm backdrop-blur-md ${className}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200/40 dark:border-(--hub-border)/40 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600/10 text-ac-text">
            <Shuffle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-strong">
              Interleaving &amp; Discrimination HUD
            </h3>
            <p className="text-xs text-tertiary">
              Rohrer &amp; Taylor (2007) • Kornell &amp; Bjork (2008) • Gick &amp; Holyoak (1983)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={isInterleaved ? 'success' : 'warning'}>
            {isInterleaved ? 'Interleaved' : 'Blocked'}
          </Badge>
          <Badge tone={telemetry.accuracy >= 0.7 ? 'success' : 'cyan'}>
            {accuracyPct}% Accuracy
          </Badge>
          {biasPct >= 50 && <Badge tone="danger">Surface Bias {biasPct}%</Badge>}
        </div>
      </div>

      {/* Metric strip */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HudStat
          icon={<Target className="h-4 w-4" />}
          label="Discrimination Accuracy"
          value={`${accuracyPct}%`}
          bar={telemetry.accuracy}
          hint={`${telemetry.totalAttempts} attempts`}
        />
        <HudStat
          icon={<Grid3X3 className="h-4 w-4" />}
          label="Category Entropy"
          value={sequenceMetrics.categoryEntropy.toFixed(2)}
          bar={sequenceMetrics.categoryEntropy}
          hint={`blocking ${sequenceMetrics.blockingFactor.toFixed(2)}`}
        />
        <HudStat
          icon={<TrendingUp className="h-4 w-4" />}
          label="Mean Category Lag"
          value={sequenceMetrics.meanCategoryLag.toFixed(1)}
          bar={Math.min(1, sequenceMetrics.meanCategoryLag / Math.max(1, categories.length))}
          hint={`${sequenceMetrics.transitionCount} transitions`}
        />
        <HudStat
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Surface Bias"
          value={`${biasPct}%`}
          bar={telemetry.surfaceBiasScore}
          hint={
            telemetry.meanReactionMs !== null
              ? `${(telemetry.meanReactionMs / 1000).toFixed(1)}s mean`
              : 'no timing data'
          }
        />
      </div>

      {/* Kornell-Bjork illusion callout */}
      {telemetry.totalAttempts > 0 && practiceAccuracy < 0.8 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning-text" />
          <span>
            Practice feels hard at {Math.round(practiceAccuracy * 100)}% — that is the point.
            Shuffled practice <strong>doubles</strong> delayed test scores despite harder sessions
            (Rohrer &amp; Taylor 2007; Kornell &amp; Bjork 2008).
          </span>
        </div>
      )}

      {/* Confusion matrix */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-tertiary">
            Category Confusion Matrix
          </h4>
          {telemetry.totalAttempts === 0 && (
            <span className="text-xs text-tertiary">awaiting attempts…</span>
          )}
        </div>
        {telemetry.totalAttempts > 0 ? (
          <div className="overflow-x-auto scroll-x">
            <table className="min-w-full border-separate border-spacing-0.5 text-center text-xs">
              <thead>
                <tr>
                  <th className="px-1.5 py-1 text-left text-[10px] font-medium text-tertiary">
                    true ↓ / chose →
                  </th>
                  {categories.map((c) => (
                    <th key={c.id} className="px-1.5 py-1 text-[10px] font-medium text-tertiary">
                      {labelFor(c.id)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map((rowCat) => {
                  const rowTotal = telemetry.perCategoryRecall.find(
                    (r) => r.categoryId === rowCat.id,
                  )
                  return (
                    <tr key={rowCat.id}>
                      <th className="px-1.5 py-1 text-left text-[10px] font-medium text-tertiary">
                        {labelFor(rowCat.id)}
                      </th>
                      {categories.map((colCat) => {
                        const cell = telemetry.matrix.find(
                          (m) => m.trueCategoryId === rowCat.id && m.chosenCategoryId === colCat.id,
                        )
                        const count = cell?.count ?? 0
                        const diagonal = rowCat.id === colCat.id
                        const intensity = count / maxCellCount
                        const bg = diagonal
                          ? `rgba(16, 185, 129, ${0.12 + 0.55 * intensity})`
                          : `rgba(239, 68, 68, ${0.12 + 0.55 * intensity})`
                        return (
                          <td
                            key={colCat.id}
                            className={`min-w-9 rounded px-1.5 py-1 tabular-nums ${
                              count > 0 ? 'font-semibold text-strong' : 'text-tertiary'
                            }`}
                            style={count > 0 ? { backgroundColor: bg } : undefined}
                            title={`${rowCat.label} answered as ${colCat.label}: ${count}`}
                          >
                            {count || '·'}
                          </td>
                        )
                      })}
                      <td className="px-1.5 pl-2 text-[10px] text-tertiary tabular-nums">
                        {rowTotal ? `${Math.round(rowTotal.recall * 100)}%` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-200/60 dark:border-(--hub-border)/60 p-4 text-center text-xs text-tertiary">
            Answer discrimination drills to populate the confusion matrix.
          </div>
        )}
      </div>

      {/* Top confusion + top contrast pair */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-200/50 dark:border-(--hub-border)/50 bg-white/40 dark:bg-(--hub-panel)/40 p-3">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-strong">
            <AlertTriangle className="h-3.5 w-3.5 text-danger-text" />
            Top Confusions
          </h4>
          {telemetry.topConfusions.length > 0 ? (
            <ul className="space-y-1 text-xs text-tertiary">
              {telemetry.topConfusions.slice(0, 3).map((c) => (
                <li
                  key={`${c.trueCategoryId}-${c.chosenCategoryId}`}
                  className="flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-danger-text/70" />
                  <span>
                    {labelFor(c.trueCategoryId)} → {labelFor(c.chosenCategoryId)}{' '}
                    <span className="font-semibold text-strong">×{c.count}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-tertiary">No confusions recorded yet.</p>
          )}
        </div>
        <div className="rounded-lg border border-neutral-200/50 dark:border-(--hub-border)/50 bg-white/40 dark:bg-(--hub-panel)/40 p-3">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-strong">
            <Shuffle className="h-3.5 w-3.5 text-ac-text" />
            Sharpest Contrast Pair
          </h4>
          {topContrast ? (
            <div className="space-y-1 text-xs text-tertiary">
              <p>
                {labelFor(topContrast.categoryA)} vs {labelFor(topContrast.categoryB)}
              </p>
              <p className="text-[10px]">
                surface distance {topContrast.surfaceDistance.toFixed(2)} · structural distance{' '}
                {topContrast.structuralDistance.toFixed(2)} · utility{' '}
                <span className="font-semibold text-strong">
                  {topContrast.contrastUtility.toFixed(2)}
                </span>
              </p>
              <ProgressBar value={topContrast.contrastUtility} label="Contrast utility" />
            </div>
          ) : (
            <p className="text-xs text-tertiary">No contrast data.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function HudStat({
  icon,
  label,
  value,
  bar,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  bar: number
  hint?: string
}) {
  return (
    <div className="rounded-lg border border-neutral-200/50 dark:border-(--hub-border)/50 bg-white/40 dark:bg-(--hub-panel)/40 p-2.5">
      <div className="flex items-center gap-1.5 text-tertiary">
        <span className="text-ac-text/80">{icon}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums text-strong">{value}</p>
      <ProgressBar value={Math.max(0, Math.min(1, bar))} label={label} />
      {hint && <p className="mt-1 text-[10px] text-tertiary">{hint}</p>}
    </div>
  )
}
