'use client'

/**
 * @file app/srl/page.tsx
 * @description Self-Regulated Learning (SRL) & Metacognitive Matrix Studio.
 *
 * Implements:
 * - Barry J. Zimmerman (2000, 2002): Tripartite Cyclical Model (Forethought, Performance, Self-Reflection)
 * - Paul R. Pintrich (2004): SRL Phases & Motivational Components
 * - Philip H. Winne & Peter A. Hadwin (1998): The COPES Model
 * - Bernard Weiner (1985, 1986): Causal Attribution Dimensions
 */

import React from 'react'
import { Brain, Compass, Flame, Shield, Target } from 'lucide-react'
import { PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { SelfRegulatedLearningStudio } from '@/components/SelfRegulatedLearningStudio'

export default function SelfRegulatedLearningPage() {
  return (
    <ClayIn as="div" className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <PageHeader
        title="Self-Regulated Learning & Metacognitive Matrix Studio"
        subtitle="Harness Barry J. Zimmerman's (2000, 2002) Tripartite Cyclical Model, Paul Pintrich's (2004) motivational regulation, Philip Winne's (1998) COPES architecture, and Bernard Weiner's (1986) causal attribution theory: articulate specific proximal goals, protect cognitive volitional focus against real-world execution friction, and conduct objective causal post-mortems to develop autonomous lifelong self-regulation."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2.5 py-1 text-xs text-tertiary shadow-sm">
              <Compass className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Zimmerman (2000)</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2.5 py-1 text-xs text-tertiary shadow-sm">
              <Target className="h-3.5 w-3.5 text-status-info-text" />
              <span>COPES Architecture</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2.5 py-1 text-xs text-tertiary shadow-sm">
              <Flame className="h-3.5 w-3.5 text-status-warning-text" />
              <span>Volitional Control</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2.5 py-1 text-xs text-tertiary shadow-sm">
              <Shield className="h-3.5 w-3.5 text-status-success-text" />
              <span>Weiner Attribution</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2.5 py-1 text-xs text-tertiary shadow-sm">
              <Brain className="h-3.5 w-3.5 text-ac-text" />
              <span>FSRS Regulatory Deck</span>
            </div>
          </div>
        }
      />

      {/* Main Studio Body */}
      <SelfRegulatedLearningStudio />
    </ClayIn>
  )
}
