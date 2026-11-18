'use client'

/**
 * @file apps/web/app/threshold/page.tsx
 * @description Threshold Concepts & Liminal Space Navigation Studio Page.
 *
 * Grounded in Jan Meyer and Ray Land's Pedagogical Framework:
 * - Meyer & Land (2003, 2005): Threshold Concepts and Troublesome Knowledge.
 * - Land, Cousin, Meyer, & Davies (2005): Implications for Course Design and Evaluation.
 * - Cousin (2006): An Introduction to Threshold Concepts.
 * - Perkins (1999): The Many Faces of Constructivism (Troublesome Knowledge).
 */

import React from 'react'
import { KeyRound, Sparkles, Layers, AlertTriangle, Compass } from 'lucide-react'
import { PageHeader } from '@/ui'
import { ThresholdStudio } from '@/components/ThresholdStudio'

export default function ThresholdPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header */}
      <PageHeader
        title="Threshold Concepts & Liminal Navigation Studio"
        subtitle="Identify and cross the transformative, irreversible, and troublesome conceptual portals of your discipline. Overcome ritualized mimicry and resolve cognitive oscillation in the liminal space."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-600 dark:text-amber-400">
              <KeyRound className="h-3.5 w-3.5" />
              <span>Meyer &amp; Land (2003) Gateways</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-600 dark:text-blue-400">
              <Compass className="h-3.5 w-3.5" />
              <span>Liminal Oscillation Tracker</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <Layers className="h-3.5 w-3.5" />
              <span>Mimicry Boundary Probes</span>
            </span>
          </div>
        }
      />

      {/* Main Studio Workbench */}
      <ThresholdStudio />

      {/* Learning Science Foundations Card */}
      <div className="rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-6">
        <div className="flex items-center gap-2.5 mb-3">
          <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <h2 className="text-base font-bold text-strong">
            Threshold Concepts &amp; Troublesome Knowledge Foundations
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-secondary leading-relaxed">
          <div className="space-y-1.5">
            <div className="font-semibold text-strong flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-amber-500" />
              The Portal Metaphor
            </div>
            <p>
              Threshold concepts are transformative doorways. Once crossed, a learner cannot see the
              world the same way again (irreversibility), and previously disconnected ideas suddenly
              crystallize into a coherent structure (integrative).
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="font-semibold text-strong flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5 text-blue-500" />
              The Liminal Space
            </div>
            <p>
              The unstable transitional corridor where learners oscillate between naive common-sense
              intuitions and new disciplinal lenses. Learners here often get &quot;stuck&quot; and
              require targeted ontological scaffolding.
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="font-semibold text-strong flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
              Ritualized Mimicry (Perkins 1999)
            </div>
            <p>
              Novices copy surface mathematical notation or buzzwords without understanding the
              underlying reality. Stress-testing with perturbed boundary problems breaks mimicry and
              demands genuine conceptual synthesis.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
