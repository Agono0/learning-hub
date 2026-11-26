/**
 * Learning HUB — Multi-Representational Fluency & Representational Competence HUD
 *
 * Grounded in:
 * - Shaaron Ainsworth (1999, 2006): DeFT Framework (Design, Functions, Tasks)
 * - Richard Lesh (1987): Multi-Representational Translation Model
 * - Robert Goldstone (2005): Concreteness Fading
 */

'use client'

import React from 'react'
import {
  type RepresentationModality,
  type RepresentationalSessionMetrics,
  evaluateRepresentationalFluencyTier,
} from '@learning-hub/core/representation'
import { Badge, Panel, ProgressBar } from '@/ui'
import {
  Activity,
  Binary,
  BookOpen,
  Boxes,
  Clock,
  Code,
  Compass,
  Eye,
  GitCompare,
  Layers,
  Sparkles,
} from 'lucide-react'

export interface RepresentationalFluencyHUDProps {
  readonly activeModality: RepresentationModality
  readonly metrics: RepresentationalSessionMetrics
  readonly problemTitle: string
  readonly onModalitySelect?: (modality: RepresentationModality) => void
}

const MODALITY_CONFIG: Record<
  RepresentationModality,
  {
    label: string
    short: string
    icon: typeof Binary
    tone: 'accent' | 'warning' | 'violet' | 'cyan' | 'neutral'
  }
> = {
  symbolic_formal: {
    label: 'Symbolic / Formal',
    short: 'Equations',
    icon: Binary,
    tone: 'violet',
  },
  computational_code: {
    label: 'Computational / Code',
    short: 'Algorithm',
    icon: Code,
    tone: 'accent',
  },
  visual_geometric: {
    label: 'Geometric / Visual',
    short: 'Geometry',
    icon: Eye,
    tone: 'cyan',
  },
  concrete_physical: {
    label: 'Concrete / Physical',
    short: 'Analogy',
    icon: Boxes,
    tone: 'warning',
  },
  verbal_narrative: {
    label: 'Verbal / Narrative',
    short: 'Story',
    icon: BookOpen,
    tone: 'neutral',
  },
}

export function RepresentationalFluencyHUD({
  activeModality,
  metrics,
  problemTitle,
  onModalitySelect,
}: RepresentationalFluencyHUDProps) {
  const currentTier = evaluateRepresentationalFluencyTier(metrics.representationalFluencyIndex)
  const isCoordinationGapHigh = metrics.representationalCoordinationGap > 0.4

  return (
    <Panel className="p-4 sm:p-5 border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) shadow-xs space-y-4">
      {/* Top Banner: Problem Context & Fluency Tier */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-status-info-text dark:text-status-info-text flex items-center justify-center font-bold">
            <GitCompare className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Representational Fluency HUD
              </span>
              <Badge tone="accent">Ainsworth DeFT · Lesh Model</Badge>
            </div>
            <h3 className="text-sm font-semibold text-strong line-clamp-1">{problemTitle}</h3>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            tone={
              currentTier === 'polymath_fluent'
                ? 'success'
                : currentTier === 'multimodal_integrator'
                  ? 'violet'
                  : currentTier === 'bimodal_translator'
                    ? 'accent'
                    : 'warning'
            }
          >
            <Sparkles className="w-3.5 h-3.5 mr-1 inline" />
            {currentTier.replace(/_/g, ' ').toUpperCase()}
          </Badge>

          <Badge tone="neutral">{metrics.exploredModalities.length}/5 Modalities Explored</Badge>
        </div>
      </div>

      {/* 5-Modality Lesh Translation Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {(Object.keys(MODALITY_CONFIG) as RepresentationModality[]).map((mod) => {
          const cfg = MODALITY_CONFIG[mod]
          const isSelected = activeModality === mod
          const isExplored = metrics.exploredModalities.includes(mod)
          const IconComponent = cfg.icon

          return (
            <button
              key={mod}
              type="button"
              onClick={() => onModalitySelect?.(mod)}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                isSelected
                  ? 'border-sky-500/60 bg-sky-50/50 dark:bg-sky-950/20 ring-1 ring-sky-500/30'
                  : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-panel-2) hover:border-neutral-300 dark:hover:border-neutral-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-strong flex items-center gap-1.5">
                  <IconComponent className="w-3.5 h-3.5 text-secondary" />
                  {cfg.short}
                </span>
                {isExplored && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                )}
              </div>
              <p className="text-[10px] text-secondary line-clamp-1">{cfg.label}</p>
            </button>
          )
        })}
      </div>

      {/* Metric Visualizers: Fluency Index, Coordination Gap, Cross-Modal Coherence */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
        {/* Fluency Index */}
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-secondary flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-status-info-text" />
              Fluency Index
            </span>
            <span className="text-xs font-bold text-strong">
              {(metrics.representationalFluencyIndex * 100).toFixed(0)}%
            </span>
          </div>
          <ProgressBar value={metrics.representationalFluencyIndex} />
          <p className="text-[10px] text-tertiary">
            Composite of accuracy, modality diversity, and translation coherence.
          </p>
        </div>

        {/* Coordination Gap (Ainsworth 2006) */}
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-secondary flex items-center gap-1.5">
              <Layers
                className={`w-3.5 h-3.5 ${
                  isCoordinationGapHigh
                    ? 'text-danger-text dark:text-danger-text'
                    : 'text-status-success-text'
                }`}
              />
              Coordination Gap
            </span>
            <span
              className={`text-xs font-bold ${
                isCoordinationGapHigh
                  ? 'text-danger-text dark:text-danger-text'
                  : 'text-status-success-text dark:text-status-success-text'
              }`}
            >
              {(metrics.representationalCoordinationGap * 100).toFixed(0)}%
            </span>
          </div>
          <ProgressBar value={metrics.representationalCoordinationGap} />
          <p className="text-[10px] text-tertiary">
            Friction or disorientation when coordinating between representations.
          </p>
        </div>

        {/* Cross-Modal Coherence */}
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-secondary flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-ac-text" />
              Cross-Modal Coherence
            </span>
            <span className="text-xs font-bold text-strong">
              {(metrics.crossModalCoherenceScore * 100).toFixed(0)}%
            </span>
          </div>
          <ProgressBar value={metrics.crossModalCoherenceScore} />
          <p className="text-[10px] text-tertiary">
            Speed and consistency of structural mapping across paired representations.
          </p>
        </div>
      </div>

      {/* Footer Telemetry */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-secondary border-t border-neutral-200 dark:border-(--hub-border)">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Avg Translation Latency:{' '}
            <strong className="text-strong">
              {(metrics.averageTranslationLatencyMs / 1000).toFixed(1)}s
            </strong>
          </span>
          {metrics.averageTranslationLatencyMs > 12000 && (
            <Badge tone="warning">High Translation Friction</Badge>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            Translation Challenges Solved:{' '}
            <strong className="text-strong">
              {metrics.correctChallengeIds.length}/{metrics.completedChallengeIds.length}
            </strong>
          </span>
        </div>
      </div>
    </Panel>
  )
}
