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
import { PageHeader } from '@/ui'
import { SelfExplanationStudio } from '@/components/SelfExplanationStudio'

export default function SelfExplanationPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header */}
      <PageHeader
        title="Self-Explanation & Schema Inversion Studio"
        subtitle="Harness Chi's Self-Explanation Effect (1989) and Aleven's Rule-Naming Strategy (2002): actively articulate the governing invariant behind every derivation step and invert boundary constraints to expose failure points."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-300">
              <Brain className="h-3.5 w-3.5 text-sky-400" />
              <span>Chi et al. (1989)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
              <Target className="h-3.5 w-3.5 text-emerald-400" />
              <span>Aleven (2002)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span>Renkl Inversion</span>
            </span>
          </div>
        }
      />

      {/* Main Interactive Studio Workbench */}
      <SelfExplanationStudio />

      {/* Learning Science Foundations Card */}
      <div className="rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur-md">
        <div className="flex items-center gap-2.5 mb-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-bold text-foreground">
            Learning Science Foundations: Generative Schema Construction
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted-foreground leading-relaxed">
          <div className="space-y-1">
            <span className="font-semibold text-foreground">
              The Self-Explanation Effect (Chi et al. 1989)
            </span>
            <p>
              Learners who actively generate justifications linking problem-solving actions to
              domain principles develop significantly deeper conceptual models and achieve superior
              transfer compared to those who merely reread worked solutions.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-foreground">
              Rule Naming &amp; Cognitive Tutoring (Aleven &amp; Koedinger 2002)
            </span>
            <p>
              Requiring students to explicitly state the mathematical theorem, axiom, or invariant
              governing each derivation step forces deliberate retrieval and suppresses shallow,
              heuristic guessing.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-foreground">
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
    </div>
  )
}
