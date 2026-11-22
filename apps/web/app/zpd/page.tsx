/**
 * Learning HUB — Dynamic Assessment & Zone of Proximal Development Studio Page
 *
 * Route: /zpd
 * Grounded in:
 * - Lev Vygotsky (1978) - Zone of Proximal Development (ZPD = PDL - ADL)
 * - Reuven Feuerstein (1979, 1980) - Structural Cognitive Modifiability & LPAD
 * - Ann Brown & Joseph Campione (1987) - 5-Tier Graduated Prompting Hierarchy
 * - Milton Budoff (1987) - Learning Potential Score (LPS) Gain Ratio
 * - Robert Sternberg & Elena Grigorenko (2002) - Dynamic Testing Paradigm
 */

'use client'

import React from 'react'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { DynamicAssessmentStudio } from '@/components/DynamicAssessmentStudio'

export default function DynamicAssessmentPage() {
  // GSAP reveal (per-page motion mandate): the studio rises in on scroll —
  // motionOK-gated; SSR/tests keep the static content.
  const studioRef = useGsapReveal<HTMLDivElement>({ y: 12 })
  return (
    <ClayIn as="div" className="space-y-5">
      <div ref={studioRef}>
        <DynamicAssessmentStudio />
      </div>
    </ClayIn>
  )
}
