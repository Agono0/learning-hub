'use client'

/**
 * @file app/self-explanation/page.tsx
 * @description Generative Self-Explanation & Schema Inversion Studio.
 *
 * Implements:
 * - Michelene T. H. Chi et al. (1989) Principle-Based Self-Explanation vs Paraphrasing
 * - Vincent Aleven & Kenneth R. Koedinger (2002) Cognitive Tutor Rule Naming
 * - Alexander Renkl (2002) Schema Inversion & Boundary Counterfactual Testing
 * - FSRS Spaced Repetition Derivation Stability Scaling
 */

import React from 'react'
import { Brain, Sparkles, Target, Zap } from 'lucide-react'
import { Badge, PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { SelfExplanationStudio } from '@/components/SelfExplanationStudio'

export default function SelfExplanationPage() {
  // GSAP moment: the evidence section rises in on scroll (framer owns the
  // page container; reduced-motion skips GSAP entirely).
  const revealRef = useGsapReveal()

  return (
    <ClayIn as="div" className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Page Header */}
      <PageHeader
        title="Self-Explanation & Schema Inversion Studio"
        subtitle="Harness Chi's Self-Explanation Effect (1989) and Aleven's Rule-Naming Strategy (2002): actively articulate the governing invariant behind every derivation step and invert boundary constraints to expose failure points."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="cyan" icon={<Brain className="h-3.5 w-3.5" />}>
              Chi et al. (1989)
            </Badge>
            <Badge tone="success" icon={<Target className="h-3.5 w-3.5" />}>
              Aleven (2002)
            </Badge>
            <Badge tone="warning" icon={<Zap className="h-3.5 w-3.5" />}>
              Renkl Inversion
            </Badge>
          </div>
        }
      />

      {/* Main Interactive Studio Workbench */}
      <SelfExplanationStudio />

      {/* Learning Science Foundations Card */}
      <div
        ref={revealRef}
        className="rounded-2xl border border-neutral-200/60 dark:border-(--hub-border)/60 bg-white/40 dark:bg-(--hub-panel)/40 p-6 backdrop-blur-md"
      >
        <div className="flex items-center gap-2.5 mb-3">
          <Sparkles className="h-5 w-5 text-ac-text" />
          <h3 className="text-sm font-bold text-strong">
            Learning Science Foundations: Generative Schema Construction
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-tertiary leading-relaxed">
          <div className="space-y-1">
            <span className="font-semibold text-strong">
              The Self-Explanation Effect (Chi et al. 1989)
            </span>
            <p>
              Learners who actively generate justifications linking problem-solving actions to
              domain principles develop significantly deeper conceptual models and achieve superior
              transfer compared to those who merely reread worked solutions.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-strong">
              Rule Naming &amp; Cognitive Tutoring (Aleven &amp; Koedinger 2002)
            </span>
            <p>
              Requiring students to explicitly state the mathematical theorem, axiom, or invariant
              governing each derivation step forces deliberate retrieval and suppresses shallow,
              heuristic guessing.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-strong">
              Schema Inversion &amp; Boundary Testing (Renkl 2002)
            </span>
            <p>
              Asking &quot;What if this condition did not hold? What would break?&quot; converts
              passive acceptance into active structural verification, cementing the necessary and
              sufficient preconditions of knowledge.
            </p>
          </div>
        </div>
      </div>
    </ClayIn>
  )
}
