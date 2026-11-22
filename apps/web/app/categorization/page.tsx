'use client'

import React from 'react'
import { PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { PrototypeExemplarStudio } from '@/components/PrototypeExemplarStudio'

export default function CategorizationPage() {
  // GSAP moment for this page: the studio workbench rises in with a capped
  // stagger when it scrolls into view (a different node from the ClayIn
  // container — one animation owner per element).
  const studioRevealRef = useGsapReveal<HTMLDivElement>()
  return (
    <ClayIn as="div" className="space-y-6">
      <PageHeader
        title="Prototype & Exemplar Categorization"
        subtitle="Graded category structure, family resemblance, prototype abstraction and exemplar-based classification — Rosch (1975), Nosofsky (1986), Ashby COVIS (1998) and the models fit to your own responses."
      />

      <div ref={studioRevealRef}>
        <PrototypeExemplarStudio />
      </div>
    </ClayIn>
  )
}
