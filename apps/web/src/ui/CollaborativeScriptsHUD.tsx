'use client'

import React from 'react'
import type { CollaborativeEvaluation } from '@learning-hub/core'
import { Panel } from './Panel'
import { ProgressBar } from './Progress'
import {
  MessageSquare,
  Sparkles,
  GitMerge,
  Scale,
  Brain,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'

export interface CollaborativeScriptsHUDProps {
  evaluation: CollaborativeEvaluation
  scenarioTitle: string
}

const MATURITY_CONFIG: Record<
  CollaborativeEvaluation['maturityBand'],
  { label: string; tone: string; description: string }
> = {
  dialectical_synthesizer: {
    label: 'Dialectical Synthesizer',
    tone: 'bg-emerald-500/15 text-emerald-800 dark:text-status-success-text border-emerald-500/30',
    description:
      'Co-constructs higher-order invariant mental models by transactively operating on and reconciling opposing premises.',
  },
  transactive_critic: {
    label: 'Transactive Critic',
    tone: 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border-indigo-500/30',
    description:
      'High critical discrimination and counter-warrants; probes peer assumptions without fully unifying models.',
  },
  cumulative_agreer: {
    label: 'Cumulative Agreer',
    tone: 'bg-amber-500/15 text-amber-800 dark:text-status-warning-text border-amber-500/30',
    description:
      'Superficial consensus and parallel validations without critical cognitive conflict or deep transactive warrants.',
  },
  parallel_individualist: {
    label: 'Parallel Individualist',
    tone: 'bg-neutral-500/15 text-neutral-800 dark:text-neutral-300 border-neutral-500/30',
    description:
      'Isolated monologues; arguments are stated side-by-side without operating on or responding to peer premises.',
  },
}

export function CollaborativeScriptsHUD({
  evaluation,
  scenarioTitle,
}: CollaborativeScriptsHUDProps) {
  const maturity = MATURITY_CONFIG[evaluation.maturityBand]

  return (
    <div className="space-y-4">
      {/* Top Banner: Composite Index & Maturity Tier */}
      <Panel className="space-y-4 border-l-4 border-l-indigo-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase tracking-wider font-semibold text-tertiary flex items-center gap-1">
                <Brain className="h-3.5 w-3.5 text-ac-text" />
                Collaborative Epistemic Index (CEI)
              </span>
            </div>
            <h2 className="text-xl font-bold text-strong mt-0.5">{scenarioTitle}</h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-black text-strong">{evaluation.cei}/100</div>
              <span className="text-[11px] text-tertiary">CEI Score</span>
            </div>

            <div className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${maturity.tone}`}>
              {maturity.label}
            </div>
          </div>
        </div>

        <p className="text-xs text-secondary leading-relaxed">{maturity.description}</p>

        {/* 3 Core Quantitative Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-neutral-200 dark:border-(--hub-border)">
          <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-secondary flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5 text-ac-text" />
                TDI (Transactivity)
              </span>
              <span className="font-bold text-strong">{evaluation.tdi}%</span>
            </div>
            <ProgressBar value={evaluation.tdi / 100} />
            <span className="text-[10px] text-tertiary">
              Berkowitz & Gibbs (1983) Transactive Ratio
            </span>
          </div>

          <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-secondary flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-ac-text" />
                EED (Epistemic Depth)
              </span>
              <span className="font-bold text-strong">{evaluation.eed}%</span>
            </div>
            <ProgressBar value={evaluation.eed / 100} />
            <span className="text-[10px] text-tertiary">
              Weinberger & Fischer (2006) Causal Depth
            </span>
          </div>

          <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-secondary flex items-center gap-1">
                <Scale className="h-3.5 w-3.5 text-ac-text" />
                SCR (Script Rigor)
              </span>
              <span className="font-bold text-strong">{evaluation.scr}%</span>
            </div>
            <ProgressBar value={evaluation.scr / 100} />
            <span className="text-[10px] text-tertiary">
              Fischer et al. (2013) 4-Phase Completion
            </span>
          </div>
        </div>
      </Panel>

      {/* Speech Acts Breakdown & Invariants Identified */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Speech Acts */}
        <Panel className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-tertiary flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-ac-text" />
            Transactive Speech Acts Distribution
          </h3>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border border-neutral-200 dark:border-(--hub-border) bg-surface p-2">
              <span className="text-[11px] text-tertiary block">Critiques</span>
              <span className="text-base font-bold text-strong">
                {evaluation.transactiveCounts.transactive_critique ?? 0}
              </span>
            </div>
            <div className="rounded border border-neutral-200 dark:border-(--hub-border) bg-surface p-2">
              <span className="text-[11px] text-tertiary block">Extensions</span>
              <span className="text-base font-bold text-strong">
                {evaluation.transactiveCounts.transactive_extension ?? 0}
              </span>
            </div>
            <div className="rounded border border-neutral-200 dark:border-(--hub-border) bg-surface p-2">
              <span className="text-[11px] text-tertiary block">Syntheses</span>
              <span className="text-base font-bold text-strong">
                {evaluation.transactiveCounts.transactive_synthesis ?? 0}
              </span>
            </div>
            <div className="rounded border border-neutral-200 dark:border-(--hub-border) bg-surface p-2">
              <span className="text-[11px] text-tertiary block">Parallel Non-Transactive</span>
              <span className="text-base font-bold text-secondary">
                {evaluation.transactiveCounts.non_transactive ?? 0}
              </span>
            </div>
          </div>
        </Panel>

        {/* Synthesized Invariants */}
        <Panel className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-tertiary flex items-center gap-1.5">
            <GitMerge className="h-3.5 w-3.5 text-ac-text" />
            Reconciled Theoretical Invariants
          </h3>

          {evaluation.synthesizedInvariantsIdentified.length > 0 ? (
            <div className="space-y-2">
              {evaluation.synthesizedInvariantsIdentified.map((inv, idx) => (
                <div
                  key={idx}
                  className="rounded border border-emerald-500/20 bg-emerald-500/10 p-2.5 flex items-start gap-2"
                >
                  <CheckCircle2 className="h-4 w-4 text-status-success-text shrink-0 mt-0.5" />
                  <span className="text-xs font-medium text-emerald-800 dark:text-status-success-text">
                    {inv}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-status-warning-text shrink-0 mt-0.5" />
              <span>
                No explicit theoretical invariant was synthesized in the joint conclusion. Review
                competing perspectives to formulate an integrated reconciling rule.
              </span>
            </div>
          )}
        </Panel>
      </div>

      {/* Strengths & Pedagogical Feedback */}
      {(evaluation.strengths.length > 0 || evaluation.pedagogicalFeedback.length > 0) && (
        <Panel className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-tertiary">
            CSCL Epistemic Coaching &amp; Dialogue Feedback
          </h3>

          {evaluation.strengths.length > 0 && (
            <div className="space-y-1.5">
              {evaluation.strengths.map((str, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-secondary">
                  <CheckCircle2 className="h-3.5 w-3.5 text-status-success-text shrink-0 mt-0.5" />
                  <span>{str}</span>
                </div>
              ))}
            </div>
          )}

          {evaluation.pedagogicalFeedback.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-neutral-200 dark:border-(--hub-border)">
              {evaluation.pedagogicalFeedback.map((fb, idx) => (
                <p key={idx} className="text-xs text-secondary leading-relaxed">
                  {fb}
                </p>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
