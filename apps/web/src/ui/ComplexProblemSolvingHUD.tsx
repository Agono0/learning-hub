'use client'

import React from 'react'
import {
  type CPSSessionEvaluation,
  type CognitiveControlTier,
  type DornerPathology,
} from '@learning-hub/core/complex-problem-solving'
import { Panel } from './Panel'
import { ProgressBar } from './Progress'
import {
  Activity,
  AlertTriangle,
  Compass,
  Cpu,
  Eye,
  GitPullRequest,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react'

export interface ComplexProblemSolvingHUDProps {
  evaluation: CPSSessionEvaluation
  scenarioTitle: string
  currentCycle?: number
}

const CONTROL_TIER_CONFIG: Record<
  CognitiveControlTier,
  { label: string; tone: string; description: string }
> = {
  ballistic_reactive: {
    label: 'Ballistic Reactive (Tier 1)',
    tone: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30',
    description:
      'Ballistic action and encapsulation: executes unmonitored interventions or retreats into comfortable trivial variables while critical macro-dynamics collapse.',
  },
  symptom_firefighter: {
    label: 'Symptom Firefighter (Tier 2)',
    tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
    description:
      'Repair-service mentality: attacks immediate surface crises sequentially, vulnerable to thematic vagabonding while leaving delayed side-effect cascades unchecked.',
  },
  strategic_coordinator: {
    label: 'Strategic Coordinator (Tier 3)',
    tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30',
    description:
      'Proficient dynamic control: maintains safe operational limits across most variables and monitors feedback regularly, with occasional vulnerability to non-linear surges.',
  },
  systems_governor: {
    label: 'Systems Governor (Tier 4)',
    tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    description:
      'Mastery of complex problem solving (Dörner 1996): coordinates polytelic trade-offs, anticipates delayed 2nd-order cascades, and maintains steady strategic focus.',
  },
}

const PATHOLOGY_ICONS: Record<DornerPathology, React.ElementType> = {
  ballistic_action: ShieldAlert,
  repair_service_behavior: Activity,
  thematic_vagabonding: Compass,
  encapsulation: Cpu,
  linear_extrapolation: AlertTriangle,
}

export function ComplexProblemSolvingHUD({
  evaluation,
  scenarioTitle,
  currentCycle,
}: ComplexProblemSolvingHUDProps) {
  const tierConfig = CONTROL_TIER_CONFIG[evaluation.tier]

  return (
    <div className="space-y-4">
      {/* Top Banner: Composite Index & Cognitive Control Tier */}
      <Panel className="space-y-4 border-l-4 border-l-cyan-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider font-semibold text-tertiary flex items-center gap-1">
                <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-500" />
                Complex Problem Solving Index (CPSI)
              </span>
              {currentCycle !== undefined && (
                <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-secondary border border-[var(--border-subtle)]">
                  Cycle #{currentCycle}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-strong mt-0.5">{scenarioTitle}</h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-3xl font-extrabold text-strong tracking-tight">
                {evaluation.compositeCPSIndex}
                <span className="text-sm font-medium text-tertiary">/100</span>
              </div>
              <div className="text-xs text-tertiary">Dörner Control Score</div>
            </div>
            <div
              className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${tierConfig.tone}`}
            >
              {tierConfig.label}
            </div>
          </div>
        </div>

        {/* 4 Quantitative Dimensions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {/* 1. Dynamic Control Efficiency */}
          <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-secondary">
              <span className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-emerald-500" />
                Dynamic Control (DCE)
              </span>
              <span className="font-bold text-strong">{evaluation.controlEfficiency}%</span>
            </div>
            <ProgressBar value={evaluation.controlEfficiency} />
            <p className="text-[11px] text-tertiary">Safety envelope stability</p>
          </div>

          {/* 2. Side-Effect Anticipation Index */}
          <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-secondary">
              <span className="flex items-center gap-1.5">
                <GitPullRequest className="h-3.5 w-3.5 text-indigo-500" />
                Side-Effect Anticipation (SEAI)
              </span>
              <span className="font-bold text-strong">{evaluation.sideEffectAnticipation}%</span>
            </div>
            <ProgressBar value={evaluation.sideEffectAnticipation} />
            <p className="text-[11px] text-tertiary">2nd-order cascade mitigation</p>
          </div>

          {/* 3. Thematic Focus Score */}
          <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-secondary">
              <span className="flex items-center gap-1.5">
                <Compass className="h-3.5 w-3.5 text-purple-500" />
                Thematic Focus (TFS)
              </span>
              <span className="font-bold text-strong">{evaluation.thematicFocus}%</span>
            </div>
            <ProgressBar value={evaluation.thematicFocus} />
            <p className="text-[11px] text-tertiary">Polytelic consistency</p>
          </div>

          {/* 4. Feedback Monitoring Ratio */}
          <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-secondary">
              <span className="flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-sky-500" />
                Feedback Monitoring (FMR)
              </span>
              <span className="font-bold text-strong">{evaluation.feedbackMonitoring}%</span>
            </div>
            <ProgressBar value={evaluation.feedbackMonitoring} />
            <p className="text-[11px] text-tertiary">Observable tracking fidelity</p>
          </div>
        </div>

        {/* Qualitative Maturity Summary */}
        <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs text-secondary leading-relaxed">
          <span className="font-semibold text-strong">Diagnostic Profile: </span>
          {tierConfig.description}
        </div>

        {/* Detected Dörner Pathologies */}
        {evaluation.detectedPathologies.length > 0 && (
          <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Diagnosed Failure Pathologies (Dörner 1996)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {evaluation.detectedPathologies.map((pathology, idx) => {
                const Icon = PATHOLOGY_ICONS[pathology.pathology] || AlertTriangle
                return (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/5 space-y-1"
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-rose-700 dark:text-rose-400">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {pathology.title}
                    </div>
                    <div className="text-[11px] text-secondary leading-normal">
                      <span className="font-medium text-strong">Evidence: </span>
                      {pathology.evidence}
                    </div>
                    <div className="text-[11px] text-tertiary leading-normal pt-0.5">
                      <span className="font-medium text-secondary">Remedy: </span>
                      {pathology.mitigation}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Panel>
    </div>
  )
}
