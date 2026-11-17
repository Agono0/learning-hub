'use client'

/**
 * @file app/analogy/page.tsx
 * @description Analogical Transfer & Schema Induction Studio.
 *
 * Implements:
 * - Mary L. Gick & Keith J. Holyoak (1980, 1983) Cross-Domain Convergence Schema Induction
 * - Dedre Gentner (1983) Structure-Mapping Theory & Systematicity Principle
 * - Laura R. Novick (1988) Novice Surface Traps vs Expert Relational Transfer
 * - FSRS-6 Spaced Retrieval Generalization Deck Synthesis
 */

import React from 'react'
import { Brain, GitCompare, Layers, Sparkles, Target } from 'lucide-react'
import { PageHeader } from '@/ui'
import { AnalogicalTransferStudio } from '@/components/AnalogicalTransferStudio'

export default function AnalogyPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header */}
      <PageHeader
        title="Analogical Transfer & Schema Induction Studio"
        subtitle="Harness Gick & Holyoak's Convergence Induction (1980, 1983) and Gentner's Structure-Mapping Theory (1983): discover isomorphic relational systems across disparate domains, reject superficial false analogies, and synthesize enduring universal schemas."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">
              <GitCompare className="h-3.5 w-3.5 text-cyan-400" />
              <span>Gentner (1983)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-300">
              <Layers className="h-3.5 w-3.5 text-violet-400" />
              <span>Gick & Holyoak (1983)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
              <Target className="h-3.5 w-3.5 text-emerald-400" />
              <span>Novick (1988)</span>
            </span>
          </div>
        }
      />

      {/* Scientific Foundation Overview Banner */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-cyan-400 uppercase tracking-wider">
            <GitCompare className="h-4 w-4" />
            <span>Gentner Systematicity</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            Analogies map systems of relational predicates (especially higher-order causal chains
            like `CAUSE` and `PREVENTS`) rather than superficial entity attributes (color, size,
            domain vocabulary).
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-violet-400 uppercase tracking-wider">
            <Brain className="h-4 w-4" />
            <span>Multi-Base Convergence</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            A single analog yields only ~30% spontaneous transfer. Juxtaposing two structurally
            isomorphic base stories with an explicit convergence schema surges spontaneous solution
            transfer to over 80%.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-emerald-400 uppercase tracking-wider">
            <Sparkles className="h-4 w-4" />
            <span>Context-Free FSRS Stability</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            Transferring solutions across disparate contexts de-biases memory from local retrieval
            cues, conferring up to a 2.50x initial stability bonus in FSRS spaced repetition
            scheduling.
          </p>
        </div>
      </div>

      {/* Main Interactive Studio Workbench */}
      <AnalogicalTransferStudio />
    </div>
  )
}
