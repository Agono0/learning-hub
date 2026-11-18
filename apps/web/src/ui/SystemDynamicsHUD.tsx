'use client'

import React from 'react'
import {
  type SystemsDynamicsEvaluation,
  type SystemsMaturityTier,
  type SystemsArchetype,
} from '@learning-hub/core/system-dynamics'
import { Panel } from './Panel'
import { ProgressBar } from './Progress'
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Layers,
  Repeat,
  Sparkles,
  Zap,
} from 'lucide-react'

export interface SystemDynamicsHUDProps {
  evaluation: SystemsDynamicsEvaluation
  scenarioTitle: string
  canonicalArchetype?: SystemsArchetype
}

const MATURITY_CONFIG: Record<
  SystemsMaturityTier,
  { label: string; tone: string; description: string }
> = {
  linear_reductionist: {
    label: 'Linear Reductionist (Tier 1)',
    tone: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30',
    description:
      'Perceives only one-way linear cause-and-effect chains. Regularly conflates stocks with flows and neglects delays and closed feedback loops.',
  },
  feedback_aware: {
    label: 'Feedback Aware (Tier 2)',
    tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
    description:
      'Recognizes closed circular causal loops and assigns polarities, but fails to anticipate physical/informational delays and predicts monotonic settling.',
  },
  dynamic_simulator: {
    label: 'Dynamic Simulator (Tier 3)',
    tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30',
    description:
      'Anticipates delay effects, distinguishes stock accumulations from differential flow rates, and predicts overshoot, oscillation, and tipping thresholds.',
  },
  leverage_strategist: {
    label: 'Leverage Strategist (Tier 4)',
    tone: 'bg-emerald-500/10 text-emerald-700 dark:text-status-success-text border-emerald-500/30',
    description:
      "Masters systemic archetypes (Senge 1990) and identifies Donella Meadows' high-leverage intervention points that fundamentally alter system rules and goals.",
  },
}

export function SystemDynamicsHUD({
  evaluation,
  scenarioTitle,
  canonicalArchetype,
}: SystemDynamicsHUDProps) {
  const maturity = MATURITY_CONFIG[evaluation.maturityTier]

  return (
    <div className="space-y-4">
      {/* Top Banner: Composite Index & Maturity Tier */}
      <Panel className="space-y-4 border-l-4 border-l-cyan-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider font-semibold text-tertiary flex items-center gap-1">
                <Repeat className="h-3.5 w-3.5 text-cyan-500" />
                System Dynamics Index (SDI)
              </span>
            </div>
            <h2 className="text-xl font-bold text-strong mt-0.5">{scenarioTitle}</h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-black text-strong">{evaluation.sdi}/100</div>
              <span className="text-[11px] text-tertiary">SDI Score</span>
            </div>

            <div className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${maturity.tone}`}>
              {maturity.label}
            </div>
          </div>
        </div>

        <p className="text-xs text-secondary leading-relaxed">{maturity.description}</p>

        {/* 4 Quantitative Systems Thinking Dimensions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-neutral-200 dark:border-(--hub-border)">
          <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-secondary flex items-center gap-1">
                <Layers className="h-3.5 w-3.5 text-cyan-500" />
                SFDR (Stock-Flow)
              </span>
              <span className="font-bold text-strong">{evaluation.sfdr}%</span>
            </div>
            <ProgressBar value={evaluation.sfdr / 100} />
            <span className="text-[10px] text-tertiary">
              Booth Sweeney &amp; Sterman (2000) Bathtub Ratio
            </span>
          </div>

          <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-secondary flex items-center gap-1">
                <ArrowRightLeft className="h-3.5 w-3.5 text-cyan-500" />
                FLIA (Loop Polarity)
              </span>
              <span className="font-bold text-strong">{evaluation.flia}%</span>
            </div>
            <ProgressBar value={evaluation.flia / 100} />
            <span className="text-[10px] text-tertiary">Forrester (1968) Polarity Accuracy</span>
          </div>

          <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-secondary flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-cyan-500" />
                DAM (Delay Metric)
              </span>
              <span className="font-bold text-strong">{evaluation.dam}%</span>
            </div>
            <ProgressBar value={evaluation.dam / 100} />
            <span className="text-[10px] text-tertiary">Meadows (2008) Lag Recognition</span>
          </div>

          <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-secondary flex items-center gap-1">
                <Activity className="h-3.5 w-3.5 text-cyan-500" />
                ARS (Archetype)
              </span>
              <span className="font-bold text-strong">{evaluation.ars}%</span>
            </div>
            <ProgressBar value={evaluation.ars / 100} />
            <span className="text-[10px] text-tertiary">Senge (1990) Archetype Alignment</span>
          </div>
        </div>
      </Panel>

      {/* Systems Archetype & Donella Meadows Leverage Points */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Archetype Overview */}
        <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-tertiary flex items-center gap-1.5">
              <Repeat className="h-3.5 w-3.5 text-cyan-500" />
              Structural Archetype Diagnosis
            </h3>
            {canonicalArchetype && (
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border border-cyan-500/30 uppercase">
                {canonicalArchetype.replace(/_/g, ' ')}
              </span>
            )}
          </div>

          {evaluation.archetypeDiscrepancies.length > 0 ? (
            <div className="space-y-2">
              {evaluation.archetypeDiscrepancies.map((disc, idx) => (
                <div
                  key={idx}
                  className="rounded border border-amber-500/20 bg-amber-500/10 p-2.5 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>{disc}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded border border-emerald-500/20 bg-emerald-500/10 p-3 flex items-start gap-2 text-xs text-emerald-800 dark:text-status-success-text">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>
                Canonical archetype perfectly mapped. Feedback loops, stock delays, and behavioral
                trajectories exhibit cohesive structural congruence.
              </span>
            </div>
          )}
        </Panel>

        {/* Leverage Points Analysis */}
        <Panel className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-tertiary flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-cyan-500" />
            Donella Meadows Leverage Point Hierarchy
          </h3>

          <div className="rounded border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 text-xs leading-relaxed text-secondary space-y-2">
            <p className="font-medium text-strong">{evaluation.leveragePointAnalysis}</p>
            <p className="text-[11px] text-tertiary">
              Donella Meadows: Interventions at parameters (Rank 12) have minimal leverage;
              interventions altering systemic rules, information flows, and structural goals (Ranks
              6–1) achieve systemic transformation.
            </p>
          </div>
        </Panel>
      </div>

      {/* Strengths & Systemic Feedback */}
      {(evaluation.strengths.length > 0 || evaluation.systemicFeedback.length > 0) && (
        <Panel className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-tertiary flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-cyan-500" />
            Systems Dynamics Diagnostic Coaching
          </h3>

          {evaluation.strengths.length > 0 && (
            <div className="space-y-1.5">
              {evaluation.strengths.map((str, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-secondary">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{str}</span>
                </div>
              ))}
            </div>
          )}

          {evaluation.systemicFeedback.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-neutral-200 dark:border-(--hub-border)">
              {evaluation.systemicFeedback.map((fb, idx) => (
                <p key={idx} className="text-xs text-secondary leading-relaxed">
                  • {fb}
                </p>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
