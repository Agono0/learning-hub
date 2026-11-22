'use client'

/**
 * @file app/curiosity/page.tsx
 * @description Epistemic Curiosity & Information Gap Studio.
 *
 * Implements:
 * - George Loewenstein (1994): The Psychology of Curiosity & Information Gap Theory
 * - Daniel E. Berlyne (1960): Collative Variables & Epistemic Arousal Dynamics
 * - Min Jeong Kang et al. (2009, Neuron): Dopaminergic Memory Facilitation
 */

import React from 'react'
import { Brain, Compass, Sparkles, Zap } from 'lucide-react'
import { PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { InformationGapStudio } from '@/components/InformationGapStudio'

export default function EpistemicCuriosityPage() {
  // GSAP moment for this page: the studio workbench rises in with a capped
  // stagger when it scrolls into view (a different node from the ClayIn
  // container — one animation owner per element).
  const studioRevealRef = useGsapReveal<HTMLDivElement>()
  return (
    <ClayIn as="div" className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Epistemic Curiosity & Information Gap Studio"
        subtitle="Harness George Loewenstein's (1994) Information Gap Theory, Daniel Berlyne's (1960) Collative Arousal Dynamics, and Min Jeong Kang et al.'s (2009 Neuron) neuroimaging insights: confront genuine counter-intuitive paradoxes, stimulate anticipatory striatal dopamine release through progressive clues, resolve cognitive incongruity, and consolidate high-retention long-term schemas."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2.5 py-1 text-xs text-tertiary shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Loewenstein (1994)</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2.5 py-1 text-xs text-tertiary shadow-sm">
              <Compass className="h-3.5 w-3.5 text-status-info-text" />
              <span>Berlyne Collatives</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2.5 py-1 text-xs text-tertiary shadow-sm">
              <Zap className="h-3.5 w-3.5 text-status-warning-text" />
              <span>Kang Dopamine Boost (1.85x)</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2.5 py-1 text-xs text-tertiary shadow-sm">
              <Brain className="h-3.5 w-3.5 text-ac-text" />
              <span>FSRS Epistemic Deck</span>
            </div>
          </div>
        }
      />

      {/* Main Studio Body — GSAP moment (see ref below). */}
      <div ref={studioRevealRef}>
        <InformationGapStudio />
      </div>
    </ClayIn>
  )
}
