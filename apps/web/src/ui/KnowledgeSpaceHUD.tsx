/**
 * @file KnowledgeSpaceHUD.tsx
 * @description Real-time Cognitive Telemetry HUD for Knowledge Space Theory & Adaptive Assessment
 *
 * Grounded in:
 * - Jean-Paul Doignon & Jean-Claude Falmagne (1985, 1999) Knowledge Spaces & Fringes
 * - Jean-Claude Falmagne & Jean-Paul Doignon (1988) Markovian Bayesian belief updating
 * - Shannon Entropy H(P) uncertainty tracking and convergence metrics
 * - Inner fringe K⁻ (frontier retention) & Outer fringe K⁺ (proximal ZPD readiness)
 */

import React from 'react'
import type {
  AdaptiveAssessmentSession,
  LearnerDiagnosis,
} from '@learning-hub/core/knowledge-space'
import { Badge } from './Feedback'
import { Panel } from './Panel'
import { ProgressBar } from './Progress'
import { Activity, Compass, Layers, Network, Sparkles } from 'lucide-react'

export interface KnowledgeSpaceHUDProps {
  session?: AdaptiveAssessmentSession | null
  diagnosis?: LearnerDiagnosis | null
  domainTitle?: string
  totalDomainItems?: number
  className?: string
}

export function KnowledgeSpaceHUD({
  session,
  diagnosis,
  domainTitle = 'Knowledge Space',
  totalDomainItems = 6,
  className = '',
}: KnowledgeSpaceHUDProps) {
  const currentEntropy = session?.currentEntropy ?? 2.0
  const maxInitialEntropy = Math.log2(Math.max(2, totalDomainItems * 2))
  const entropyPercentage = Math.max(
    0,
    Math.min(100, Math.round((1 - currentEntropy / maxInitialEntropy) * 100)),
  )

  const confidencePct = Math.round((session?.confidence ?? 0.25) * 100)
  const masteredCount = diagnosis?.diagnosedState.itemIds.length ?? 0
  const outerFringeCount = diagnosis?.outerFringe.length ?? 1
  const innerFringeCount = diagnosis?.innerFringe.length ?? 0

  return (
    <Panel
      className={`p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4 ${className}`}
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400">
            <Network className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider uppercase text-neutral-500 dark:text-neutral-400">
                KST Adaptive Assessment Engine
              </span>
              <Badge tone="accent">Doignon & Falmagne 1999</Badge>
            </div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {domainTitle}
            </h3>
          </div>
        </div>

        {session?.isTerminated ? (
          <Badge tone="success" className="px-3 py-1 text-xs">
            Assessment Complete ({session.terminationReason.replace('_', ' ')})
          </Badge>
        ) : (
          <Badge tone="neutral" className="px-3 py-1 text-xs">
            Step {session?.step ?? 0} • Adaptive Probe Active
          </Badge>
        )}
      </div>

      {/* Main telemetry metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Metric 1: Diagnosed Knowledge State */}
        <div className="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/70 dark:border-neutral-700/50">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1">
            <span className="text-xs font-medium">State Cardinality |K|</span>
            <Layers className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
          <div className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
            {masteredCount}{' '}
            <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">
              / {totalDomainItems} items
            </span>
          </div>
          <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 block truncate">
            {diagnosis?.diagnosedState.stateId === '∅'
              ? '∅ (Empty Base)'
              : (diagnosis?.diagnosedState.stateId ?? 'Initial Prior')}
          </span>
        </div>

        {/* Metric 2: Outer Fringe K⁺ (ZPD) */}
        <div className="p-3 rounded-lg bg-teal-50/60 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-800/40">
          <div className="flex items-center justify-between text-teal-700 dark:text-teal-300 mb-1">
            <span className="text-xs font-medium">Outer Fringe K⁺ (ZPD)</span>
            <Compass className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
          <div className="text-xl font-bold text-teal-900 dark:text-teal-100">
            {outerFringeCount}{' '}
            <span className="text-xs font-normal text-teal-700 dark:text-teal-300">
              ready to learn
            </span>
          </div>
          <span className="text-xs text-teal-600 dark:text-teal-400 mt-0.5 block truncate">
            {diagnosis?.outerFringe.join(', ') || 'No immediate items'}
          </span>
        </div>

        {/* Metric 3: Belief Entropy Convergence */}
        <div className="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/70 dark:border-neutral-700/50">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1">
            <span className="text-xs font-medium">Belief Entropy H(P)</span>
            <Activity className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
          <div className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
            {currentEntropy.toFixed(2)}{' '}
            <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">bits</span>
          </div>
          <div className="mt-1.5">
            <ProgressBar value={entropyPercentage} />
          </div>
        </div>

        {/* Metric 4: Bayesian Confidence */}
        <div className="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/70 dark:border-neutral-700/50">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1">
            <span className="text-xs font-medium">Diagnosis Confidence</span>
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
          <div className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
            {confidencePct}%
          </div>
          <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 block">
            {confidencePct >= 80
              ? 'Converged (High)'
              : confidencePct >= 50
                ? 'Iterating (Medium)'
                : 'Exploring (Broad)'}
          </span>
        </div>
      </div>

      {/* Frontier badges row */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-neutral-200/60 dark:border-neutral-800/60 text-xs">
        <span className="font-medium text-neutral-600 dark:text-neutral-300">Frontier Status:</span>
        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Inner Fringe K⁻ ({innerFringeCount}): {diagnosis?.innerFringe.join(', ') || 'None'}
        </span>
        <span className="text-neutral-300 dark:text-neutral-700">•</span>
        <span className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400">
          <span className="w-2 h-2 rounded-full bg-teal-500" />
          Outer Fringe K⁺ ({outerFringeCount}): {diagnosis?.outerFringe.join(', ') || 'None'}
        </span>
      </div>
    </Panel>
  )
}
