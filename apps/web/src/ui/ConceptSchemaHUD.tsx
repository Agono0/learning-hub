'use client'

import React from 'react'
import { AlertTriangle, Brain, CheckCircle2, GitBranch, Network, Sparkles } from 'lucide-react'
import { type SchemaRigorMetrics, type SubsumptionRole } from '@learning-hub/core/knowledge-graph'
import { cx } from './cx'

export interface ConceptSchemaHUDProps {
  metrics: SchemaRigorMetrics
  schemaTitle: string
  domain: string
  activeConceptLabel?: string | null
  className?: string
}

export function ConceptSchemaHUD({
  metrics,
  schemaTitle,
  domain,
  activeConceptLabel,
  className,
}: ConceptSchemaHUDProps) {
  const {
    totalNodes,
    totalPropositions,
    hierarchicalDepth,
    propositionalValidityScore,
    crossLinkSynthesisRatio,
    meaningfulLearningIndex,
    dominantAssimilationMode,
    detectedAnomalies,
    isSchemaSound,
  } = metrics

  const formatRoleLabel = (role: SubsumptionRole): string => {
    switch (role) {
      case 'root_anchor':
        return 'Root Anchor Schema'
      case 'derivative_subsumption':
        return 'Derivative Subsumption'
      case 'correlative_subsumption':
        return 'Correlative Subsumption'
      case 'superordinate_synthesis':
        return 'Superordinate Synthesis'
      case 'combinatorial_link':
        return 'Combinatorial Learning'
    }
  }

  const highSeverityAnomalies = detectedAnomalies.filter((a) => a.severity === 'high').length

  return (
    <div
      className={cx(
        'relative flex flex-col overflow-hidden rounded-2xl border bg-slate-900/90 shadow-2xl backdrop-blur-xl transition-all',
        isSchemaSound
          ? 'border-emerald-500/30 shadow-emerald-950/20'
          : 'border-amber-500/40 shadow-amber-950/20',
        className,
      )}
    >
      {/* Top Banner: Schema Context & Meaningful Learning Index */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5 bg-slate-950/50">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Network className="h-4 w-4" />
          </span>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-faint block">
              Ausubel-Novak Propositional Schema
            </span>
            <span className="text-xs font-bold text-white">
              {domain.replace('_', ' ').toUpperCase()} • {schemaTitle}
            </span>
          </div>
        </div>

        {/* Cognitive Health & Active Concept Badge */}
        <div className="flex items-center gap-3">
          {highSeverityAnomalies > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-extrabold text-status-warning-text animate-pulse">
              <AlertTriangle className="h-3.5 w-3.5 text-status-warning-text" />
              {highSeverityAnomalies} Misconception{' '}
              {highSeverityAnomalies === 1 ? 'Anomaly' : 'Anomalies'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-extrabold text-status-success-text">
              <CheckCircle2 className="h-3.5 w-3.5 text-status-success-text" />
              Scientifically Sound Schema
            </span>
          )}

          {activeConceptLabel && (
            <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono font-bold text-indigo-300">
              <Brain className="h-3.5 w-3.5 text-indigo-400" />
              <span>{activeConceptLabel}</span>
            </div>
          )}
        </div>
      </div>

      {/* Telemetry Metric Grid */}
      <div className="grid grid-cols-2 divide-x divide-white/5 border-b border-white/5 sm:grid-cols-4 bg-slate-900/50 text-center text-xs">
        {/* Metric 1: Propositional Validity Score */}
        <div className="p-3">
          <span className="text-[10px] uppercase font-semibold text-faint block mb-0.5">
            Propositional Validity (PVS)
          </span>
          <div className="flex items-center justify-center gap-1.5">
            <span
              className={cx(
                'font-mono text-base font-black',
                propositionalValidityScore >= 0.8
                  ? 'text-status-success-text'
                  : propositionalValidityScore >= 0.6
                    ? 'text-status-warning-text'
                    : 'text-danger-text',
              )}
            >
              {Math.round(propositionalValidityScore * 100)}%
            </span>
            <span className="text-[10px] text-faint font-mono">({totalPropositions} props)</span>
          </div>
          <span className="text-[10px] text-tertiary">Novak (1984) Precision</span>
        </div>

        {/* Metric 2: Cross-Link Synthesis Ratio */}
        <div className="p-3">
          <span className="text-[10px] uppercase font-semibold text-faint block mb-0.5">
            Cross-Link Synthesis (CSD)
          </span>
          <div className="flex items-center justify-center gap-1.5">
            <span className="font-mono text-base font-black text-status-info-text">
              {Math.round(crossLinkSynthesisRatio * 100)}%
            </span>
            <span className="text-[10px] text-faint font-mono">lateral</span>
          </div>
          <span className="text-[10px] text-tertiary">Creative Schema Leap</span>
        </div>

        {/* Metric 3: Meaningful Learning Index */}
        <div className="p-3">
          <span className="text-[10px] uppercase font-semibold text-faint block mb-0.5">
            Meaningful Learning Index
          </span>
          <div className="flex items-center justify-center gap-1.5">
            <span className="font-mono text-base font-black text-indigo-300">
              {meaningfulLearningIndex}
            </span>
            <span className="text-[10px] text-faint font-mono">/ 100</span>
          </div>
          <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="bg-indigo-500 transition-all duration-300"
              style={{ width: `${meaningfulLearningIndex}%` }}
            />
          </div>
        </div>

        {/* Metric 4: Dominant Assimilation Mode */}
        <div className="p-3">
          <span className="text-[10px] uppercase font-semibold text-faint block mb-0.5">
            Dominant Assimilation
          </span>
          <div className="flex items-center justify-center gap-1">
            <span className="font-mono text-xs font-bold text-white">
              {formatRoleLabel(dominantAssimilationMode)}
            </span>
          </div>
          <span className="text-[10px] text-tertiary">
            Depth: {hierarchicalDepth} Levels • {totalNodes} Nodes
          </span>
        </div>
      </div>

      {/* Integrative Reconciliation Footer Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 bg-slate-950/70 text-xs">
        <div className="flex items-center gap-2 text-secondary">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
          <span>
            Ausubelian Assimilation:{' '}
            <strong className="text-white">
              Meaningful learning subsumes concepts into hierarchical propositions rather than rote
              associations.
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-faint" />
          <span className="text-faint font-mono text-[11px]">
            {totalNodes} concepts • {totalPropositions} propositions
          </span>
        </div>
      </div>
    </div>
  )
}
