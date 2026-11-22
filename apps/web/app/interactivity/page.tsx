'use client'

/**
 * @file app/interactivity/page.tsx
 * @description Cognitive Load & Element Interactivity Studio.
 *
 * Implements:
 * - John Sweller's Cognitive Load Theory (CLT, Sweller 1988, 2011)
 * - Pollock, Chandler & Sweller (2002) Isolated-Elements Effect 3-phase scaffold
 * - Fred Paas's (1992) 2D Instructional Efficiency Diagnostic Crucible
 */

import React from 'react'
import { Activity, Cpu, Layers, Network, ShieldCheck } from 'lucide-react'
import { Badge, PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { ElementInteractivityStudio } from '@/components/ElementInteractivityStudio'

export default function InteractivityPage() {
  // GSAP moment: the evidence section rises in on scroll (framer owns the
  // page container; reduced-motion skips GSAP entirely).
  const revealRef = useGsapReveal()

  return (
    <ClayIn as="div" className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Page Header */}
      <PageHeader
        title="Cognitive Load & Element Interactivity Studio"
        subtitle="Harness John Sweller's Cognitive Load Theory (1988, 2011) and Pollock's Isolated-Elements Effect (2002): decompose high-interactivity complex systems into isolated constituents, internalize binary couplings, and synthesize unified systemic schemas without working memory paralysis."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="cyan" icon={<Cpu className="h-3.5 w-3.5" />}>
              Sweller CLT (1988, 2011)
            </Badge>
            <Badge tone="accent" icon={<Layers className="h-3.5 w-3.5" />}>
              Pollock Scaffold (2002)
            </Badge>
            <Badge tone="success" icon={<Activity className="h-3.5 w-3.5" />}>
              Paas Efficiency (1992)
            </Badge>
          </div>
        }
      />

      {/* Scientific Foundation Overview Cards */}
      <div ref={revealRef} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-status-info-text uppercase tracking-wider">
            <Network className="h-4 w-4" />
            <span>Element Interactivity</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            Material with high element interactivity requires multiple interacting elements to be
            held simultaneously in working memory. Without schema chunking, total cognitive load
            exceeds Cowan’s capacity limit (4 chunks), causing cognitive paralysis.
          </p>
        </div>

        <div className="rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-hub-accent uppercase tracking-wider">
            <Layers className="h-4 w-4" />
            <span>Isolated-Elements Effect</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            Pollock et al. (2002) proved that presenting constituent elements in isolation first,
            followed by pairwise coupling and systemic integration, enables novices to acquire
            complex schemas that would otherwise be impossible to process simultaneously.
          </p>
        </div>

        <div className="rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-status-success-text uppercase tracking-wider">
            <ShieldCheck className="h-4 w-4" />
            <span>Paas Efficiency Metric</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            Instructional efficiency E = (Z_P - Z_R) / √2 balances objective test performance
            against subjective mental effort. High performance achieved with low effort indicates
            optimal schema automation.
          </p>
        </div>
      </div>

      {/* Main Studio Interactive Crucible */}
      <ElementInteractivityStudio />
    </ClayIn>
  )
}
