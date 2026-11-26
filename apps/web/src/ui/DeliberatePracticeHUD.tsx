/**
 * Learning HUB — Deliberate Practice & Progressive Error Recovery HUD
 *
 * Visualizes K. Anders Ericsson's Deliberate Practice Theory (1993, 2016),
 * Kurt VanLehn's (1990) Impasse-Driven Error Taxonomy,
 * and Nina Keith & Michael Frese's (2008) Positive Error Climate.
 */

'use client'

import React from 'react'
import {
  type DeliberateEffortMetrics,
  type ErrorTaxonomyBreakdown,
  type PracticeDifficultyTier,
  type ZPDFrontierState,
} from '@learning-hub/core/deliberate'
import { Badge } from './Feedback'

export interface DeliberatePracticeHUDProps {
  readonly zpdFrontier: ZPDFrontierState
  readonly errorTaxonomy: ErrorTaxonomyBreakdown
  readonly deliberateEffort: DeliberateEffortMetrics
  readonly onTierSelect?: (tier: PracticeDifficultyTier) => void
}

const TIER_CONFIG: Record<
  PracticeDifficultyTier,
  {
    readonly label: string
    readonly tone: 'neutral' | 'success' | 'warning' | 'danger' | 'accent' | 'violet'
  }
> = {
  foundational: { label: 'Foundational', tone: 'neutral' },
  intermediate: { label: 'Intermediate', tone: 'accent' },
  advanced: { label: 'Advanced', tone: 'warning' },
  frontier_stretch: { label: 'Frontier Stretch', tone: 'danger' },
}

const GRADE_CONFIG: Record<
  DeliberateEffortMetrics['deliberateMasteryGrade'],
  { readonly tone: 'neutral' | 'accent' | 'warning' | 'success' }
> = {
  Apprentice: { tone: 'neutral' },
  Proficient: { tone: 'accent' },
  'Frontier Specialist': { tone: 'warning' },
  'Master Craftsman': { tone: 'success' },
}

