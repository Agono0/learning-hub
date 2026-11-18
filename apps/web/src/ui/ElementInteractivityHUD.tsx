/**
 * Learning HUB — Element Interactivity & Cognitive Load HUD
 *
 * Visualizes John Sweller's Cognitive Load Theory (CLT, Sweller 1988, 2011),
 * Pollock et al. (2002) 3-phase Isolated-Elements scaffold progress,
 * and Paas (1992) 2D Instructional Efficiency coordinate quadrant.
 */

'use client'

import React from 'react'
import {
  type ElementCognitiveLoadBreakdown,
  type ElementInteractivityTier,
  type PaasInstructionalEfficiency,
  type ScaffoldPhase,
} from '@learning-hub/core/interactivity'
import { Badge } from './Feedback'

export interface ElementInteractivityHUDProps {
  readonly loadBreakdown: ElementCognitiveLoadBreakdown
  readonly efficiency: PaasInstructionalEfficiency
  readonly currentPhase: ScaffoldPhase
  readonly chunkingScore: number // 0.0 to 1.0
  readonly isFullyChunked: boolean
  readonly onPhaseSelect?: (phase: ScaffoldPhase) => void
}

const TIER_CONFIG: Record<
  ElementInteractivityTier,
  { readonly label: string; readonly tone: 'neutral' | 'success' | 'warning' | 'danger' | 'accent' }
> = {
  low: { label: 'Low Interactivity (Isolated)', tone: 'success' },
  moderate: { label: 'Moderate Interactivity (Coupled)', tone: 'accent' },
  high: { label: 'High Interactivity (Network)', tone: 'warning' },
  extreme: { label: 'Extreme Interactivity (Tight Cascade)', tone: 'danger' },
}

const PHASE_LABELS: Record<ScaffoldPhase, { readonly title: string; readonly step: string }> = {
  isolated_elements: { title: 'Isolated Elements', step: 'Phase 1/3' },
  pairwise_coupling: { title: 'Pairwise Coupling', step: 'Phase 2/3' },
  systemic_synthesis: { title: 'Systemic Synthesis', step: 'Phase 3/3' },
}

