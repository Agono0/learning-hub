'use client'

import React from 'react'
import { PageHeader } from '@/ui/PageHeader'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { ComplexProblemSolvingStudio } from '@/components/ComplexProblemSolvingStudio'

export default function ComplexProblemSolvingPage() {
  // GSAP moment for this page: the studio workbench rises in with a capped
  // stagger when it scrolls into view (a different node from the ClayIn
  // container — one animation owner per element).
  const studioRevealRef = useGsapReveal<HTMLDivElement>()
  return (
    <ClayIn as="div" className="space-y-6">
      <PageHeader
        title="Complex Problem Solving & Micro-Worlds"
        subtitle="Dietrich Dörner (1996) The Logic of Failure, delayed side-effect cascades, and dynamic systems governor telemetry."
      />
      <div ref={studioRevealRef}>
        <ComplexProblemSolvingStudio />
      </div>
    </ClayIn>
  )
}
