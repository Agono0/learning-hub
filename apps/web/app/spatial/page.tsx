/**
 * Learning HUB — Spatial Cognition & Mental Rotation Model-Checking Studio Page
 *
 * Route: /spatial
 * Grounded in:
 * - Roger Shepard & Jacqueline Metzler (1971) - Mental Rotation of Three-Dimensional Objects
 * - Mary Hegarty (2004) - Mechanical Reasoning by Mental Simulation
 * - Barbara Tversky (1993, 2005) - Spatial Schemas & Spatial Mental Models
 * - David H. Uttal et al. (2013) - The Malleability of Spatial Skills
 */

'use client'

import React from 'react'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { SpatialCognitionStudio } from '@/components/SpatialCognitionStudio'

export default function SpatialCognitionPage() {
  // GSAP reveal (per-page motion mandate): the studio rises in on scroll —
  // motionOK-gated; SSR/tests keep the static content.
  const studioRef = useGsapReveal<HTMLDivElement>({ y: 12 })
  return (
    <ClayIn as="div" className="space-y-5">
      <div ref={studioRef}>
        <SpatialCognitionStudio />
      </div>
    </ClayIn>
  )
}
