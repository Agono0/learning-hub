'use client'

/**
 * @file app/flexibility/page.tsx
 * @description Cognitive Flexibility & Perspective Shifting Studio.
 *
 * Implements:
 * - Rand J. Spiro et al. (1988) Cognitive Flexibility Theory (CFT)
 * - Edward de Bono (1985) Six Thinking Hats & Lateral Thinking Modality
 * - Feltovich, Spiro & Coulson (1989) Reductive Oversimplification Trap Diagnostics
 * - FSRS-6 Generalization Deck Synthesis with Context-Free Stability Multipliers
 */

import React from 'react'
import { Brain, Compass, Layers, ShieldAlert, Sparkles } from 'lucide-react'
import { Badge, PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { CognitiveFlexibilityStudio } from '@/components/CognitiveFlexibilityStudio'

export default function FlexibilityPage() {
  // GSAP moment: the evidence section rises in on scroll (framer owns the
  // page container; reduced-motion skips GSAP entirely).
  const revealRef = useGsapReveal()

  return (
    <ClayIn as="div" className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Page Header */}
      <PageHeader
        title="Cognitive Flexibility & Perspective Shifting Studio"
        subtitle="Harness Spiro's Cognitive Flexibility Theory (1988) and De Bono's Six Thinking Hats (1985): criss-cross complex conceptual landscapes, re-represent ill-structured problems from orthogonal lenses, and conquer reductive oversimplification traps."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="cyan" icon={<Layers className="h-3.5 w-3.5" />}>
              Spiro CFT (1988)
            </Badge>
            <Badge tone="accent" icon={<Compass className="h-3.5 w-3.5" />}>
              De Bono (1985)
            </Badge>
            <Badge tone="warning" icon={<ShieldAlert className="h-3.5 w-3.5" />}>
              Feltovich (1989)
            </Badge>
          </div>
        }
      />

      {/* Scientific Foundation Overview Cards */}
      <div ref={revealRef} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-status-info-text uppercase tracking-wider">
            <Layers className="h-4 w-4" />
            <span>Landscape Criss-Crossing</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            Advanced knowledge in ill-structured domains cannot be learned through a single neat
            taxonomy. Learners must criss-cross the conceptual landscape by revisiting identical
            cases through multiple thematic routes.
          </p>
        </div>

        <div className="rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-hub-accent uppercase tracking-wider">
            <Brain className="h-4 w-4" />
            <span>Multi-Perspective Dispersion</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            Fixating on a single thinking style (e.g. only empirical data or risk avoidance) creates
            cognitive rigidity. Tracking Shannon entropy across all six hats fosters
            high-dimensional cognitive flexibility.
          </p>
        </div>

        <div className="rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-status-success-text uppercase tracking-wider">
            <Sparkles className="h-4 w-4" />
            <span>Reductive Trap Immunity</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            Oversimplification traps like Additivity Bias (assuming linear effects) lead to
            catastrophic architectural failures. Disproving these biases yields robust,
            context-resilient transfer.
          </p>
        </div>
      </div>

      {/* Main Interactive Studio Workbench */}
      <CognitiveFlexibilityStudio />
    </ClayIn>
  )
}
