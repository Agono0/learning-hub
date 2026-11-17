'use client'

/**
 * @file app/equilibrium/page.tsx
 * @description Reflective Equilibrium & Epistemic Calibration Studio.
 *
 * Implements:
 * - John Rawls (1971) & Nelson Goodman (1955) Wide Reflective Equilibrium (WRE)
 * - Glenn W. Brier (1950) & Philip Tetlock (2005) Epistemic Probability Calibration
 * - Triad Dissonance Resolution across Judgments, Principles, and Background Theories
 */

import React from 'react'
import { Brain, GitBranch, Network, Scale, Sparkles, Target } from 'lucide-react'
import { PageHeader } from '@/ui'
import { ReflectiveEquilibriumStudio } from '@/components/ReflectiveEquilibriumStudio'

export default function EquilibriumPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header */}
      <PageHeader
        title="Reflective Equilibrium & Epistemic Calibration Studio"
        subtitle="Harness Rawls' Wide Reflective Equilibrium (1971) and Tetlock's Superforecasting Calibration (2005): resolve clashes between abstract principles and concrete case intuitions, map epistemic coherence networks, and eliminate overconfidence bias."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">
              <Network className="h-3.5 w-3.5 text-cyan-400" />
              <span>Rawls WRE (1971)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-300">
              <Target className="h-3.5 w-3.5 text-violet-400" />
              <span>Tetlock Calibration</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
              <Scale className="h-3.5 w-3.5 text-amber-400" />
              <span>Goodman (1955)</span>
            </span>
          </div>
        }
      />

      {/* Scientific Foundation Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-cyan-400 uppercase tracking-wider">
            <GitBranch className="h-4 w-4" />
            <span>Three Epistemic Tiers</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            Coherence is achieved through bidirectional adjustments between concrete Considered
            Judgments (C), abstract Principles (P), and Background Theories (B). Neither level has
            dogmatic priority.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-violet-400 uppercase tracking-wider">
            <Brain className="h-4 w-4" />
            <span>Triad Conflict Resolution</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            When abstract principles clash with empirical realities (e.g. CAP Theorem vs
            zero-downtime checkout), learners must systematically revise principles, qualify
            judgments, or expand theoretical models.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-emerald-400 uppercase tracking-wider">
            <Sparkles className="h-4 w-4" />
            <span>Brier Score Calibration</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            Overconfidence is the primary barrier to lifelong learning. Tracking the Brier
            Calibration Index (BCI) trains learners to accurately align subjective confidence with
            actual empirical ground truth.
          </p>
        </div>
      </div>

      {/* Main Interactive Studio Workbench */}
      <ReflectiveEquilibriumStudio />
    </div>
  )
}