export function ElementInteractivityHUD({
  loadBreakdown,
  efficiency,
  currentPhase,
  chunkingScore,
  isFullyChunked,
  onPhaseSelect,
}: ElementInteractivityHUDProps) {
  const tierInfo = TIER_CONFIG[loadBreakdown.tier]
  const maxBar = Math.max(loadBreakdown.workingMemoryLimit * 1.5, loadBreakdown.totalLoad)

  // Percentages for the stacked cognitive load bar
  const intrinsicPct = Math.min(100, (loadBreakdown.intrinsicLoad / maxBar) * 100)
  const extraneousPct = Math.min(100, (loadBreakdown.extraneousLoad / maxBar) * 100)
  const germanePct = Math.min(100, (loadBreakdown.germaneLoad / maxBar) * 100)
  const limitPct = Math.min(100, (loadBreakdown.workingMemoryLimit / maxBar) * 100)

  // Map 2D Paas coordinate (-2.5 to +2.5) to SVG [10, 190]
  const mapCoordX = (zEffort: number) => {
    const clamped = Math.max(-2.5, Math.min(2.5, zEffort))
    return 100 + (clamped / 2.5) * 85
  }
  const mapCoordY = (zPerf: number) => {
    const clamped = Math.max(-2.5, Math.min(2.5, zPerf))
    return 100 - (clamped / 2.5) * 85 // Inverted Y in SVG
  }

  const markerX = mapCoordX(efficiency.zEffort)
  const markerY = mapCoordY(efficiency.zPerformance)

  return (
    <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm space-y-5">
      {/* Top Header & Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
              Sweller Cognitive Load & Schema Chunking HUD
            </span>
            <Badge tone={tierInfo.tone}>{tierInfo.label}</Badge>
            {loadBreakdown.isOverloaded && <Badge tone="danger">Working Memory Overload</Badge>}
            {isFullyChunked && <Badge tone="success">Fully Chunked</Badge>}
          </div>
          <h3 className="text-base font-medium text-foreground">
            {PHASE_LABELS[currentPhase].step}: {PHASE_LABELS[currentPhase].title}
          </h3>
        </div>

        {/* Phase Navigation Tabs */}
        <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-1 text-xs">
          {(['isolated_elements', 'pairwise_coupling', 'systemic_synthesis'] as const).map(
            (phase) => (
              <button
                key={phase}
                type="button"
                onClick={() => onPhaseSelect?.(phase)}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  currentPhase === phase
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {PHASE_LABELS[phase].title}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Grid: Cognitive Load Stacked Bar & Paas 2D Efficiency Coordinate */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left: Sweller Cognitive Load Meter */}
        <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground">
              Working Memory Allocation (Cowan Chunks)
            </span>
            <span className="text-muted-foreground">
              Total: {loadBreakdown.totalLoad.toFixed(1)} /{' '}
              {loadBreakdown.workingMemoryLimit.toFixed(1)} chunks
            </span>
          </div>

          {/* Stacked bar */}
          <div className="relative h-6 w-full overflow-hidden rounded-md bg-muted/80">
            <div
              className="absolute left-0 top-0 h-full bg-cyan-600 dark:bg-cyan-500 transition-all duration-300"
              style={{ width: `${intrinsicPct}%` }}
              title={`Intrinsic: ${loadBreakdown.intrinsicLoad}`}
            />
            <div
              className="absolute top-0 h-full bg-amber-500 dark:bg-amber-400 transition-all duration-300"
              style={{ left: `${intrinsicPct}%`, width: `${extraneousPct}%` }}
              title={`Extraneous: ${loadBreakdown.extraneousLoad}`}
            />
            <div
              className="absolute top-0 h-full bg-emerald-500 dark:bg-emerald-400 transition-all duration-300"
              style={{ left: `${intrinsicPct + extraneousPct}%`, width: `${germanePct}%` }}
              title={`Germane: ${loadBreakdown.germaneLoad}`}
            />
            {/* WMC threshold indicator line */}
            <div
              className="absolute top-0 h-full w-1 bg-rose-500 z-10 shadow-sm"
              style={{ left: `${limitPct}%` }}
              title={`Capacity Limit: ${loadBreakdown.workingMemoryLimit}`}
            />
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-between text-[11px] text-muted-foreground pt-1">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-600 inline-block" />
              Intrinsic ({loadBreakdown.intrinsicLoad.toFixed(1)})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block" />
              Extraneous ({loadBreakdown.extraneousLoad.toFixed(1)})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" />
              Germane ({loadBreakdown.germaneLoad.toFixed(1)})
            </span>
            <span className="flex items-center gap-1.5 text-rose-500 font-medium">
              <span className="h-2.5 w-1 bg-rose-500 inline-block" />
              Limit ({loadBreakdown.workingMemoryLimit})
            </span>
          </div>

          {/* Overall chunking progress */}
          <div className="pt-2 border-t border-border/40 space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Schema Chunking Index</span>
              <span className="font-medium text-foreground">
                {Math.round(chunkingScore * 100)}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${chunkingScore * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Right: Paas (1992) Instructional Efficiency 2D Quadrant */}
        <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground">Paas Instructional Efficiency</span>
            <Badge
              tone={
                efficiency.efficiency >= 0.5
                  ? 'success'
                  : efficiency.efficiency <= -0.5
                    ? 'danger'
                    : 'neutral'
              }
            >
              E ={' '}
              {efficiency.efficiency > 0
                ? `+${efficiency.efficiency.toFixed(2)}`
                : efficiency.efficiency.toFixed(2)}
            </Badge>
          </div>

          <div className="flex items-center justify-center">
            <svg viewBox="0 0 200 200" className="w-48 h-48 select-none">
              {/* Quadrant backgrounds */}
              <rect x="100" y="10" width="90" height="90" className="fill-emerald-500/10" />
              <rect x="10" y="10" width="90" height="90" className="fill-cyan-500/15" />
              <rect x="100" y="100" width="90" height="90" className="fill-rose-500/15" />
              <rect x="10" y="100" width="90" height="90" className="fill-amber-500/10" />

              {/* Axes */}
              <line
                x1="100"
                y1="10"
                x2="100"
                y2="190"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="3 3"
                className="text-border"
              />
              <line
                x1="10"
                y1="100"
                x2="190"
                y2="100"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="3 3"
                className="text-border"
              />

              {/* Efficiency diagonal line: Z_P = Z_R (E = 0) */}
              <line
                x1="10"
                y1="190"
                x2="190"
                y2="10"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="2 2"
                className="text-muted-foreground/40"
              />

              {/* Quadrant labels */}
              <text
                x="15"
                y="24"
                className="text-[8px] fill-cyan-600 dark:fill-cyan-400 font-medium"
              >
                Optimal (Low Effort, High P)
              </text>
              <text
                x="105"
                y="24"
                className="text-[8px] fill-emerald-600 dark:fill-emerald-400 font-medium"
              >
                Effortful Mastery
              </text>
              <text
                x="15"
                y="185"
                className="text-[8px] fill-amber-600 dark:fill-amber-400 font-medium"
              >
                Under-engaged
              </text>
              <text
                x="105"
                y="185"
                className="text-[8px] fill-rose-600 dark:fill-rose-400 font-medium"
              >
                Overload (High Effort, Low P)
              </text>

              {/* Axis labels */}
              <text x="195" y="103" textAnchor="end" className="text-[7px] fill-muted-foreground">
                Effort +
              </text>
              <text x="5" y="103" textAnchor="start" className="text-[7px] fill-muted-foreground">
                Effort -
              </text>
              <text x="103" y="18" textAnchor="start" className="text-[7px] fill-muted-foreground">
                Perf +
              </text>
              <text x="103" y="195" textAnchor="start" className="text-[7px] fill-muted-foreground">
                Perf -
              </text>

              {/* Learner position marker */}
              <circle
                cx={markerX}
                cy={markerY}
                r="6"
                className="fill-primary stroke-background"
                strokeWidth="2"
              />
              <circle cx={markerX} cy={markerY} r="10" className="fill-primary/20 animate-ping" />
            </svg>
          </div>

          <div className="text-[11px] text-center text-muted-foreground capitalize">
            State:{' '}
            <span className="font-semibold text-foreground">
              {efficiency.classification.replace('_', ' ')}
            </span>{' '}
            (Mental Effort: {efficiency.mentalEffortScore}/9, Performance:{' '}
            {efficiency.performanceScore}%)
          </div>
        </div>
      </div>
    </div>
  )
}
