'use client'

/**
 * @file app/dual-coding/page.tsx
 * @description Paivio (1971) Dual-Coding Theory & Mayer (2001, 2014) Cognitive Theory of Multimedia Learning Studio.
 *
 * Implements:
 * - Orthogonal verbal (Logogens) and non-verbal (Imagens) cognitive subsystems
 * - Additive dual-channel recall potentiation
 * - 12 CTML Principles (Spatial Contiguity, Coherence, Signaling, Segmenting)
 * - FSRS Spaced Repetition Multimodal Stability Scaling
 */

import React from 'react'
import { Eye, Sparkles, Type, Zap } from 'lucide-react'
import { Badge, PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { DualCodingStudio } from '@/components/DualCodingStudio'

export default function DualCodingPage() {
  // GSAP moment: the evidence section rises in on scroll (framer owns the
  // page container; reduced-motion skips GSAP entirely).
  const revealRef = useGsapReveal()

  return (
    <ClayIn as="div" className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Page Header */}
      <PageHeader
        title="Dual-Coding & Visuospatial Schematization Studio"
        subtitle="Harness Paivio's Dual-Coding Theory (1971) and Mayer's Cognitive Theory of Multimedia Learning (2014): unite verbal logogens with visuospatial imagens to double retrieval accessibility and eliminate split-attention."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="cyan" icon={<Type className="h-3.5 w-3.5" />}>
              Paivio (1971)
            </Badge>
            <Badge tone="warning" icon={<Zap className="h-3.5 w-3.5" />}>
              Mayer CTML (2014)
            </Badge>
            <Badge tone="success" icon={<Eye className="h-3.5 w-3.5" />}>
              Contiguity
            </Badge>
          </div>
        }
      />

      {/* Main Interactive Studio Workbench */}
      <DualCodingStudio />

      {/* Learning Science Foundations Card */}
      <div
        ref={revealRef}
        className="rounded-2xl border border-neutral-200/60 dark:border-(--hub-border)/60 bg-white/40 dark:bg-(--hub-panel)/40 p-6 backdrop-blur-md"
      >
        <div className="flex items-center gap-2.5 mb-3">
          <Sparkles className="h-5 w-5 text-ac-text" />
          <h3 className="text-sm font-bold text-strong">
            Learning Science Foundations: Dual-Channel Cognition
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-tertiary leading-relaxed">
          <div className="space-y-1">
            <span className="font-semibold text-strong">
              Dual-Coding Theory (Paivio 1971, 1986)
            </span>
            <p>
              Information is processed through two functionally and structurally independent
              subsystems: verbal (logogens) and visual/spatial (imagens). Referential
              inter-connections link words to pictures, enabling dual independent retrieval routes
              that approximately double recall probability.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-strong">
              Spatial Contiguity &amp; Split-Attention (Mayer 2014)
            </span>
            <p>
              When corresponding words and pictures are separated across time or space, learners
              must waste limited working memory searching for matches (extraneous cognitive load).
              Integrating captions directly inside or adjacent to diagrams frees capacity for
              germane schema construction.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-strong">
              Segmenting &amp; Signaling (Mayer &amp; Moreno 2003)
            </span>
            <p>
              Deconstructing continuous complex systems into user-paced chronological phases
              (Segmenting) and using visual emphasis cues like halos or colors on essential
              bottlenecks (Signaling) prevents cognitive overload and accelerates conceptual
              mastery.
            </p>
          </div>
        </div>
      </div>
    </ClayIn>
  )
}
