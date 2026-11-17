'use client'

/**
 * @file app/interleaving/page.tsx
 * @description Interleaved Problem Solving & Structural Invariance Studio.
 *
 * Implements:
 * - Doug Rohrer & Kelli Taylor (2007) Shuffled Mathematics Problem Practice
 * - Nate Kornell & Robert A. Bjork (2008) Inductive Category Learning via Juxtaposition
 * - Michelene Chi, Paul Feltovich, & Robert Glaser (1981) Novice Surface Decoys vs Expert Invariants
 * - FSRS-6 Spaced Retrieval Stability Scaling
 */

import React from 'react'
import { Brain, Shuffle, Sparkles, Target, Zap } from 'lucide-react'
import { PageHeader } from '@/ui'
import { InterleavingStudio } from '@/components/InterleavingStudio'

export default function InterleavingPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header */}
      <PageHeader
        title="Interleaved Problem Solving & Structural Invariance Studio"
        subtitle="Harness Rohrer & Taylor's Interleaving Effect (2007) and Kornell & Bjork's Inductive Juxtaposition (2008): practice across shuffled, contrasting problem types to break surface-feature illusions and master deep structural invariants."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-300">
              <Shuffle className="h-3.5 w-3.5 text-violet-400" />
              <span>Rohrer & Taylor (2007)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">
              <Brain className="h-3.5 w-3.5 text-cyan-400" />
              <span>Kornell & Bjork (2008)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
              <Target className="h-3.5 w-3.5 text-emerald-400" />
              <span>Chi et al. (1981)</span>
            </span>
          </div>
        }
      />

      {/* Scientific Foundation Overview Banner */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-violet-400 uppercase tracking-wider">
            <Shuffle className="h-4 w-4" />
            <span>Category Discrimination</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            Blocked practice ($AAAA BBBB$) tricks the brain into assuming the algorithm beforehand.
            Interleaving ($ABCCBA$) forces active strategy selection on every problem, yielding a
            +43% delayed retention advantage.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-cyan-400 uppercase tracking-wider">
            <Zap className="h-4 w-4" />
            <span>Surface Decoy Traps</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            Novices categorize problems by surface storylines (e.g. &apos;cargo transport&apos; vs
            &apos;telescope booking&apos;). Experts classify by mathematical invariants (discrete vs
            continuous, negative edge cycle tolerance).
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-emerald-400 uppercase tracking-wider">
            <Sparkles className="h-4 w-4" />
            <span>FSRS Stability Boost</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            Discriminating problems correctly under high surface similarity scales initial memory
            stability in FSRS up to 2.45x, transforming fragile recognition into enduring conceptual
            mastery.
          </p>
        </div>
      </div>

      {/* Main Interactive Studio Workbench */}
      <InterleavingStudio />
    </div>
  )
}
