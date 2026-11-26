'use client'

/**
 * Learning HUB — Implementation Intentions & Habit Formation Studio page.
 *
 * Route: /implementation-intentions
 * Grounded in:
 * - Gollwitzer (1999); Gollwitzer & Sheeran (2006) — if-then planning
 * - Lally et al. (2009) — habit automaticity growth curve
 * - Oettingen & Gollwitzer (2010) — MCII
 */

import React from 'react'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { PageHeader } from '@/ui'
import { ImplementationIntentionsStudio } from '@/components/ImplementationIntentionsStudio'

export default function ImplementationIntentionsPage() {
  // GSAP reveal (per-page motion mandate): the studio rises in on scroll —
  // motionOK-gated; SSR/tests keep the static content.
  const studioRef = useGsapReveal<HTMLDivElement>({ y: 12 })
  return (
    <ClayIn as="div" className="space-y-5">
      <PageHeader
        title="Implementation Intentions"
        subtitle="Turn goals into if-then plans that fire on their own — and watch automaticity grow on the Lally curve."
      />
      <div ref={studioRef}>
        <ImplementationIntentionsStudio />
      </div>
    </ClayIn>
  )
}
