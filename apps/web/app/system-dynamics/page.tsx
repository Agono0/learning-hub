'use client'

import React from 'react'
import { PageHeader } from '@/ui/PageHeader'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { SystemDynamicsStudio } from '@/components/SystemDynamicsStudio'

export default function SystemDynamicsPage() {
  // GSAP reveal (per-page motion mandate): the studio rises in on scroll —
  // motionOK-gated; SSR/tests keep the static content.
  const studioRef = useGsapReveal<HTMLDivElement>({ y: 12 })
  return (
    <ClayIn as="div" className="space-y-5">
      <PageHeader
        title="System Dynamics & Feedback Modeling"
        subtitle="Forrester (1968), Sterman (2000) & Meadows (2008) stock-flow simulation, causal loops, and systemic leverage points."
      />
      <div ref={studioRef}>
        <SystemDynamicsStudio />
      </div>
    </ClayIn>
  )
}
