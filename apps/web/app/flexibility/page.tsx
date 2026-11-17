'use client'

/**
 * @file app/flexibility/page.tsx
 * @description Cognitive Flexibility & Perspective Shifting Studio.
 *
 * Implements:
 * - Rand J. Spiro et al. (1988) Cognitive Flexibility Theory (CFT)
 * - Edward de Bono (1985) Six Thinking Hats & Lateral Thinking Modality
 * - Feltovich, Spiro & Coulson (1989) Reductive Oversimplification Trap Diagnostics
 * - FSRS-6 Generalization Deck Synthesis with Context-Free Stability Multipliers
 */

import React from 'react'
import { Brain, Compass, Layers, ShieldAlert, Sparkles } from 'lucide-react'
import { PageHeader } from '@/ui'
import { CognitiveFlexibilityStudio } from '@/components/CognitiveFlexibilityStudio'

export default function FlexibilityPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header */}
      <PageHeader
        title="Cognitive Flexibility & Perspective Shifting Studio"
        subtitle="Harness Spiro's Cognitive Flexibility Theory (1988) and De Bono's Six Thinking Hats (1985): criss-cross complex conceptual landscapes, re-represent ill-structured problems from orthogonal lenses, and conquer reductive oversimplification traps."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">
              <Layers className="h-3.5 w-3.5 text-cyan-400" />
              <span>Spiro CFT (1988)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-300">
              <Compass className="h-3.5 w-3.5 text-violet-400" />
              <span>De Bono (1985)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
              <span>Feltovich (1989)</span>
            </span>
          </div>
        }
      />

      {/* Scientific Foundation Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-cyan-400 uppercase tracking-wider">
            <Layers className="h-4 w-4" />
            <span>Landscape Criss-Crossing</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            Advanced knowledge in ill-structured domains cannot be learned through a single neat
            taxonomy. Learners must criss-cross the conceptual landscape by revisiting identical
            cases through multiple thematic routes.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-violet-400 uppercase tracking-wider">
            <Brain className="h-4 w-4" />
            <span>Multi-Perspective Dispersion</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            Fixating on a single thinking style (e.g. only empirical data or risk avoidance) creates
            cognitive rigidity. Tracking Shannon entropy across all six hats fosters
            high-dimensional cognitive flexibility.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-emerald-400 uppercase tracking-wider">
            <Sparkles className="h-4 w-4" />
            <span>Reductive Trap Immunity</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            Oversimplification traps like Additivity Bias (assuming linear effects) lead to
            catastrophic architectural failures. Disproving these biases yields robust,
            context-resilient transfer.
          </p>
        </div>
      </div>

      {/* Main Interactive Studio Workbench */}
      <CognitiveFlexibilityStudio />
    </div>
  )
}
