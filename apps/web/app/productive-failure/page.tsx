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
import { ProductiveFailureStudio } from '@/components/ProductiveFailureStudio'

export default function ProductiveFailurePage() {
  return (
    <ClayIn as="div" className="min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <ProductiveFailureStudio />
    </ClayIn>
  )
}
