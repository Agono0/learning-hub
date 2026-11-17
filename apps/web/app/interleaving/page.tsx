'use client'

/**
 * @file app/interleaving/page.tsx
 * @description Rohrer & Taylor (2007) Interleaved Problem Solving & Kornell & Bjork
 * (2008) Structural Invariance Studio.
 *
 * Implements:
 * - Shuffled mixed-category practice vs blocked comparator (the desirable difficulty)
 * - Surface vs deep structural feature discrimination (Gick & Holyoak 1983)
 * - Category confusion matrix with surface-lure detection
 * - FSRS interleaving deck export
 */

import React from 'react'
import { Grid3X3, Shuffle, Target } from 'lucide-react'
import { PageHeader } from '@/ui'
import { InterleavingStudio } from '@/components/InterleavingStudio'

export default function InterleavingPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header */}
      <PageHeader
        title="Interleaved Problem Solving & Structural Invariance Studio"
        subtitle="Rohrer & Taylor's (2007) shuffled practice roughly doubles delayed test scores over blocked drills by forcing discrimination between look-alike problem categories. Identify the deep structural invariant — never the surface story."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
              <Shuffle className="h-3.5 w-3.5 text-emerald-400" />
              <span>Rohrer (2007)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-300">
              <Target className="h-3.5 w-3.5 text-violet-400" />
              <span>Kornell-Bjork (2008)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-300">
              <Grid3X3 className="h-3.5 w-3.5 text-sky-400" />
              <span>Contrast Matrix</span>
            </span>
          </div>
        }
      />

      {/* Main Interactive Studio Workbench */}
      <InterleavingStudio />

      {/* Learning Science Foundations Card */}
      <div className="rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur-md">
        <div className="mb-3 flex items-center gap-2.5">
          <Shuffle className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-bold text-foreground">
            Learning Science Foundations: Why Shuffling Beats Blocking
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-4 text-xs leading-relaxed text-muted-foreground md:grid-cols-3">
          <div className="space-y-1">
            <span className="font-semibold text-foreground">
              Interleaving &amp; Discrimination (Rohrer &amp; Taylor 2007)
            </span>
            <p>
              Blocked practice (AAA-BBB-CCC) lets learners key on surface templates — the solution
              recipe is cued by the story. Shuffled practice (ABC-CAB-BCA) forces category selection
              on every item, so learners must learn <em>which</em> principle fits, not just how to
              execute it. Test scores roughly doubled despite worse practice-phase accuracy.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-foreground">
              Inductive Category Learning (Kornell &amp; Bjork 2008)
            </span>
            <p>
              Interleaving beats massing even for pure induction — learning artists&apos; styles,
              structural formulas, or problem types — while learners consistently predict the
              opposite. The metacognitive illusion this studio surfaces: hard-feeling shuffled
              practice is the condition that transfers.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-foreground">
              Surface vs Structural Features (Gick &amp; Holyoak 1983)
            </span>
            <p>
              Analogical transfer requires inducing a schema over relational, structural features
              rather than surface features. This curriculum counter-balances three story families
              across four deep structures, so the surface can never predict the solution — mirroring
              Rohrer et al.&apos;s (2014) superficially-similar design.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
