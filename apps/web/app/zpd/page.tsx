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
import { DynamicAssessmentStudio } from '@/components/DynamicAssessmentStudio'

export default function DynamicAssessmentPage() {
  return (
    <ClayIn as="div" className="min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <DynamicAssessmentStudio />
    </ClayIn>
  )
}
