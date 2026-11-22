/**
 * @file apps/web/app/contrasting/page.tsx
 * @description Contrasting Cases & Inventing with Examples Studio Page.
 * Grounded in Schwartz & Bransford (1998) "A Time for Telling".
 */

'use client'

import React from 'react'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { PageHeader } from '@/ui'
import { ContrastingCasesStudio } from '@/components/ContrastingCasesStudio'

export default function ContrastingCasesPage() {
  // GSAP moment for this page: the studio workbench rises in with a capped
  // stagger when it scrolls into view (a different node from the ClayIn
  // container — one animation owner per element).
  const studioRevealRef = useGsapReveal<HTMLDivElement>()
  return (
    <ClayIn as="div" className="space-y-6">
      <PageHeader
        title="Contrasting Cases Studio"
        subtitle="Preparation for Future Learning (PFL): invent mathematical invariants from contrasting examples before expert lecture delivery (Schwartz & Bransford 1998, 2004)."
      />

      <div ref={studioRevealRef}>
        <ContrastingCasesStudio />
      </div>
    </ClayIn>
  )
}
