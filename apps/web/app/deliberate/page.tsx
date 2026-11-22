'use client'

/**
 * @file app/deliberate/page.tsx
 * @description Deliberate Practice & Progressive Error Recovery Studio.
 *
 * Implements:
 * - K. Anders Ericsson's Deliberate Practice Theory (1993, 2016)
 * - Kurt VanLehn's (1990) Impasse-Driven Learning & Schema Bug Repair
 * - Nina Keith & Michael Frese's (2008) Error Management Training (EMT)
 */

import React from 'react'
import { Brain, Crosshair, ShieldAlert, Target } from 'lucide-react'
import { Badge, PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { DeliberatePracticeStudio } from '@/components/DeliberatePracticeStudio'
import { useGsapReveal } from '@/lib/useGsapReveal'

export default function DeliberatePracticePage() {
  // GSAP moment: the evidence cards rise in as they scroll into view
  // (framer's ClayIn owns the page container; reduced-motion skips GSAP).
  const evidenceRef = useGsapReveal()
  return (
    <ClayIn as="div" className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Page Header */}
      <PageHeader
        title="Deliberate Practice & Progressive Error Recovery Studio"
        subtitle="Harness K. Anders Ericsson's Deliberate Practice (1993) and Kurt VanLehn's Impasse-Driven Schema Repair (1990): isolate targeted micro-skill deficits on the outer perimeter of competence, dissect cognitive impasses, and build adaptive transfer through positive error climate training."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="cyan" icon={<Crosshair className="h-3.5 w-3.5" />}>
              Ericsson (1993)
            </Badge>
            <Badge tone="accent" icon={<Target className="h-3.5 w-3.5" />}>
              VanLehn Impasse (1990)
            </Badge>
            <Badge tone="success" icon={<ShieldAlert className="h-3.5 w-3.5" />}>
              Keith-Frese EMT (2008)
            </Badge>
          </div>
        }
      />

      {/* Main Studio Interactive Crucible */}
      <DeliberatePracticeStudio />

      {/* Scientific Foundation Overview Cards */}
      <div ref={evidenceRef} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-status-info-text uppercase tracking-wider">
            <Crosshair className="h-4 w-4" />
            <span>Targeted Deficit Drills</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            Deliberate practice is not mindlessly repeating what you already know. It requires
            continuous, effortful focus on granular sub-skill deficits where errors are most likely
            to occur, with immediate informative feedback.
          </p>
        </div>

        <div className="rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-ac-text uppercase tracking-wider">
            <Brain className="h-4 w-4" />
            <span>Impasse-Driven Repair</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            VanLehn (1990) demonstrated that schema repair occurs at cognitive impasses. Classifying
            mistakes into misconceptions, procedural lapses, and boundary oversights allows targeted
            sub-goal repair rather than generic repetition.
          </p>
        </div>

        <div className="rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-status-success-text uppercase tracking-wider">
            <ShieldAlert className="h-4 w-4" />
            <span>Error Management Training</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            Keith & Frese (2008) showed that positive error framing decouples ego threat from
            tactical failure, fostering emotional resilience and superior adaptive transfer when
            confronting novel, complex problems.
          </p>
        </div>
      </div>
    </ClayIn>
  )
}
