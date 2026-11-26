/**
 * Learning HUB — Productive Failure & Canonical Consolidation HUD
 *
 * Real-time cognitive telemetry tracking:
 * - Manu Kapur (2008, 2012, 2016) Productive Failure Index (PFI) & Synergy Score
 * - Generation Diversity Index (GDI) & Structural Feature Exploration
 * - Impasse Sensitivity Score (ISS) & Affective Knowledge Gap Depth
 * - Consolidation Integration Gain (CIG) & SGR-CER Juxtaposition Assembly
 * - Adaptive Transfer Score (ATS) across Near, Medium, and Far Probes
 */

import React from 'react'
import type { PFMetrics } from '@learning-hub/core/productive-failure'
import { Badge } from './Feedback'
import { Panel } from './Panel'
import { ProgressBar } from './Progress'
import {
  Award,
  Compass,
  Flame,
  Layers,
  Lightbulb,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react'

export interface ProductiveFailureHUDProps {
  metrics: PFMetrics
  activeScenarioTitle?: string
  className?: string
}

export function ProductiveFailureHUD({
  metrics,
  activeScenarioTitle,
  className = '',
}: ProductiveFailureHUDProps) {
  const masteryMeta: Record<
    PFMetrics['masteryBand'],
    {
      label: string
      tone: 'neutral' | 'warning' | 'accent' | 'success'
      desc: string
    }
  > = {
    'Master Adaptive Transferer': {
      label: 'Master Adaptive Transferer',
      tone: 'success',
      desc: 'Broad exploratory generation, deep impasse awareness, and seamless deep invariant transfer',
    },
    'Consolidated Thinker': {
      label: 'Consolidated Thinker',
      tone: 'accent',
      desc: 'Robust canonical consolidation; successfully mapped intuitive heuristics to formal parameters',
    },
    'Developing Explorer': {
      label: 'Developing Explorer',
      tone: 'neutral',
      desc: 'Active hypothesis generator; needs closer juxtaposition to resolve edge cases',
    },
    'Novice Intuition': {
      label: 'Novice Intuition',
      tone: 'warning',
      desc: 'Premature closure; explore boundary conditions and test limits before consulting solutions',
    },
  }

  const currentMastery = masteryMeta[metrics.masteryBand]

  return (
    <Panel
      className={`p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4 ${className}`}
    >
      {/* Header telemetry bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-amber-500/10 text-status-warning-text dark:text-status-warning-text">
            <Lightbulb className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Productive Failure Telemetry
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-(--hub-panel-2) text-secondary font-mono">
                Kapur-Sinha Engine
              </span>
            </div>
            <h3 className="text-sm font-bold text-strong">
              {activeScenarioTitle || 'Exploration & Canonical Consolidation Matrix'}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={currentMastery.tone} className="text-xs font-medium">
            <Award className="w-3.5 h-3.5 mr-1" />
            {currentMastery.label}
          </Badge>
        </div>
      </div>

      {/* Main 4-metric diagnostic grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Productive Failure Index (PFI) */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Productive Failure (PFI)</span>
            <Sparkles className="w-3.5 h-3.5 text-status-warning-text" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-strong">
              {`${metrics.productiveFailureIndex}%`}
            </span>
            <span className="text-[11px] text-secondary">overall</span>
          </div>
          <p className="text-[10px] text-tertiary line-clamp-2">Synergistic learning efficiency</p>
        </div>

        {/* Generation Diversity Index (GDI) */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Generation Diversity (GDI)</span>
            <Layers className="w-3.5 h-3.5 text-ac-text" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
              {`${(metrics.generationDiversityIndex * 100).toFixed(0)}%`}
            </span>
            <span className="text-[11px] text-secondary">breadth</span>
          </div>
          <p className="text-[10px] text-tertiary line-clamp-2">Novel representations explored</p>
        </div>

        {/* Impasse Sensitivity Score (ISS) */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Impasse Depth (ISS)</span>
            <Flame className="w-3.5 h-3.5 text-danger-text" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-strong">
              {`${metrics.impasseSensitivityScore}%`}
            </span>
            <span className="text-[11px] text-secondary">awareness</span>
          </div>
          <p className="text-[10px] text-tertiary line-clamp-2">Boundary gap articulation</p>
        </div>

        {/* Adaptive Transfer Score (ATS) */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Adaptive Transfer (ATS)</span>
            <Target className="w-3.5 h-3.5 text-status-success-text" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-status-success-text">
              {`${metrics.adaptiveTransferScore}%`}
            </span>
            <span className="text-[11px] text-secondary">deep</span>
          </div>
          <p className="text-[10px] text-tertiary line-clamp-2">Near, medium, far invariance</p>
        </div>
      </div>

      {/* Progress & Consolidation Bar */}
      <div className="space-y-2 pt-1 border-t border-neutral-200 dark:border-(--hub-border)">
        <div className="flex items-center justify-between text-xs">
          <span className="text-secondary font-medium flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-secondary" />
            Consolidation Integration Gain (CIG)
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-strong">
              {`${metrics.consolidationIntegrationGain}%`}
            </span>
            <span className="text-[11px] text-tertiary">
              (Φ = {metrics.failureToMasteryRatio.toFixed(2)}x)
            </span>
          </div>
        </div>
        <ProgressBar
          value={Math.max(0, Math.min(1.0, metrics.consolidationIntegrationGain / 100))}
        />
      </div>

      {/* Qualitative Feedback banner */}
      <div className="p-3 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2)/50 border border-neutral-200 dark:border-(--hub-border) text-xs space-y-1">
        <div className="flex items-center gap-1.5 font-semibold text-strong">
          <TrendingUp className="w-3.5 h-3.5 text-status-warning-text" />
          <span>Diagnostic Recommendation</span>
        </div>
        <p className="text-secondary leading-relaxed">{metrics.qualitativeFeedback}</p>
        <p className="text-tertiary text-[11px]">
          <strong className="text-secondary">Next Step: </strong>
          {metrics.recommendedIntervention}
        </p>
      </div>
    </Panel>
  )
}
