'use client'

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
import { PageHeader } from '@/ui'
import { WorkedExampleStudio } from '@/components/WorkedExampleStudio'

export default function ScaffoldingPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header with Cognitive Context */}
      <PageHeader
        title="Worked-Example Fading Studio"
        subtitle="Transition systematically from expert worked examples to independent problem solving using Cognitive Load Theory and the Renkl-Atkinson scaffolding continuum."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-300">
              <Brain className="h-3.5 w-3.5 text-indigo-400" />
              <span>CLT Model (Sweller 2010)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-status-success-text">
              <Layers className="h-3.5 w-3.5 text-status-success-text" />
              <span>4-Stage Continuum</span>
            </span>
          </div>
        }
      />

      {/* Main Interactive Studio Workbench */}
      <WorkedExampleStudio initialProblemId="raft_leader_election" initialStage={2} />

      {/* Cognitive Science Foundations Accordion / Card */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-md">
        <div className="flex items-center gap-2.5 mb-3">
          <Sparkles className="h-4 w-4 text-indigo-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Evidence-Based Learning Architecture
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-secondary leading-relaxed">
          <div className="rounded-xl border border-white/5 bg-slate-950/60 p-4">
            <strong className="text-indigo-300 block mb-1">
              1. The Fading Effect (Renkl & Atkinson)
            </strong>
            <p>
              Transitioning learners via backward fading (Atkinson et al. 2000) achieves
              significantly higher post-test transfer than traditional unguided problem solving by
              preserving sub-goal schemas while reducing cognitive friction.
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-950/60 p-4">
            <strong className="text-indigo-300 block mb-1">
              2. Working Memory Budget (Sweller & Cowan)
            </strong>
            <p>
              Working memory is constrained to ~4 ± 1 chunks (Cowan 2001). Sub-goal labeling
              (Catrambone 1998) chunks micro-steps together, compressing intrinsic load and
              protecting against working memory saturation.
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-950/60 p-4">
            <strong className="text-indigo-300 block mb-1">
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
    </div>
  )
}
