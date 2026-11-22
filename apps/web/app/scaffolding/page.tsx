'use client'

import React from 'react'

/**
 * Worked-Example Fading & Cognitive Load Scaffolding Studio.
 *
 * Implements:
 * - Renkl & Atkinson (2003, 2004) 4-stage example-problem scaffolding continuum:
 *   Stage 1: Expert Model (Full Worked Example)
 *   Stage 2: Backward Faded (Atkinson et al. 2000 chaining)
 *   Stage 3: Forward Faded (Connective intermediate lemmas)
 *   Stage 4: Independent Problem Solving with Metacognitive Prompting
 * - Sweller (1988, 2010) Cognitive Load Theory:
 *   Intrinsic Load (IL) + Extraneous Load (EL) + Germane Load (GL) <= Cowan (2001) 4 chunks
 * - Chi et al. (1989) Principle-Based Self-Explanation Prompts
 * - Große & Renkl (2007) Erroneous Example Diagnostic Crucible
 * - Kalyuga et al. (2003) Expertise Reversal Effect Detection
 * - Direct FSRS v5 spaced repetition flashcard export bridge
 */

import { Brain, Layers, Sparkles } from 'lucide-react'
import { Badge, PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { WorkedExampleStudio } from '@/components/WorkedExampleStudio'
import { useGsapReveal } from '@/lib/useGsapReveal'

export default function ScaffoldingPage() {
  // GSAP moment: the evidence card rises in on scroll (framer owns the page
  // container; reduced-motion skips GSAP entirely).
  const revealRef = useGsapReveal()
  return (
    <ClayIn as="div" className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Page Header with Cognitive Context */}
      <PageHeader
        title="Worked-Example Fading Studio"
        subtitle="Transition systematically from expert worked examples to independent problem solving using Cognitive Load Theory and the Renkl-Atkinson scaffolding continuum."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="accent">
              <Brain className="h-3.5 w-3.5" />
              <span>CLT Model (Sweller 2010)</span>
            </Badge>
            <Badge tone="success">
              <Layers className="h-3.5 w-3.5" />
              <span>4-Stage Continuum</span>
            </Badge>
          </div>
        }
      />

      {/* Main Interactive Studio Workbench */}
      <WorkedExampleStudio initialProblemId="raft_leader_election" initialStage={2} />

      {/* Cognitive Science Foundations Accordion / Card */}
      <div ref={revealRef} className="panel rounded-2xl p-6">
        <div className="mb-3 flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-hub-accent" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-strong">
            Evidence-Based Learning Architecture
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-4 text-xs leading-relaxed text-secondary md:grid-cols-3">
          <div className="rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-4">
            <strong className="mb-1 block text-hub-accent">
              1. The Fading Effect (Renkl & Atkinson)
            </strong>
            <p>
              Transitioning learners via backward fading (Atkinson et al. 2000) achieves
              significantly higher post-test transfer than traditional unguided problem solving by
              preserving sub-goal schemas while reducing cognitive friction.
            </p>
          </div>
          <div className="rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-4">
            <strong className="mb-1 block text-hub-accent">
              2. Working Memory Budget (Sweller & Cowan)
            </strong>
            <p>
              Working memory is constrained to ~4 ± 1 chunks (Cowan 2001). Sub-goal labeling
              (Catrambone 1998) chunks micro-steps together, compressing intrinsic load and
              protecting against working memory saturation.
            </p>
          </div>
          <div className="rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-4">
            <strong className="mb-1 block text-hub-accent">
              3. The Expertise Reversal Effect (Kalyuga)
            </strong>
            <p>
              Instructional scaffolds that guide novices can burden experts with extraneous
              processing. The engine dynamically detects rising mastery and accelerates fading to
              eliminate redundant explanations.
            </p>
          </div>
        </div>
      </div>
    </ClayIn>
  )
}
