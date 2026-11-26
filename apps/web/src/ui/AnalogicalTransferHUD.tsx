'use client'

/**
 * @file AnalogicalTransferHUD.tsx
 * @description Real-time Head-Up Display telemetry component for Analogical Transfer & Structure Mapping.
 *
 * Visualizes:
 * - Dedre Gentner (1983) Systematicity Score (0 to 100)
 * - Gick & Holyoak (1983) Spontaneous Transfer Probability (%)
 * - Relational Predicate Preservation Accuracy
 * - FSRS Analogical Schema Stability Bonus (1.30x to 2.50x)
 */

import React from 'react'
import { MappingEvaluationTelemetry } from '@learning-hub/core/analogy/structure-mapping-engine'
import { Badge } from './Feedback'
import { ProgressBar } from './Progress'
import {
  Brain,
  CheckCircle2,
  GitCompare,
  HelpCircle,
  Network,
  Share2,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react'

export interface AnalogicalTransferHUDProps {
  telemetry: MappingEvaluationTelemetry | null
  currentSuiteTitle: string
  targetDomainName: string
  baseDomainName: string
  className?: string
}

export function AnalogicalTransferHUD({
  telemetry,
  currentSuiteTitle,
  targetDomainName,
  baseDomainName,
  className = '',
}: AnalogicalTransferHUDProps) {
  const systematicity = telemetry?.systematicityScore ?? 0
  const transferProb = telemetry ? Math.round(telemetry.spontaneousTransferProbability * 100) : 10
  const entityAcc = telemetry ? Math.round(telemetry.entityAlignmentAccuracy * 100) : 0
  const predAcc = telemetry ? Math.round(telemetry.predicatePreservationAccuracy * 100) : 0
  const stabilityBonus = telemetry?.fsrsStabilityBonus ?? 1.3

  // Status badge based on Gentner Systematicity
  const getSystematicityBadge = () => {
    if (systematicity >= 80) {
      return (
        <Badge tone="success" className="gap-1.5 px-2.5 py-0.5">
          <Sparkles className="h-3 w-3 text-status-success-text" />
          <span>High Systematicity ({systematicity}/100)</span>
        </Badge>
      )
    }
    if (systematicity >= 50) {
      return (
        <Badge tone="warning" className="gap-1.5 px-2.5 py-0.5">
          <Share2 className="h-3 w-3 text-status-warning-text" />
          <span>Relational Alignment ({systematicity}/100)</span>
        </Badge>
      )
    }
    return (
      <Badge tone="neutral" className="gap-1.5 px-2.5 py-0.5">
        <GitCompare className="h-3 w-3 text-faint" />
        <span>Awaiting Mapping ({systematicity}/100)</span>
      </Badge>
    )
  }

  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl backdrop-blur-md transition-all ${className}`}
    >
      {/* Top Bar: Cross-Domain Mapping Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-status-info-text ring-1 ring-sky-500/25">
            <GitCompare className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold tracking-wider text-faint uppercase">
                Cross-Domain Isomorphism
              </span>
              <Badge tone="cyan" className="text-[10px]">
                {baseDomainName} &rarr; {targetDomainName}
              </Badge>
            </div>
            <h3 className="text-sm font-bold text-slate-100">{currentSuiteTitle}</h3>
          </div>
        </div>

        <div className="flex items-center gap-2">{getSystematicityBadge()}</div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Metric 1: Gentner Systematicity Score */}
        <div className="flex flex-col rounded-xl border border-slate-800/60 bg-slate-950/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-faint font-medium">Systematicity</span>
            <Network className="h-3.5 w-3.5 text-status-info-text" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-slate-100">{systematicity}</span>
            <span className="text-xs text-tertiary">/ 100</span>
          </div>
          <div className="mt-2">
            <ProgressBar value={systematicity / 100} />
          </div>
        </div>

        {/* Metric 2: Spontaneous Transfer Forecast */}
        <div className="flex flex-col rounded-xl border border-slate-800/60 bg-slate-950/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-faint font-medium">Transfer Forecast</span>
            <Brain className="h-3.5 w-3.5 text-indigo-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-slate-100">{transferProb}%</span>
            <span className="text-xs text-tertiary">spontaneous</span>
          </div>
          <div className="mt-2">
            <ProgressBar value={transferProb / 100} />
          </div>
        </div>

        {/* Metric 3: Entity 1-to-1 Alignment */}
        <div className="flex flex-col rounded-xl border border-slate-800/60 bg-slate-950/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-faint font-medium">Entity Alignment</span>
            <Target className="h-3.5 w-3.5 text-status-success-text" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-slate-100">{entityAcc}%</span>
            <span className="text-xs text-tertiary">nodes matched</span>
          </div>
          <div className="mt-2">
            <ProgressBar value={entityAcc / 100} />
          </div>
        </div>

        {/* Metric 4: Predicate Preservation */}
        <div className="flex flex-col rounded-xl border border-slate-800/60 bg-slate-950/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-faint font-medium">Predicate Match</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-status-info-text" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-slate-100">{predAcc}%</span>
            <span className="text-xs text-tertiary">relations intact</span>
          </div>
          <div className="mt-2">
            <ProgressBar value={predAcc / 100} />
          </div>
        </div>
      </div>

      {/* Sub-Banner: FSRS Retention & Inductive Learning Guidance */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-900/30 bg-sky-950/20 px-3.5 py-2.5 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-status-info-text" />
          <span>
            <strong>FSRS Analogical Generalization:</strong> Inducing relational schemas increases
            initial stability by{' '}
            <span className="font-semibold text-status-success-text">{stabilityBonus}x</span>,
            conferring deep resistance to contextual forgetting.
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-faint">
          <HelpCircle className="h-3.5 w-3.5 text-tertiary" />
          <span>Gentner (1983) Systematicity Principle</span>
        </div>
      </div>
    </div>
  )
}
