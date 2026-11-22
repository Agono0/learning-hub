/**
 * Learning HUB — Productive Failure & Canonical Consolidation Studio Page
 *
 * Route: /productive-failure
 * Grounded in:
 * - Manu Kapur (2008, 2012, 2016) - Unguided generation followed by canonical consolidation
 * - Tanmay Sinha & Manu Kapur (2021) - Explanatory predictor model of Productive Failure
 * - Katharina Loibl, Ido Roll & Nikol Rummel (2017) - Problem solving prior to instruction
 * - Free Spaced Repetition Scheduler (FSRS-6) integration
 */

'use client'

import React from 'react'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { ProductiveFailureStudio } from '@/components/ProductiveFailureStudio'

export default function ProductiveFailurePage() {
  // GSAP reveal (per-page motion mandate): the studio rises in on scroll —
  // motionOK-gated; SSR/tests keep the static content.
  const studioRef = useGsapReveal<HTMLDivElement>({ y: 12 })
  return (
    <ClayIn as="div" className="space-y-5">
      <div ref={studioRef}>
        <ProductiveFailureStudio />
      </div>
    </ClayIn>
  )
}
