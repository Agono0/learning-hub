'use client'

/**
 * @file app/equilibrium/page.tsx
 * @description Reflective Equilibrium & Epistemic Calibration Studio.
 *
 * Implements:
 * - John Rawls (1971) & Nelson Goodman (1955) Wide Reflective Equilibrium (WRE)
 * - Glenn W. Brier (1950) & Philip Tetlock (2005) Epistemic Probability Calibration
 * - Triad Dissonance Resolution across Judgments, Principles, and Background Theories
 */

import React from 'react'
import { Brain, GitBranch, Network, Scale, Sparkles, Target } from 'lucide-react'
import { Badge, PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { ReflectiveEquilibriumStudio } from '@/components/ReflectiveEquilibriumStudio'

export default function EquilibriumPage() {
  // GSAP moment: the evidence section rises in on scroll (framer owns the
  // page container; reduced-motion skips GSAP entirely).
  const revealRef = useGsapReveal()

  return (
    <ClayIn as="div" className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Page Header */}
      <PageHeader
        title="Reflective Equilibrium & Epistemic Calibration Studio"
        subtitle="Harness Rawls' Wide Reflective Equilibrium (1971) and Tetlock's Superforecasting Calibration (2005): resolve clashes between abstract principles and concrete case intuitions, map epistemic coherence networks, and eliminate overconfidence bias."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="cyan" icon={<Network className="h-3.5 w-3.5" />}>
              Rawls WRE (1971)
            </Badge>
            <Badge tone="accent" icon={<Target className="h-3.5 w-3.5" />}>
              Tetlock Calibration
            </Badge>
            <Badge tone="warning" icon={<Scale className="h-3.5 w-3.5" />}>
              Goodman (1955)
            </Badge>
          </div>
        }
      />

      {/* Scientific Foundation Overview Cards */}
      <div ref={revealRef} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-status-info-text uppercase tracking-wider">
            <GitBranch className="h-4 w-4" />
            <span>Three Epistemic Tiers</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            Coherence is achieved through bidirectional adjustments between concrete Considered
            Judgments (C), abstract Principles (P), and Background Theories (B). Neither level has
            dogmatic priority.
          </p>
        </div>

        <div className="rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-hub-accent uppercase tracking-wider">
            <Brain className="h-4 w-4" />
            <span>Triad Conflict Resolution</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            When abstract principles clash with empirical realities (e.g. CAP Theorem vs
            zero-downtime checkout), learners must systematically revise principles, qualify
            judgments, or expand theoretical models.
          </p>
        </div>

        <div className="rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-status-success-text uppercase tracking-wider">
            <Sparkles className="h-4 w-4" />
            <span>Brier Score Calibration</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            Overconfidence is the primary barrier to lifelong learning. Tracking the Brier
            Calibration Index (BCI) trains learners to accurately align subjective confidence with
            actual empirical ground truth.
          </p>
        </div>
      </div>

      {/* Main Interactive Studio Workbench */}
      <ReflectiveEquilibriumStudio />
    </ClayIn>
  )
}
