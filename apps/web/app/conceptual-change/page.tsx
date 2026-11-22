/**
 * Learning HUB — Conceptual Change & Ontological Category Shift Studio Page
 *
 * Route: /conceptual-change
 */

'use client'

import React from 'react'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { OntologicalShiftStudio } from '@/components/OntologicalShiftStudio'

export default function ConceptualChangePage() {
  // GSAP moment for this page: the studio workbench rises in with a capped
  // stagger when it scrolls into view (a different node from the ClayIn
  // container — one animation owner per element).
  const studioRevealRef = useGsapReveal<HTMLDivElement>()
  return (
    <ClayIn as="div" className="space-y-6">
      <div ref={studioRevealRef}>
        <OntologicalShiftStudio />
      </div>
    </ClayIn>
  )
}
