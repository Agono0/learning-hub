'use client'

/**
 * @file app/metacognition/page.tsx
 * @description Dynamic Self-Regulated Metacognitive Calibration & Hypercorrection Studio.
 *
 * Implements:
 * - Nelson & Narens (1990) Multi-Level Metacognitive Architecture
 * - Butterfield & Metcalfe (2001, 2006) Hypercorrection Effect
 * - Murphy (1973) Brier Partitioning & 5-Bin Calibration Curve
 * - FSRS Spaced Repetition Hypercorrection Bridge
 */

import React from 'react'
import { Brain, Flame, Sparkles } from 'lucide-react'
import { Badge, PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { MetacognitionStudio } from '@/components/MetacognitionStudio'

export default function MetacognitionPage() {
  // GSAP moment: the evidence section rises in on scroll (framer owns the
  // page container; reduced-motion skips GSAP entirely).
  const revealRef = useGsapReveal()

  return (
    <ClayIn as="div" className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Page Header with Cognitive Context */}
      <PageHeader
        title="Metacognitive Calibration & Hypercorrection Studio"
        subtitle="Calibrate subjective confidence against empirical recall, pierce fluency illusions, and exploit the Butterfield hypercorrection effect on high-confidence errors."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="accent" icon={<Brain className="h-3.5 w-3.5" />}>
              Nelson-Narens (1990)
            </Badge>
            <Badge tone="warning" icon={<Flame className="h-3.5 w-3.5" />}>
              Hypercorrection (Butterfield 2001)
            </Badge>
          </div>
        }
      />

      {/* Main Interactive Studio Workbench */}
      <MetacognitionStudio />

      {/* Learning Science Foundations Card */}
      <div
        ref={revealRef}
        className="rounded-2xl border border-neutral-200/60 dark:border-(--hub-border)/60 bg-white/40 dark:bg-(--hub-panel)/40 p-6 backdrop-blur-md"
      >
        <div className="flex items-center gap-2.5 mb-3">
          <Sparkles className="h-5 w-5 text-ac-text" />
          <h3 className="text-sm font-bold text-strong">
            Learning Science Foundations & Psychometrics
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-tertiary leading-relaxed">
          <div className="space-y-1">
            <span className="font-semibold text-strong">
              Dual-Level Metacognition (Nelson & Narens 1990)
            </span>
            <p>
              Distinguishes between object-level processing (knowledge retrieval) and meta-level
              control (Ease-of-Learning, JOL, Feeling-of-Knowing). Dynamic control policies allocate
              study time to the Region of Proximal Learning.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-strong">
              Hypercorrection Surprise (Butterfield & Metcalfe 2001)
            </span>
            <p>
              Errors made with high confidence trigger acute epistemic surprise, attention surge,
              and P300 event-related potentials. Correcting high-confidence errors yields
              significantly higher retention than low-confidence guesses.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-strong">
              Murphy Brier Partition & Gamma Resolution
            </span>
            <p>
              Goodman-Kruskal Gamma (γ) measures discriminability between recallable and
              non-recallable items, while Allan Murphy’s (1973) Brier partitioning isolates
              Calibration Error (Reliability) from task Uncertainty.
            </p>
          </div>
        </div>
      </div>
    </ClayIn>
  )
}
