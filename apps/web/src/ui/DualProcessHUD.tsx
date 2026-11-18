/**
 * Learning HUB — Dual-Process Diagnostic & Cognitive Forcing HUD
 *
 * Visualizes Daniel Kahneman's (2011) Dual-System Paradigm,
 * Keith Stanovich's (2009, 2011) Tripartite Mind Architecture,
 * and Pat Croskerry's (2002, 2003) Cognitive Forcing Functions (CFFs).
 */

'use client'

import React from 'react'
import {
  type DualProcessSessionMetrics,
  type MindSystem,
  evaluateReflectiveMindTier,
} from '@learning-hub/core/dualprocess'
import { Badge, Panel, ProgressBar } from '@/ui'
import { Activity, Brain, Clock, Compass, Eye, ShieldAlert, Sparkles } from 'lucide-react'

export interface DualProcessHUDProps {
  readonly activeMindSystem: MindSystem
  readonly metrics: DualProcessSessionMetrics
  readonly scenarioTitle: string
  readonly onMindSystemSelect?: (system: MindSystem) => void
}

const SYSTEM_CONFIG: Record<
  MindSystem,
  { label: string; desc: string; tone: 'accent' | 'warning' | 'violet' }
> = {
  autonomous_mind: {
    label: 'System 1: Autonomous Mind',
    desc: 'Heuristic, rapid, effortless pattern recognition',
    tone: 'warning',
  },
  algorithmic_mind: {
    label: 'System 2: Algorithmic Mind',
    desc: 'Cognitive decoupling & hypothetical counterfactual simulation',
    tone: 'accent',
  },
  reflective_mind: {
    label: 'System 2: Reflective Mind',
    desc: 'Epistemic vigilance, bias audit & heuristic override',
    tone: 'violet',
  },
}

export function DualProcessHUD({
  activeMindSystem,
  metrics,
  scenarioTitle,
  onMindSystemSelect,
}: DualProcessHUDProps) {
  const currentTier = evaluateReflectiveMindTier(metrics.reflectiveMindIndex)
  const isSnapJudgement = metrics.system1DecisionLatencyMs < 3000

  return (
    <Panel className="p-4 sm:p-5 border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) shadow-xs space-y-4">
      {/* Top Banner: Scenario Context & Reflective Tier */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 flex items-center justify-center font-bold">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Dual-Process Diagnostic HUD
              </span>
              <Badge tone="violet">Stanovich Tripartite</Badge>
            </div>
            <h3 className="text-sm font-semibold text-strong line-clamp-1">{scenarioTitle}</h3>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            tone={
              currentTier === 'master_diagnostician'
                ? 'success'
                : currentTier === 'reflective_calibrator'
                  ? 'violet'
                  : currentTier === 'algorithmic_novice'
                    ? 'accent'
                    : 'danger'
            }
          >
            <Sparkles className="w-3.5 h-3.5 mr-1 inline" />
            {currentTier.replace(/_/g, ' ').toUpperCase()}
          </Badge>

          {metrics.reflectiveOverrideOccurred ? (
            <Badge tone="success">Reflective Override Engaged</Badge>
          ) : (
            <Badge tone="neutral">Default System 1 Active</Badge>
          )}
        </div>
      </div>

      {/* Tripartite Mind Architecture Switcher */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {(Object.keys(SYSTEM_CONFIG) as MindSystem[]).map((sys) => {
          const cfg = SYSTEM_CONFIG[sys]
          const isSelected = activeMindSystem === sys
          return (
            <button
              key={sys}
              type="button"
              onClick={() => onMindSystemSelect?.(sys)}
              className={`p-3 rounded-xl border text-left transition-all ${
                isSelected
                  ? 'border-violet-500/60 bg-violet-50/50 dark:bg-violet-950/20 ring-1 ring-violet-500/30'
                  : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-panel-2) hover:border-neutral-300 dark:hover:border-neutral-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-strong">{cfg.label}</span>
                <Badge tone={cfg.tone}>{sys === 'autonomous_mind' ? 'Fast' : 'Deliberate'}</Badge>
              </div>
              <p className="text-[11px] text-secondary line-clamp-1">{cfg.desc}</p>
            </button>
          )
        })}
      </div>

      {/* Metric Visualizers: Decoupling, Vulnerability, Reflective Mind Index */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
        {/* Stanovich Reflective Mind Index */}
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-secondary flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-violet-500" />
              Reflective Mind Index
            </span>
            <span className="text-xs font-bold text-strong">
              {(metrics.reflectiveMindIndex * 100).toFixed(0)}%
            </span>
          </div>
          <ProgressBar value={metrics.reflectiveMindIndex} />
          <p className="text-[10px] text-tertiary">
            Weighted composite of decoupling, bias resistance, and accuracy.
          </p>
        </div>

        {/* Cognitive Decoupling Depth */}
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-secondary flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-sky-500" />
              Cognitive Decoupling
            </span>
            <span className="text-xs font-bold text-strong">
              {(metrics.cognitiveDecouplingScore * 100).toFixed(0)}%
            </span>
          </div>
          <ProgressBar value={metrics.cognitiveDecouplingScore} />
          <p className="text-[10px] text-tertiary">
            Capacity to simulate counterfactual hypotheses separate from reality.
          </p>
        </div>

        {/* Croskerry Bias Vulnerability */}
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-secondary flex items-center gap-1.5">
              <ShieldAlert
                className={`w-3.5 h-3.5 ${
                  metrics.biasVulnerabilityScore > 0.4
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-500'
                }`}
              />
              Bias Vulnerability
            </span>
            <span
              className={`text-xs font-bold ${
                metrics.biasVulnerabilityScore > 0.4
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {(metrics.biasVulnerabilityScore * 100).toFixed(0)}%
            </span>
          </div>
          <ProgressBar value={metrics.biasVulnerabilityScore} />
          <p className="text-[10px] text-tertiary">
            Susceptibility to premature closure, anchoring, and satisficing.
          </p>
        </div>
      </div>

      {/* Latency & Telemetry Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-secondary border-t border-neutral-200 dark:border-(--hub-border)">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            System 1 Latency:{' '}
            <strong className="text-strong">
              {(metrics.system1DecisionLatencyMs / 1000).toFixed(1)}s
            </strong>
          </span>
          {isSnapJudgement && <Badge tone="danger">Rapid Snap Penalty (&lt;3s)</Badge>}
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-violet-500" />
            Forcing Steps Completed:{' '}
            <strong className="text-strong">{metrics.completedForcingStepIds.length}</strong>
          </span>
          <span className="flex items-center gap-1">
            Anomalies Identified:{' '}
            <strong className="text-strong">{metrics.discoveredAnomalies.length}</strong>
          </span>
        </div>
      </div>
    </Panel>
  )
}
