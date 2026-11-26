'use client'

import React from 'react'
import { type InquiryEvaluation, type ModelMaturityTier } from '@learning-hub/core/model-inquiry'
import { Panel } from './Panel'
import { ProgressBar } from './Progress'
import { GitBranch, Maximize2, PlayCircle, Telescope, TrendingUp } from 'lucide-react'

export interface ModelInquiryHUDProps {
  evaluation: InquiryEvaluation
  scenarioTitle: string
  activePhase?:
    'initial_model' | 'extreme_perturbation' | 'simulative_animation' | 'bridging_synthesis'
}

const MATURITY_CONFIG: Record<
  ModelMaturityTier,
  { label: string; tone: string; description: string }
> = {
  folk_intuition: {
    label: 'Folk Intuition (Tier 1)',
    tone: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30',
    description:
      'Relies on unexamined experiential heuristics, vulnerable to correlation fallacies and conflating perceptual surface features with causal mechanisms.',
  },
  qualitative_mechanist: {
    label: 'Qualitative Mechanist (Tier 2)',
    tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
    description:
      'Traces linear cause-and-effect sequences, but struggles when extreme boundary perturbations expose contradictory deduction branches.',
  },
  perturbation_analyst: {
    label: 'Perturbation Analyst (Tier 3)',
    tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30',
    description:
      'Systematically pushes parameters to asymptotic limits (m -> 0, v -> c, friction -> 0), exposing contradictions and isolating structural invariants.',
  },
  gedanken_theorist: {
    label: 'Gedanken Theorist (Tier 4)',
    tone: 'bg-emerald-500/10 text-emerald-700 dark:text-status-success-text border-emerald-500/30',
    description:
      'Masters Gedankenexperiment modeling: fluidly operates boundary conditions, bridges intuitive anchors to abstract targets, and constructs canonical invariant models.',
  },
}

const PHASES: Array<{
  id: 'initial_model' | 'extreme_perturbation' | 'simulative_animation' | 'bridging_synthesis'
  title: string
  shortDesc: string
}> = [
  { id: 'initial_model', title: '1. Initial Model (M0)', shortDesc: 'Folk Assumptions' },
  { id: 'extreme_perturbation', title: '2. Extreme Case (EC)', shortDesc: 'Boundary Perturbation' },
  { id: 'simulative_animation', title: '3. Mental Run (SAF)', shortDesc: 'Contradiction Crucible' },
  { id: 'bridging_synthesis', title: '4. Bridging (M_k+1)', shortDesc: 'Canonical Invariant' },
]

export function ModelInquiryHUD({
  evaluation,
  scenarioTitle,
  activePhase = 'initial_model',
}: ModelInquiryHUDProps) {
  const maturity = MATURITY_CONFIG[evaluation.tier]

  return (
    <div className="space-y-4">
      {/* Top Banner: Composite Index & Maturity Tier */}
      <Panel className="space-y-4 border-l-4 border-l-indigo-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase tracking-wider font-semibold text-tertiary flex items-center gap-1">
                <Telescope className="h-3.5 w-3.5 text-indigo-500" />
                Model-Based Reasoning Index (MBRI)
              </span>
            </div>
            <h2 className="text-xl font-bold text-strong mt-0.5">{scenarioTitle}</h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-3xl font-extrabold text-strong tracking-tight">
                {evaluation.compositeIndex}
                <span className="text-sm font-medium text-tertiary">/100</span>
              </div>
              <div className="text-xs text-tertiary">Composite Score</div>
            </div>
            <div
              className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${maturity.tone}`}
            >
              {maturity.label}
            </div>
          </div>
        </div>

        {/* Clement 4-Phase Progress Cycle */}
        <div className="pt-2 border-t border-[var(--border-subtle)]">
          <div className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-2">
            Clement Model Construction Cycle (Clement 2008)
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {PHASES.map((phase) => {
              const isCurrent = activePhase === phase.id
              return (
                <div
                  key={phase.id}
                  className={`p-2.5 rounded-lg border transition-colors ${
                    isCurrent
                      ? 'border-indigo-500/50 bg-indigo-500/10 text-strong'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 text-secondary'
                  }`}
                >
                  <div className="text-xs font-medium">{phase.title}</div>
                  <div className="text-[11px] text-tertiary">{phase.shortDesc}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 4 Quantitative Dimensions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {/* 1. Extreme Case Diagnostic */}
          <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-secondary">
              <span className="flex items-center gap-1.5">
                <Maximize2 className="h-3.5 w-3.5 text-amber-500" />
                Extreme Case (ECDI)
              </span>
              <span className="font-bold text-strong">{evaluation.extremeCaseScore}%</span>
            </div>
            <ProgressBar value={evaluation.extremeCaseScore} />
            <p className="text-[11px] text-tertiary">Asymptotic limit testing</p>
          </div>

          {/* 2. Simulative Animation Fidelity */}
          <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-secondary">
              <span className="flex items-center gap-1.5">
                <PlayCircle className="h-3.5 w-3.5 text-sky-500" />
                Simulative Fidelity (SAF)
              </span>
              <span className="font-bold text-strong">{evaluation.animationFidelityScore}%</span>
            </div>
            <ProgressBar value={evaluation.animationFidelityScore} />
            <p className="text-[11px] text-tertiary">Mental kinetic animation</p>
          </div>

          {/* 3. Bridging Analogy */}
          <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-secondary">
              <span className="flex items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5 text-purple-500" />
                Bridging Analogy (BAS)
              </span>
              <span className="font-bold text-strong">{evaluation.bridgingAnalogyScore}%</span>
            </div>
            <ProgressBar value={evaluation.bridgingAnalogyScore} />
            <p className="text-[11px] text-tertiary">Anchor-to-target transfer</p>
          </div>

          {/* 4. Model Modification */}
          <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-secondary">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                Model Modification (MMS)
              </span>
              <span className="font-bold text-strong">{evaluation.modelModificationScore}%</span>
            </div>
            <ProgressBar value={evaluation.modelModificationScore} />
            <p className="text-[11px] text-tertiary">Canonical invariant synthesis</p>
          </div>
        </div>

        {/* Qualitative Maturity Summary */}
        <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs text-secondary leading-relaxed">
          <span className="font-semibold text-strong">Diagnostic Profile: </span>
          {maturity.description}
        </div>
      </Panel>
    </div>
  )
}
