'use client'

/**
 * @file apps/web/app/causal/page.tsx
 * @description Structural Causal Modeling & Counterfactual Simulator Studio Page.
 *
 * Grounded in Judea Pearl's Causal Hierarchy:
 * - Pearl (2000, 2009): Causality: Models, Reasoning, and Inference.
 * - Woodward (2003): Making Things Happen: A Theory of Causal Explanation.
 * - Pearl, Glymour, & Jewell (2016): Causal Inference in Statistics: A Primer.
 */

import React from 'react'
import { GitFork, Sparkles, Layers, Compass } from 'lucide-react'
import { PageHeader } from '@/ui'
import { CounterfactualStudio } from '@/components/CounterfactualStudio'

export default function CausalCounterfactualPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header */}
      <PageHeader
        title="Structural Causal & Counterfactual Studio"
        subtitle="Traverse Judea Pearl’s 3-level Ladder of Causation: Seeing (Association), Doing (Intervention via graph surgery), and Imagining (Counterfactuals via Abduction-Action-Prediction)."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-status-success-text dark:text-status-success-text">
              <GitFork className="h-3.5 w-3.5" />
              <span>Pearl (2000, 2009) Causality</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-600 dark:text-blue-400">
              <Layers className="h-3.5 w-3.5" />
              <span>Graph Surgery do(X)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-status-warning-text dark:text-status-warning-text">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Level 3 Counterfactuals</span>
            </span>
          </div>
        }
      />

      {/* Main Studio Workbench */}
      <CounterfactualStudio />

      {/* Learning Science Foundations Card */}
      <div className="rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-6">
        <div className="flex items-center gap-2.5 mb-3">
          <Sparkles className="h-5 w-5 text-status-success-text dark:text-status-success-text" />
          <h2 className="text-base font-bold text-strong">
            Causal Inference &amp; Counterfactual Reasoning Foundations
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-secondary leading-relaxed">
          <div className="space-y-1.5">
            <div className="font-semibold text-strong flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5 text-blue-500" />
              Level 1: Association (Seeing)
            </div>
            <p>
              Passive observational conditional probabilities P(y | x). Identifies patterns and
              correlations, but fails to distinguish causal mechanisms from common causes
              (confounders) or spurious collider stratifications.
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="font-semibold text-strong flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-status-success-text" />
              Level 2: Intervention (Doing)
            </div>
            <p>
              Simulates direct actions P(y | do(x)) by performing graph surgery: severing incoming
              causal arrows to treatment X, isolating the pure forward structural transmission of
              effect across downstream variables.
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="font-semibold text-strong flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-status-warning-text" />
              Level 3: Counterfactuals (Imagining)
            </div>
            <p>
              Addresses retrospective what-if queries P(y_x | x', y') using Pearl’s 3-step
              algorithm: (1) Abduction to infer specific latent exogenous factors U from observed
              reality, (2) Action to mutilate equations, and (3) Prediction holding U constant.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
