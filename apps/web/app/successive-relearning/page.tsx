'use client'

/**
 * @file apps/web/app/successive-relearning/page.tsx
 * @description Successive Relearning & Ebbinghaus Savings Studio Page.
 *
 * Implements:
 * - Rawson & Dunlosky (2011, 2012) retrieval-to-criterion combined with spaced relearning waves.
 * - Hermann Ebbinghaus (1885) Savings Metric: Savings = ((T1 - Tn) / T1) * 100%.
 * - Nelson & Leonesio (1988) Criterion-Dropout Protocol.
 * - Dunlosky et al. (2013) Highest Utility Learning Technique (d > 1.5).
 */

import React from 'react'
import { Award, BookOpen, Brain, Flame, Repeat, Sparkles } from 'lucide-react'
import { PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { SuccessiveRelearningStudio } from '@/components/SuccessiveRelearningStudio'

export default function SuccessiveRelearningPage() {
  // GSAP reveal (per-page motion mandate): the foundations columns rise in on
  // scroll — motionOK-gated; SSR/tests keep the static content.
  const foundationsRef = useGsapReveal<HTMLDivElement>({ y: 12 })
  return (
    <ClayIn as="div" className="space-y-5">
      {/* Page Header */}
      <PageHeader
        title="Successive Relearning Studio"
        subtitle="Combine retrieval practice to an acquisition criterion with distributed relearning sessions spaced across intervals to unlock durable long-term retention and measure empirical Ebbinghaus savings."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400">
              <Repeat className="h-3.5 w-3.5" />
              <span>Rawson &amp; Dunlosky (2012)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-status-success-text dark:text-status-success-text">
              <Award className="h-3.5 w-3.5" />
              <span>d &gt; 1.5 Utility</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-status-warning-text dark:text-status-warning-text">
              <Flame className="h-3.5 w-3.5" />
              <span>Ebbinghaus Savings Method</span>
            </span>
          </div>
        }
      />

      {/* Main Interactive Studio Workbench */}
      <SuccessiveRelearningStudio />

      {/* Learning Science Foundations Card */}
      <div className="rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-6">
        <div className="flex items-center gap-2.5 mb-3">
          <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-sm font-bold text-strong">
            Successive Relearning &amp; Memory Durability Science
          </h3>
        </div>
        <div
          ref={foundationsRef}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-secondary leading-relaxed"
        >
          <div className="space-y-1">
            <span className="font-semibold text-strong flex items-center gap-1.5">
              <Brain className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              1. The Criterion-Dropout Rule:
            </span>
            <p>
              Rather than fixed repetitions, items are tested until recalled correctly to criterion
              (e.g., 2 consecutive successes), ensuring equal cognitive mastery before spacing.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-strong flex items-center gap-1.5">
              <Repeat className="h-4 w-4 text-status-success-text dark:text-status-success-text" />
              2. Forgetting Rate Deceleration:
            </span>
            <p>
              Each successful spaced relearning wave flattens the forgetting trajectory: λₙ = λ₀ ·
              (1 + 0.45n)⁻⁰·⁸⁵, increasing stability from days to months.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-strong flex items-center gap-1.5">
              <BookOpen className="h-4 w-4 text-status-warning-text dark:text-status-warning-text" />
              3. Empirical Savings Method:
            </span>
            <p>
              Hermann Ebbinghaus’s (1885) canonical metric tracks trials saved: relearning takes
              drastically fewer trials while strengthening deep schema consolidation.
            </p>
          </div>
        </div>
      </div>
    </ClayIn>
  )
}
