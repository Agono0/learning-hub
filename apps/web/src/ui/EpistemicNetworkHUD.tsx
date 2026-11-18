import React from 'react'
import { Network, GitGraph, Compass, Activity, CheckCircle2, Layers } from 'lucide-react'
import { Badge } from './Feedback'

export interface EpistemicNetworkHUDProps {
  networkDensity: number // 0 to 1.0 (or percentage 0-100)
  overallMaturityScore: number // 0 to 100%
  dimension1Coord: number // SVD Dim 1 (Theory vs Practice)
  dimension2Coord: number // SVD Dim 2 (Metacognition vs Execution)
  dominantConnection?: string
  centralHubCode?: string
  interpretation?: string
}

export function EpistemicNetworkHUD({
  networkDensity,
  overallMaturityScore,
  dimension1Coord,
  dimension2Coord,
  dominantConnection = 'Domain Principle ↔ Empirical Evidence',
  centralHubCode = 'Causal Mechanism',
  interpretation = 'High-order theoretical synthesis with empirical validation.',
}: EpistemicNetworkHUDProps) {
  const densityPercent = Math.round(networkDensity <= 1.0 ? networkDensity * 100 : networkDensity)

  const getMaturityTone = (): 'success' | 'accent' | 'warning' | 'neutral' => {
    if (overallMaturityScore >= 80) return 'success'
    if (overallMaturityScore >= 60) return 'accent'
    if (overallMaturityScore >= 40) return 'warning'
    return 'neutral'
  }

  const getMaturityLabel = () => {
    if (overallMaturityScore >= 80) return 'EXPERT SYNTHESIS'
    if (overallMaturityScore >= 60) return 'INTEGRATED SCHEMA'
    if (overallMaturityScore >= 40) return 'EMERGING NETWORK'
    return 'FRAGMENTED CODES'
  }

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 dark:border-(--hub-border) pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
            <Network className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-secondary">
              Quantitative Ethnography (Shaffer 2016)
            </div>
            <div className="text-sm font-medium text-strong">
              Epistemic Network Analysis (ENA) Telemetry
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={getMaturityTone()}>{getMaturityLabel()}</Badge>
          <div className="flex items-baseline gap-1 bg-neutral-50 dark:bg-(--hub-sunken) px-2.5 py-1 rounded-md border border-neutral-200 dark:border-(--hub-border)">
            <span className="text-xs text-secondary">Maturity:</span>
            <span className="text-base font-bold text-strong">{`${overallMaturityScore}%`}</span>
          </div>
        </div>
      </div>

      {/* Grid of Key ENA Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {/* Metric 1: Network Density */}
        <div className="rounded-lg p-3 border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken)">
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-secondary">
              <GitGraph className="h-3.5 w-3.5 text-blue-500" />
              Network Density
            </span>
            <span className="text-xs font-semibold text-strong">{`${densityPercent}%`}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-(--hub-surface) overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, densityPercent))}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-secondary">Stanza co-occurrence connectivity</div>
        </div>

        {/* Metric 2: SVD Epistemic Space Position */}
        <div className="rounded-lg p-3 border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken)">
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-secondary">
              <Compass className="h-3.5 w-3.5 text-emerald-500" />
              SVD 2D Centroid
            </span>
            <span className="text-xs font-semibold text-strong">
              {`(${dimension1Coord > 0 ? '+' : ''}${dimension1Coord}, ${dimension2Coord > 0 ? '+' : ''}${dimension2Coord})`}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-(--hub-surface) overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(10, (dimension1Coord + 1) * 50))}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-secondary">
            Dim 1: Theory/Practice · Dim 2: Metacognition
          </div>
        </div>

        {/* Metric 3: Central Network Hub */}
        <div className="rounded-lg p-3 border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken)">
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-secondary">
              <Layers className="h-3.5 w-3.5 text-violet-500" />
              Central Epistemic Hub
            </span>
            <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 truncate max-w-[120px]">
              {centralHubCode}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-(--hub-surface) overflow-hidden">
            <div className="h-full rounded-full bg-violet-500 w-3/4" />
          </div>
          <div className="mt-1 text-[11px] text-secondary">
            Highest degree & strength centrality
          </div>
        </div>
      </div>

      {/* Dominant Link & Epistemic Stance Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="flex items-center justify-between rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-2.5 border border-neutral-200 dark:border-(--hub-border)">
          <div className="flex items-center gap-2 truncate">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <div className="truncate">
              <div className="font-medium text-strong truncate">Dominant Stanza Link</div>
              <div className="text-[11px] text-secondary truncate">{dominantConnection}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-2.5 border border-neutral-200 dark:border-(--hub-border)">
          <div className="flex items-center gap-2 truncate">
            <Activity className="h-4 w-4 text-indigo-500 shrink-0" />
            <div className="truncate">
              <div className="font-medium text-strong truncate">Epistemic Stance</div>
              <div className="text-[11px] text-secondary truncate">{interpretation}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
