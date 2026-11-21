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
import { ClayIn } from '@/lib/motion'
import { AnalogicalTransferStudio } from '@/components/AnalogicalTransferStudio'

export default function AnalogyPage() {
  return (
    <ClayIn as="div" className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <PageHeader
        title="Analogical Transfer & Schema Induction Studio"
        subtitle="Harness Gick & Holyoak's Convergence Induction (1980, 1983) and Gentner's Structure-Mapping Theory (1983): discover isomorphic relational systems across disparate domains, reject superficial false analogies, and synthesize enduring universal schemas."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-bold text-status-info-text">
              <GitCompare className="h-3.5 w-3.5 text-status-info-text" />
              <span>Gentner (1983)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-300">
              <Layers className="h-3.5 w-3.5 text-indigo-400" />
              <span>Gick & Holyoak (1983)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-status-success-text">
              <Target className="h-3.5 w-3.5 text-status-success-text" />
              <span>Novick (1988)</span>
            </span>
          </div>
        }
      />

      {/* Scientific Foundation Overview Banner */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-status-info-text uppercase tracking-wider">
            <GitCompare className="h-4 w-4" />
            <span>Gentner Systematicity</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            Analogies map systems of relational predicates (especially higher-order causal chains
            like `CAUSE` and `PREVENTS`) rather than superficial entity attributes (color, size,
            domain vocabulary).
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-indigo-400 uppercase tracking-wider">
            <Brain className="h-4 w-4" />
            <span>Multi-Base Convergence</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            A single analog yields only ~30% spontaneous transfer. Juxtaposing two structurally
            isomorphic base stories with an explicit convergence schema surges spontaneous solution
            transfer to over 80%.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-status-success-text uppercase tracking-wider">
            <Sparkles className="h-4 w-4" />
            <span>Context-Free FSRS Stability</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            Transferring solutions across disparate contexts de-biases memory from local retrieval
            cues, conferring up to a 2.50x initial stability bonus in FSRS spaced repetition
            scheduling.
          </p>
        </div>
      </div>

      {/* Main Interactive Studio Workbench */}
      <AnalogicalTransferStudio />
    </ClayIn>
  )
}
