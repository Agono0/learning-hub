'use client'

/**
 * @file apps/web/app/epistemic/page.tsx
 * @description Epistemic Network Analysis (ENA) & Cognitive Discourse Studio Page.
 *
 * Grounded in Quantitative Ethnography and Learning Analytics:
 * - David Williamson Shaffer (2016): Quantitative Ethnography.
 * - Shaffer, Collier, & Ruis (2016): A Tutorial on Epistemic Network Analysis.
 * - Siebert-Evenstone et al. (2017): Modeling Semantic Co-occurrence Using Moving Stanza Windows.
 */

import React from 'react'
import { Network, GitGraph, Compass, Sparkles } from 'lucide-react'
import { PageHeader } from '@/ui'
import { EpistemicNetworkStudio } from '@/components/EpistemicNetworkStudio'

export default function EpistemicNetworkPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header */}
      <PageHeader
        title="Epistemic Network Analysis Studio"
        subtitle="Model how conceptual principles, empirical observations, and metacognitive monitoring interlock in learning discourse using moving stanza windows, sphere normalization, and SVD dimensional reduction."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-600 dark:text-blue-400">
              <Network className="h-3.5 w-3.5" />
              <span>Shaffer (2016) Quantitative Ethnography</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <GitGraph className="h-3.5 w-3.5" />
              <span>Moving Stanza Co-occurrence</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-600 dark:text-violet-400">
              <Compass className="h-3.5 w-3.5" />
              <span>SVD 2D Epistemic Space</span>
            </span>
          </div>
        }
      />

      {/* Main Interactive Studio Workbench */}
      <EpistemicNetworkStudio />

      {/* Learning Science Foundations Card */}
      <div className="rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-6">
        <div className="flex items-center gap-2.5 mb-3">
          <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-base font-bold text-strong">
            Learning Analytics Foundations: Quantitative Ethnography (Shaffer 2016)
          </h2>
        </div>
        <p className="text-xs text-secondary leading-relaxed mb-4">
          Expertise is not merely possessing isolated pieces of knowledge; it is having rich,
          interlocked networks of connections between skills, knowledge, identities, values, and
          epistemologies (Shaffer 2016). Epistemic Network Analysis mathematically formalizes these
          cognitive structures.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="rounded-lg bg-white dark:bg-(--hub-panel) p-3 border border-neutral-200 dark:border-(--hub-border)">
            <div className="font-semibold text-strong mb-1 flex items-center gap-1.5">
              <GitGraph className="h-4 w-4 text-blue-500" />
              Moving Stanzas
            </div>
            <p className="text-secondary leading-relaxed">
              Utterances occurring in temporal proximity share conversational context. Accumulating
              co-occurrences within a sliding window of 3-5 turns creates symmetric adjacency
              matrices capturing shared cognitive context.
            </p>
          </div>

          <div className="rounded-lg bg-white dark:bg-(--hub-panel) p-3 border border-neutral-200 dark:border-(--hub-border)">
            <div className="font-semibold text-strong mb-1 flex items-center gap-1.5">
              <Network className="h-4 w-4 text-emerald-500" />
              Sphere Normalization
            </div>
            <p className="text-secondary leading-relaxed">
              Projecting network edge vectors onto a unit hypersphere eliminates conversational
              verbosity bias: a learner who speaks twice as much does not artificially inflate their
              epistemic connectivity (Shaffer et al. 2016).
            </p>
          </div>

          <div className="rounded-lg bg-white dark:bg-(--hub-panel) p-3 border border-neutral-200 dark:border-(--hub-border)">
            <div className="font-semibold text-strong mb-1 flex items-center gap-1.5">
              <Compass className="h-4 w-4 text-violet-500" />
              SVD Dimensional Reduction
            </div>
            <p className="text-secondary leading-relaxed">
              Singular Value Decomposition reveals the principal cognitive axes of inquiry:
              distinguishing abstract theoretical framing from empirical testing, and procedural
              routine from metacognitive monitoring.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
