/**
 * Learning HUB — Multi-Representational Fluency & Representational Competence Studio Page
 *
 * Route: /representations
 */

'use client'

import React from 'react'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { RepresentationalFluencyStudio } from '@/components/RepresentationalFluencyStudio'

export default function RepresentationsPage() {
  // GSAP reveal (per-page motion mandate): the studio rises in on scroll —
  // motionOK-gated; SSR/tests keep the static content.
  const studioRef = useGsapReveal<HTMLDivElement>({ y: 12 })
  return (
    <ClayIn as="div" className="space-y-5">
      <div ref={studioRef}>
        <RepresentationalFluencyStudio />
      </div>
    </ClayIn>
  )
}