export function DeliberatePracticeHUD({
  zpdFrontier,
  errorTaxonomy,
  deliberateEffort,
  onTierSelect,
}: DeliberatePracticeHUDProps) {
  const currentTierInfo = TIER_CONFIG[zpdFrontier.currentTier]
  const gradeInfo = GRADE_CONFIG[deliberateEffort.deliberateMasteryGrade]

  // Calculate error proportions
  const totalErrors = errorTaxonomy.totalErrors || 1
  const miscShare = (errorTaxonomy.misconceptionCount / totalErrors) * 100
  const procShare = (errorTaxonomy.proceduralLapseCount / totalErrors) * 100
  const boundShare = (errorTaxonomy.boundaryOversightCount / totalErrors) * 100
  const slipShare = (errorTaxonomy.attentionalSlipCount / totalErrors) * 100

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) p-5 shadow-sm space-y-5">
      {/* Top Header & Tiers */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-wider uppercase text-secondary">
              Ericsson Deliberate Practice &amp; VanLehn Impasse HUD
            </span>
            <Badge tone={currentTierInfo.tone}>{currentTierInfo.label}</Badge>
            <Badge tone={gradeInfo.tone}>{deliberateEffort.deliberateMasteryGrade}</Badge>
            {zpdFrontier.isOptimalZPD && (
              <Badge tone="success">Optimal ZPD Sweet Spot (65-85%)</Badge>
            )}
          </div>
          <h3 className="text-base font-medium text-strong">{zpdFrontier.guidanceMessage}</h3>
        </div>

        {/* Difficulty Tier Navigation */}
        <div className="flex max-w-full flex-wrap items-center gap-1 rounded-lg bg-neutral-100 dark:bg-(--hub-panel-2) p-1 text-xs">
          {(['foundational', 'intermediate', 'advanced', 'frontier_stretch'] as const).map(
            (tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => onTierSelect?.(tier)}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  zpdFrontier.currentTier === tier
                    ? 'bg-white dark:bg-(--hub-panel) text-strong shadow-sm'
                    : 'text-secondary hover:text-strong'
                }`}
              >
                {TIER_CONFIG[tier].label}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Grid: 3 Interactive Metrics Panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Panel 1: Zone of Proximal Development (ZPD) Gauge */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-strong">Zone of Proximal Development</span>
            <span className="font-bold text-strong">
              {Math.round(zpdFrontier.rollingAccuracy * 100)}% Accuracy
            </span>
          </div>

          {/* Accuracy progress bar with ZPD sweet spot region */}
          <div className="relative h-4 w-full rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
            {/* Highlighted sweet-spot window [65%, 85%] */}
            <div
              className="absolute top-0 h-full bg-emerald-500/20 border-x border-emerald-500/50"
              style={{ left: '65%', width: '20%' }}
              title="Optimal Deliberate Zone: 65% - 85%"
            />
            {/* Current rolling accuracy */}
            <div
              className={`h-full transition-all duration-300 ${
                zpdFrontier.isOptimalZPD
                  ? 'bg-emerald-500'
                  : zpdFrontier.rollingAccuracy > 0.85
                    ? 'bg-cyan-500'
                    : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(100, zpdFrontier.rollingAccuracy * 100)}%` }}
            />
          </div>

          <div className="flex justify-between text-[11px] text-secondary">
            <span>0% Struggle</span>
            <span className="text-status-success-text font-medium">65% – 85% Sweet Spot</span>
            <span>100% Automatic</span>
          </div>

          <div className="pt-1 text-[11px] text-secondary">
            Recommendation:{' '}
            <span className="font-semibold text-strong">
              {zpdFrontier.recommendation === 'expand_difficulty'
                ? 'Step Up Difficulty'
                : zpdFrontier.recommendation === 'inject_micro_scaffold'
                  ? 'Inject Micro-Scaffolding'
                  : 'Maintain Effortful Focus'}
            </span>
          </div>
        </div>

        {/* Panel 2: VanLehn Impasse Error Taxonomy */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-strong">VanLehn Error Taxonomy</span>
            <span className="text-secondary">{errorTaxonomy.totalErrors} caught errors</span>
          </div>

          {/* Stacked error distribution bar */}
          <div className="relative h-4 w-full rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden flex">
            {errorTaxonomy.totalErrors > 0 ? (
              <>
                <div
                  className="h-full bg-rose-500 transition-all duration-300"
                  style={{ width: `${miscShare}%` }}
                  title={`Misconceptions: ${errorTaxonomy.misconceptionCount}`}
                />
                <div
                  className="h-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${procShare}%` }}
                  title={`Procedural Lapses: ${errorTaxonomy.proceduralLapseCount}`}
                />
                <div
                  className="h-full bg-violet-500 transition-all duration-300"
                  style={{ width: `${boundShare}%` }}
                  title={`Boundary Oversights: ${errorTaxonomy.boundaryOversightCount}`}
                />
                <div
                  className="h-full bg-cyan-500 transition-all duration-300"
                  style={{ width: `${slipShare}%` }}
                  title={`Attentional Slips: ${errorTaxonomy.attentionalSlipCount}`}
                />
              </>
            ) : (
              <div className="h-full w-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-[10px] text-secondary">
                Zero errors recorded
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-between text-[10px] text-secondary">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-500 inline-block" />
              Misc ({errorTaxonomy.misconceptionCount})
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
              Proc ({errorTaxonomy.proceduralLapseCount})
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-violet-500 inline-block" />
              Bound ({errorTaxonomy.boundaryOversightCount})
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-cyan-500 inline-block" />
              Slip ({errorTaxonomy.attentionalSlipCount})
            </span>
          </div>

          <div className="pt-1 text-[11px] text-secondary">
            Mean Severity:{' '}
            <span className="font-semibold text-strong">
              {errorTaxonomy.meanBugSeverity > 0
                ? `${errorTaxonomy.meanBugSeverity.toFixed(2)} / 4.0`
                : 'None'}
            </span>
          </div>
        </div>

        {/* Panel 3: Ericsson Deliberate Effort Metric */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-strong">Ericsson Deliberate Effort (D)</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">
              {deliberateEffort.deliberateEffortIndex}
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-secondary">
            <div className="flex justify-between">
              <span>Focused Repetitions:</span>
              <span className="font-semibold text-strong">
                {deliberateEffort.totalFocusedReps} reps
              </span>
            </div>
            <div className="flex justify-between">
              <span>Deficit Targeting Rate:</span>
              <span className="font-semibold text-strong">
                {Math.round(deliberateEffort.deficitTargetingRate * 100)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span>Impasse Repairs Completed:</span>
              <span className="font-semibold text-status-success-text">
                {deliberateEffort.impasseRepairsCompleted}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Keith & Frese (2008) Error Management Training (EMT) Banner */}
      <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/20 p-3 text-xs flex items-center justify-between gap-3 text-status-info-text dark:text-status-info-text">
        <div>
          <strong>Keith &amp; Frese (2008) Positive Error Climate:</strong> &ldquo;Errors are
          informative signposts, not cognitive failures. Each impasse reveals the exact boundary
          where your current mental schema must adapt.&rdquo;
        </div>
        <Badge tone="cyan">EMT Grounded</Badge>
      </div>
    </div>
  )
}
