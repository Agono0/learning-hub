'use client'

/**
 * @file app/apprenticeship/page.tsx
 * @description Cognitive Apprenticeship & Expert Modeling Studio.
 *
 * Implements:
 * - Allan Collins, John Seely Brown & Susan E. Newman (1989): Cognitive Apprenticeship
 * - Jean Lave & Etienne Wenger (1991): Situated Learning & Legitimate Peripheral Participation (LPP)
 */

import React from 'react'
import { Brain, Compass, Layers, Users } from 'lucide-react'
import { PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { CognitiveApprenticeshipStudio } from '@/components/CognitiveApprenticeshipStudio'

export default function CognitiveApprenticeshipPage() {
  return (
    <ClayIn as="div" className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <PageHeader
        title="Cognitive Apprenticeship & Expert Modeling Studio"
        subtitle="Harness Allan Collins, John Seely Brown & Susan Newman's (1989) Cognitive Apprenticeship and Jean Lave & Etienne Wenger's (1991) Situated Learning: deconstruct invisible expert think-aloud heuristics, articulate tacit decision models, contrast novice pitfalls, and fade cognitive scaffolds as you progress from peripheral observer to master modeler."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2.5 py-1 text-xs text-tertiary shadow-sm">
              <Compass className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Collins-Brown (1989)</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2.5 py-1 text-xs text-tertiary shadow-sm">
              <Users className="h-3.5 w-3.5 text-blue-500" />
              <span>LPP Situated Mastery</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2.5 py-1 text-xs text-tertiary shadow-sm">
              <Brain className="h-3.5 w-3.5 text-status-success-text" />
              <span>Tacit Extraction</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2.5 py-1 text-xs text-tertiary shadow-sm">
              <Layers className="h-3.5 w-3.5 text-ac-text" />
              <span>Scaffold Fading</span>
            </div>
          </div>
        }
      />

      {/* Main Studio Body */}
      <CognitiveApprenticeshipStudio />
    </ClayIn>
  )
}
